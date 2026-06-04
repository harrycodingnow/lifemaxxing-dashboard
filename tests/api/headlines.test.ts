// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseRss, GET } from "@/app/api/headlines/route";

const SAMPLE = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title><![CDATA[Markets rip on Fed pivot]]></title>
    <link>https://example.com/a</link>
  </item>
  <item>
    <title>Plain &amp; simple headline</title>
    <link>https://example.com/b</link>
  </item>
  <item>
    <title>Third &#8212; em dash</title>
    <link>https://example.com/c</link>
  </item>
</channel></rss>`;

describe("headlines parseRss", () => {
  it("extracts CDATA, decodes entities, preserves order", () => {
    const out = parseRss(SAMPLE, "WSJ", 5);
    expect(out.length).toBe(3);
    expect(out[0].title).toBe("Markets rip on Fed pivot");
    expect(out[0].link).toBe("https://example.com/a");
    expect(out[0].source).toBe("WSJ");
    expect(out[1].title).toBe("Plain & simple headline");
    expect(out[2].title).toContain("Third");
  });

  it("respects the limit parameter", () => {
    expect(parseRss(SAMPLE, "X", 2).length).toBe(2);
  });

  it("returns empty array when no <item>", () => {
    expect(parseRss("<rss><channel></channel></rss>", "X")).toEqual([]);
  });
});

describe("headlines GET", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns interleaved headlines from feeds", async () => {
    // Mock both feeds with distinct content
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      const xml = u.includes("dowjones")
        ? `<rss><channel><item><title>WSJ-1</title><link>w1</link></item></channel></rss>`
        : `<rss><channel><item><title>YH-1</title><link>y1</link></item></channel></rss>`;
      return new Response(xml, { status: 200 });
    }) as any;

    // Re-import GET to get a fresh cache
    vi.resetModules();
    const mod = await import("@/app/api/headlines/route");
    const res = await mod.GET();
    const j = await res.json();
    expect(Array.isArray(j.headlines)).toBe(true);
    expect(j.headlines.length).toBeGreaterThan(0);
    const titles = j.headlines.map((h: any) => h.title);
    expect(titles).toContain("WSJ-1");
    expect(titles).toContain("YH-1");
  });

  it("survives a feed failure (returns whatever succeeds)", async () => {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes("yahoo")) throw new Error("network");
      return new Response(`<rss><channel><item><title>ok</title><link>l</link></item></channel></rss>`, { status: 200 });
    }) as any;
    vi.resetModules();
    const mod = await import("@/app/api/headlines/route");
    const res = await mod.GET();
    const j = await res.json();
    expect(j.headlines.length).toBe(1);
    expect(j.headlines[0].title).toBe("ok");
  });
});
