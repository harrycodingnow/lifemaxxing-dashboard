// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET as listGET } from "@/app/api/widgets/route";
import { POST as generatePOST } from "@/app/api/widgets/generate/route";
import { PATCH, DELETE } from "@/app/api/widgets/[id]/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { resetDb, getDb } from "../helpers/db";
import { setHermesResponder, resetHermesResponder } from "../helpers/hermes";

const GOOD_HERMES_OUTPUT = `Sure! Here's your widget.

\`\`\`json
{"title": "Pomodoro"}
\`\`\`

\`\`\`html
<!doctype html>
<html><head><meta charset="utf-8"><style>body{background:transparent;color:#e4e4e7}</style></head>
<body><h1 id="t">25:00</h1><script>let s=1500;setInterval(()=>{s--;},1000)</script></body></html>
\`\`\``;

function idParam(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe("custom widgets", () => {
  beforeEach(() => resetDb());
  afterEach(() => resetHermesResponder());

  it("lists empty when none exist", async () => {
    const json = await jsonOf(await listGET());
    expect(json.widgets).toEqual([]);
  });

  it("generate: parses title + html from hermes, persists, returns the row", async () => {
    setHermesResponder(() => GOOD_HERMES_OUTPUT);
    const res = await generatePOST(
      makeRequest("/api/widgets/generate", { method: "POST", body: { prompt: "a pomodoro timer" } }),
    );
    const json = await jsonOf(res);
    expect(json.widget).toBeTruthy();
    expect(json.widget.title).toBe("Pomodoro");
    expect(json.widget.html).toContain("<!doctype html>");
    expect(json.widget.html).toContain("25:00");
    expect(json.widget.prompt).toBe("a pomodoro timer");

    // and it now shows up in the list
    const list = await jsonOf(await listGET());
    expect(list.widgets).toHaveLength(1);
    expect(list.widgets[0].title).toBe("Pomodoro");
  });

  it("generate: strips external <script src> as defense-in-depth", async () => {
    setHermesResponder(
      () => `\`\`\`json
{"title":"Bad"}
\`\`\`
\`\`\`html
<!doctype html><html><body><script src="https://evil.example/x.js"></script><p>hi</p></body></html>
\`\`\``,
    );
    const json = await jsonOf(
      await generatePOST(makeRequest("/api/widgets/generate", { method: "POST", body: { prompt: "x" } })),
    );
    expect(json.widget.html).not.toContain("<script src=");
    expect(json.widget.html).toContain("data-blocked-src=");
  });

  it("generate: rejects empty prompt", async () => {
    const res = await generatePOST(
      makeRequest("/api/widgets/generate", { method: "POST", body: { prompt: "  " } }),
    );
    expect(res.status).toBe(400);
  });

  it("generate: 422 when hermes returns no HTML document", async () => {
    setHermesResponder(() => "I cannot do that.");
    const res = await generatePOST(
      makeRequest("/api/widgets/generate", { method: "POST", body: { prompt: "x" } }),
    );
    expect(res.status).toBe(422);
  });

  it("PATCH updates title + size", async () => {
    setHermesResponder(() => GOOD_HERMES_OUTPUT);
    const created = await jsonOf(
      await generatePOST(makeRequest("/api/widgets/generate", { method: "POST", body: { prompt: "x" } })),
    );
    const id = created.widget.id;
    const patched = await jsonOf(
      await PATCH(makeRequest(`/api/widgets/${id}`, { method: "PATCH", body: { title: "Renamed", w: 6 } }), idParam(id)),
    );
    expect(patched.widget.title).toBe("Renamed");
    expect(patched.widget.w).toBe(6);
  });

  it("DELETE soft-archives (row remains, drops out of list)", async () => {
    setHermesResponder(() => GOOD_HERMES_OUTPUT);
    const created = await jsonOf(
      await generatePOST(makeRequest("/api/widgets/generate", { method: "POST", body: { prompt: "x" } })),
    );
    const id = created.widget.id;
    await DELETE(makeRequest(`/api/widgets/${id}`, { method: "DELETE" }), idParam(id));

    // gone from active list
    const list = await jsonOf(await listGET());
    expect(list.widgets).toHaveLength(0);
    // but the row still exists (soft delete — SOUL: no hard deletes)
    const row = getDb().prepare("SELECT archived_at FROM custom_widgets WHERE id = ?").get(id) as {
      archived_at: number | null;
    };
    expect(row).toBeTruthy();
    expect(row.archived_at).toBeGreaterThan(0);
  });
});
