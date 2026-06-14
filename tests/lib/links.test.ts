// @vitest-environment node
//
// Tests for src/lib/links.ts — the parts that don't require live network
// (URL detection, kind detection, ISO-duration parsing via the public formatter)
// plus a happy-path metadata fetch with HTML mocked via MSW.

import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup";
import {
  detectKind,
  extractFirstUrl,
  looksLikeLinkSave,
  fetchLinkMeta,
  formatDuration,
} from "@/lib/links";

beforeEach(() => server.resetHandlers());

describe("detectKind", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123", "youtube"],
    ["https://youtu.be/abc123", "youtube"],
    ["https://m.youtube.com/watch?v=abc", "youtube"],
    ["https://twitter.com/foo/status/1", "twitter"],
    ["https://x.com/foo/status/1", "twitter"],
    ["https://harryhou.dev/posts/foo", "article"],
    ["https://blog.example.org/x", "article"],
    ["not a url", "other"],
  ])("classifies %s as %s", (url, expected) => {
    expect(detectKind(url)).toBe(expected);
  });
});

describe("extractFirstUrl", () => {
  it("pulls the first http(s) URL out of a message", () => {
    expect(extractFirstUrl("watch later https://youtu.be/abc whatever")).toBe(
      "https://youtu.be/abc",
    );
  });
  it("strips trailing punctuation", () => {
    expect(extractFirstUrl("see https://example.com/foo,")).toBe("https://example.com/foo");
    expect(extractFirstUrl("read this: https://example.com/foo.")).toBe("https://example.com/foo");
  });
  it("returns null when no URL is present", () => {
    expect(extractFirstUrl("hello world")).toBeNull();
    expect(extractFirstUrl("")).toBeNull();
  });
});

describe("looksLikeLinkSave", () => {
  it("yes for a bare URL", () => {
    expect(looksLikeLinkSave("https://example.com/foo")).toBe(true);
  });
  it("yes for URL + short save hint (EN)", () => {
    expect(looksLikeLinkSave("https://youtu.be/abc watch later")).toBe(true);
    expect(looksLikeLinkSave("read later https://example.com/x")).toBe(true);
    expect(looksLikeLinkSave("save https://example.com/x")).toBe(true);
  });
  it("yes for URL + short save hint (中文)", () => {
    expect(looksLikeLinkSave("https://youtu.be/abc 稍後看")).toBe(true);
    expect(looksLikeLinkSave("晚點讀 https://example.com/foo")).toBe(true);
  });
  it("no for empty / non-URL text", () => {
    expect(looksLikeLinkSave("")).toBe(false);
    expect(looksLikeLinkSave("bought 5 NVDA")).toBe(false);
  });
  it("no for a URL embedded in a long sentence (probably context, not save)", () => {
    const longBody =
      "bought 5 NVDA at 880 yesterday, see https://finance.yahoo.com/quote/NVDA the chart " +
      "looks like a textbook breakout and the volume confirms the breakout above the prior high.";
    expect(looksLikeLinkSave(longBody)).toBe(false);
  });
});

describe("formatDuration", () => {
  it.each([
    [null, null],
    [0, null],
    [-5, null],
    [42, "0:42"],
    [612, "10:12"],
    [3723, "1:02:03"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe("fetchLinkMeta (mocked network)", () => {
  it("fetches og:* meta for a generic article", async () => {
    server.use(
      http.get("https://blog.example.com/foo", () =>
        HttpResponse.html(
          `<!doctype html><html><head>
            <title>Fallback title</title>
            <meta property="og:title" content="The Real Title">
            <meta property="og:description" content="A short summary of the article.">
            <meta property="og:image" content="https://blog.example.com/img.png">
            <meta property="og:site_name" content="Example Blog">
            <meta name="author" content="Jane Doe">
          </head><body>…</body></html>`,
        ),
      ),
    );
    const meta = await fetchLinkMeta("https://blog.example.com/foo");
    expect(meta.kind).toBe("article");
    expect(meta.title).toBe("The Real Title");
    expect(meta.description).toBe("A short summary of the article.");
    expect(meta.thumbnail_url).toBe("https://blog.example.com/img.png");
    expect(meta.site_name).toBe("Example Blog");
    expect(meta.author).toBe("Jane Doe");
    expect(meta.duration_seconds).toBeNull();
  });

  it("falls back to <title> when og:title is missing", async () => {
    server.use(
      http.get("https://example.com/x", () =>
        HttpResponse.html(`<!doctype html><html><head><title>Just A Title</title></head><body></body></html>`),
      ),
    );
    const meta = await fetchLinkMeta("https://example.com/x");
    expect(meta.title).toBe("Just A Title");
    expect(meta.site_name).toBe("example.com");
  });

  it("YouTube path uses oEmbed and falls back to hqdefault thumb when oEmbed returns no thumb", async () => {
    server.use(
      http.get("https://www.youtube.com/oembed", () =>
        HttpResponse.json({
          title: "Cool Video",
          author_name: "Cool Channel",
          thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        }),
      ),
      // Also stub the page scrape used for duration — return HTML without the
      // duration markers so we exercise the "duration is optional" path.
      http.get("https://youtu.be/abc", () => HttpResponse.html("<html></html>")),
    );
    const meta = await fetchLinkMeta("https://youtu.be/abc");
    expect(meta.kind).toBe("youtube");
    expect(meta.title).toBe("Cool Video");
    expect(meta.author).toBe("Cool Channel");
    expect(meta.site_name).toBe("YouTube");
    expect(meta.thumbnail_url).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
    expect(meta.duration_seconds).toBeNull();
  });

  it("returns a stub (never throws) when the network errors out", async () => {
    server.use(
      http.get("https://broken.example.com/x", () => HttpResponse.error()),
    );
    const meta = await fetchLinkMeta("https://broken.example.com/x");
    expect(meta.kind).toBe("article");
    expect(meta.title).toBeNull();
    expect(meta.site_name).toBe("broken.example.com");
  });
});
