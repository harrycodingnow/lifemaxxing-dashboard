// @vitest-environment node
//
// Tests for /api/links + /api/links/[id]. We hit POST with both 'url' and
// 'text' shapes, verify metadata is persisted, idempotent dedupe on same URL,
// status transitions via PATCH, and archive via DELETE (soft, never hard).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup";
import { POST as postLinks, GET as getLinks } from "@/app/api/links/route";
import { PATCH as patchLink, DELETE as deleteLink } from "@/app/api/links/[id]/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { resetDb, getDb } from "../helpers/db";

beforeEach(() => {
  resetDb();
  server.resetHandlers();
});
afterEach(() => server.resetHandlers());

describe("POST /api/links", () => {
  it("400 when neither url nor text contains a URL", async () => {
    const res = await postLinks(makeRequest("/api/links", { method: "POST", body: {} }));
    expect(res.status).toBe(400);
  });

  it("saves a YouTube link with oEmbed metadata", async () => {
    server.use(
      http.get("https://www.youtube.com/oembed", () =>
        HttpResponse.json({
          title: "Mocked YT Title",
          author_name: "Mocked Channel",
          thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        }),
      ),
      http.get("https://youtu.be/abc", () => HttpResponse.html("<html></html>")),
    );
    const res = await postLinks(
      makeRequest("/api/links", { method: "POST", body: { url: "https://youtu.be/abc" } }),
    );
    expect(res.status).toBe(200);
    const j = await jsonOf(res);
    expect(j.kind).toBe("link.saved");
    expect(j.row.kind).toBe("youtube");
    expect(j.row.title).toBe("Mocked YT Title");
    expect(j.row.author).toBe("Mocked Channel");
    expect(j.row.status).toBe("unread");
    // Persisted
    const stored = getDb().prepare("SELECT COUNT(*) AS n FROM saved_links").get() as { n: number };
    expect(stored.n).toBe(1);
  });

  it("idempotent: re-POSTing the same URL returns the existing row + duplicate flag", async () => {
    server.use(
      http.get("https://example.com/article-1", () =>
        HttpResponse.html(`<html><head><title>Hi</title><meta property="og:title" content="Hi"></head></html>`),
      ),
    );
    const url = "https://example.com/article-1";
    const r1 = await postLinks(makeRequest("/api/links", { method: "POST", body: { url } }));
    const j1 = await jsonOf(r1);
    const r2 = await postLinks(makeRequest("/api/links", { method: "POST", body: { url } }));
    const j2 = await jsonOf(r2);
    expect(j2.duplicate).toBe(true);
    expect(j2.row.id).toBe(j1.row.id);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM saved_links").get()).toEqual({ n: 1 });
  });

  it("extracts URL from text + captures leftover as note", async () => {
    server.use(
      http.get("https://example.com/foo", () =>
        HttpResponse.html(`<html><head><meta property="og:title" content="X"></head></html>`),
      ),
    );
    const res = await postLinks(
      makeRequest("/api/links", {
        method: "POST",
        body: { text: "watch later https://example.com/foo for context" },
      }),
    );
    const j = await jsonOf(res);
    expect(j.row.url).toBe("https://example.com/foo");
    expect(j.row.note).toMatch(/watch later/);
  });
});

describe("GET /api/links", () => {
  it("filters by status (default unread)", async () => {
    const now = Date.now();
    getDb().prepare(`
      INSERT INTO saved_links (added_at, url, kind, title, status)
      VALUES (?, ?, 'article', 'A', 'unread'),
             (?, ?, 'article', 'B', 'reading'),
             (?, ?, 'article', 'C', 'done')
    `).run(now, "https://a.test/", now - 1, "https://b.test/", now - 2, "https://c.test/");

    const def = await jsonOf(await getLinks(makeRequest("/api/links")));
    expect(def.rows.map((r: { title: string }) => r.title)).toEqual(["A"]);

    const all = await jsonOf(await getLinks(makeRequest("/api/links?status=all")));
    expect(all.rows.length).toBe(3);

    const reading = await jsonOf(await getLinks(makeRequest("/api/links?status=reading")));
    expect(reading.rows.map((r: { title: string }) => r.title)).toEqual(["B"]);
  });

  it("excludes archived rows even when status=all", async () => {
    const now = Date.now();
    getDb().prepare(`
      INSERT INTO saved_links (added_at, url, kind, title, status, archived_at)
      VALUES (?, ?, 'article', 'live', 'unread', NULL),
             (?, ?, 'article', 'gone', 'unread', ?)
    `).run(now, "https://live.test/", now, "https://gone.test/", now);
    const j = await jsonOf(await getLinks(makeRequest("/api/links?status=all")));
    expect(j.rows.map((r: { title: string }) => r.title)).toEqual(["live"]);
  });
});

describe("PATCH /api/links/[id]", () => {
  function ins(status: string = "unread"): number {
    const info = getDb().prepare(`
      INSERT INTO saved_links (added_at, url, kind, title, status)
      VALUES (?, 'https://x.test/', 'article', 'X', ?)
    `).run(Date.now(), status);
    return Number(info.lastInsertRowid);
  }

  it("400 on bad id", async () => {
    const res = await patchLink(
      makeRequest("/api/links/abc", { method: "PATCH", body: { status: "done" } }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 on invalid status", async () => {
    const id = ins();
    const res = await patchLink(
      makeRequest(`/api/links/${id}`, { method: "PATCH", body: { status: "bogus" } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(res.status).toBe(400);
  });

  it("transitions status to reading + stamps opened_at", async () => {
    const id = ins("unread");
    const before = Date.now();
    const res = await patchLink(
      makeRequest(`/api/links/${id}`, { method: "PATCH", body: { status: "reading" } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    const j = await jsonOf(res);
    expect(j.row.status).toBe("reading");
    expect(j.row.opened_at).toBeGreaterThanOrEqual(before);
  });

  it("does not overwrite opened_at on subsequent transitions", async () => {
    const id = ins("unread");
    const r1 = await patchLink(
      makeRequest(`/api/links/${id}`, { method: "PATCH", body: { status: "reading" } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    const opened = (await jsonOf(r1)).row.opened_at as number;
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await patchLink(
      makeRequest(`/api/links/${id}`, { method: "PATCH", body: { status: "done" } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    const j2 = await jsonOf(r2);
    expect(j2.row.status).toBe("done");
    expect(j2.row.opened_at).toBe(opened);
  });

  it("archive=true sets archived_at + 404 on subsequent PATCH", async () => {
    const id = ins();
    await patchLink(
      makeRequest(`/api/links/${id}`, { method: "PATCH", body: { archive: true } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    const r = await patchLink(
      makeRequest(`/api/links/${id}`, { method: "PATCH", body: { status: "done" } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(r.status).toBe(404);
  });
});

describe("DELETE /api/links/[id] is a soft archive (SOUL)", () => {
  it("sets archived_at, row physically remains in the table", async () => {
    const info = getDb().prepare(`
      INSERT INTO saved_links (added_at, url, kind, title, status)
      VALUES (?, 'https://soft.test/', 'article', 'soft', 'unread')
    `).run(Date.now());
    const id = Number(info.lastInsertRowid);

    const res = await deleteLink(makeRequest(`/api/links/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: String(id) }),
    });
    const j = await jsonOf(res);
    expect(j.ok).toBe(true);
    expect(j.soft).toBe(true);

    const row = getDb().prepare(
      "SELECT id, archived_at FROM saved_links WHERE id = ?",
    ).get(id) as { id: number; archived_at: number };
    expect(row.id).toBe(id);
    expect(row.archived_at).toBeGreaterThan(0);
  });
});
