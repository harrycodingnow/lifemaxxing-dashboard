// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseRss, GET } from "@/app/api/headlines/route";
import { makeRequest } from "../helpers/makeRequest";

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

// Google News style: <source> tag + " - Publisher" suffix on the title.
const GNEWS_SAMPLE = `<rss><channel>
  <item>
    <title>Big world event happens - BBC</title>
    <link>https://news.google.com/rss/articles/CBMiABC?oc=5</link>
    <source url="https://bbc.com">BBC</source>
  </item>
  <item>
    <title>Another story - Al Jazeera</title>
    <link>https://news.google.com/rss/articles/CBMiXYZ?oc=5</link>
    <source url="https://aljazeera.com">Al Jazeera</source>
  </item>
</channel></rss>`;

describe("headlines parseRss", () => {
  it("extracts CDATA, decodes entities, preserves order, tags category", () => {
    const out = parseRss(SAMPLE, "WSJ", 5, { category: "Markets" });
    expect(out.length).toBe(3);
    expect(out[0].title).toBe("Markets rip on Fed pivot");
    expect(out[0].link).toBe("https://example.com/a");
    expect(out[0].source).toBe("WSJ");
    expect(out[0].category).toBe("Markets");
    expect(out[1].title).toBe("Plain & simple headline");
    expect(out[2].title).toContain("Third");
  });

  it("respects the limit parameter", () => {
    expect(parseRss(SAMPLE, "X", 2).length).toBe(2);
  });

  it("returns empty array when no <item>", () => {
    expect(parseRss("<rss><channel></channel></rss>", "X")).toEqual([]);
  });

  it("gnews mode: prefers <source> publisher and strips ' - Publisher' suffix", () => {
    const out = parseRss(GNEWS_SAMPLE, "Google News", 5, { category: "World", gnews: true });
    expect(out.length).toBe(2);
    expect(out[0].title).toBe("Big world event happens");
    expect(out[0].source).toBe("BBC");
    expect(out[0].category).toBe("World");
    expect(out[1].source).toBe("Al Jazeera");
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

  it("returns category-tagged headlines from multiple feeds", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      let xml: string;
      if (u.includes("dowjones")) xml = `<rss><channel><item><title>WSJ markets</title><link>w1</link></item></channel></rss>`;
      else if (u.includes("topic/WORLD")) xml = `<rss><channel><item><title>World news - Reuters</title><link>g1</link><source url="https://reuters.com">Reuters</source></item></channel></rss>`;
      else if (u.includes("geo/Taiwan")) xml = `<rss><channel><item><title>台灣新聞 - UDN</title><link>t1</link><source url="https://udn.com">UDN</source></item></channel></rss>`;
      else xml = `<rss><channel><item><title>Other</title><link>o1</link></item></channel></rss>`;
      return new Response(xml, { status: 200 });
    }) as any;

    vi.resetModules();
    const mod = await import("@/app/api/headlines/route");
    const res = await mod.GET(makeRequest("/api/headlines"));
    const j = await res.json();
    expect(Array.isArray(j.headlines)).toBe(true);
    expect(j.headlines.length).toBeGreaterThan(0);
    const cats = new Set(j.headlines.map((h: any) => h.category));
    expect(cats.has("World")).toBe(true);
    expect(cats.has("Taiwan")).toBe(true);
    expect(Array.isArray(j.categories)).toBe(true);
    // gnews publisher cleaned
    const world = j.headlines.find((h: any) => h.category === "World");
    expect(world.source).toBe("Reuters");
    expect(world.title).toBe("World news");
  });

  it("?category= filters to a single category", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      const xml = u.includes("geo/Taiwan")
        ? `<rss><channel><item><title>TW story - UDN</title><link>t1</link><source url="https://udn.com">UDN</source></item></channel></rss>`
        : `<rss><channel><item><title>US story</title><link>u1</link></item></channel></rss>`;
      return new Response(xml, { status: 200 });
    }) as any;
    vi.resetModules();
    const mod = await import("@/app/api/headlines/route");
    const res = await mod.GET(makeRequest("/api/headlines?category=taiwan"));
    const j = await res.json();
    expect(j.headlines.length).toBeGreaterThan(0);
    expect(j.headlines.every((h: any) => h.category === "Taiwan")).toBe(true);
  });

  it("?category=tech,markets returns the union of those categories", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      // Stub out every feed with the expected category so each contributes to the union.
      if (u.includes("dowjones") || u.includes("yahoo")) {
        return new Response(`<rss><channel><item><title>Markets story</title><link>m1</link></item></channel></rss>`, { status: 200 });
      }
      if (u.includes("techcrunch") || u.includes("arstechnica") || u.includes("engadget") || u.includes("topic/TECHNOLOGY")) {
        return new Response(`<rss><channel><item><title>Tech story</title><link>tc1</link></item></channel></rss>`, { status: 200 });
      }
      if (u.includes("topic/WORLD")) {
        return new Response(`<rss><channel><item><title>World news - Reuters</title><link>g1</link><source url="https://reuters.com">Reuters</source></item></channel></rss>`, { status: 200 });
      }
      // Everything else: a non-Focus story so the filter has something to discard.
      return new Response(`<rss><channel><item><title>Other</title><link>o1</link></item></channel></rss>`, { status: 200 });
    }) as any;
    vi.resetModules();
    const mod = await import("@/app/api/headlines/route");
    const res = await mod.GET(makeRequest("/api/headlines?category=tech,markets"));
    const j = await res.json();
    expect(j.headlines.length).toBeGreaterThan(0);
    const cats = new Set(j.headlines.map((h: any) => h.category));
    expect(cats.has("Tech")).toBe(true);
    expect(cats.has("Markets")).toBe(true);
    expect(cats.has("World")).toBe(false);
    expect(cats.has("Taiwan")).toBe(false);
  });

  it("parseCategoryParam handles single, multi, blank, and whitespace inputs", async () => {
    const { parseCategoryParam } = await import("@/app/api/headlines/route");
    expect(parseCategoryParam(null)).toBeNull();
    expect(parseCategoryParam("")).toBeNull();
    expect(parseCategoryParam("   ")).toBeNull();
    expect(parseCategoryParam("tech")).toEqual(new Set(["tech"]));
    expect(parseCategoryParam("Tech, Markets ")).toEqual(new Set(["tech", "markets"]));
    expect(parseCategoryParam(",,tech,,,markets,,")).toEqual(new Set(["tech", "markets"]));
  });

  it("survives a feed failure (returns whatever succeeds)", async () => {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes("dowjones")) throw new Error("network");
      return new Response(`<rss><channel><item><title>ok</title><link>l</link></item></channel></rss>`, { status: 200 });
    }) as any;
    vi.resetModules();
    const mod = await import("@/app/api/headlines/route");
    const res = await mod.GET(makeRequest("/api/headlines"));
    const j = await res.json();
    expect(j.headlines.length).toBeGreaterThan(0);
  });
});
