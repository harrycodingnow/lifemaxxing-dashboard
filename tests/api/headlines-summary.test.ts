// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { setHermesResponder, resetHermesResponder } from "../helpers/hermes";

// The summary route imports fetchHeadlines from the sibling headlines route,
// which fetches RSS feeds — stub those with a deterministic XML so the tests
// don't depend on the live network.
function stubFeeds() {
  global.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes("dowjones") || u.includes("yahoo")) {
      return new Response(
        `<rss><channel><item><title>Markets pop on Fed pivot</title><link>m1</link></item></channel></rss>`,
        { status: 200 },
      );
    }
    if (
      u.includes("techcrunch") ||
      u.includes("arstechnica") ||
      u.includes("engadget") ||
      u.includes("topic/TECHNOLOGY")
    ) {
      return new Response(
        `<rss><channel><item><title>Tech AI breakthrough</title><link>tc1</link></item></channel></rss>`,
        { status: 200 },
      );
    }
    if (u.includes("topic/WORLD")) {
      return new Response(
        `<rss><channel><item><title>World thing happens - Reuters</title><link>g1</link><source url="https://reuters.com">Reuters</source></item></channel></rss>`,
        { status: 200 },
      );
    }
    return new Response(
      `<rss><channel><item><title>Other</title><link>o1</link></item></channel></rss>`,
      { status: 200 },
    );
  }) as any;
}

describe("headlines summary", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    resetHermesResponder();
    vi.resetModules();
    stubFeeds();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("?category=tech,markets sends only Tech+Markets headlines into the prompt", async () => {
    let received = "";
    setHermesResponder((p) => {
      received = p;
      return "AI briefing for focus mix.";
    });
    const mod = await import("@/app/api/headlines/summary/route");
    const res = await mod.GET(makeRequest("/api/headlines/summary?category=tech,markets"));
    const j = await jsonOf(res);
    expect(j.summary).toContain("focus mix");
    // The prompt embeds a compact JSON of {title,source,category}.
    expect(received).toContain('"category": "Tech"');
    expect(received).toContain('"category": "Markets"');
    expect(received).not.toContain('"category": "World"');
    expect(received).not.toContain('"category": "Taiwan"');
  });

  it("caches per-category key — tech,markets and markets,tech share the same slot", async () => {
    let calls = 0;
    setHermesResponder(() => {
      calls += 1;
      return `briefing #${calls}`;
    });
    const mod = await import("@/app/api/headlines/summary/route");

    const r1 = await jsonOf(await mod.GET(makeRequest("/api/headlines/summary?category=tech,markets")));
    expect(r1.summary).toBe("briefing #1");
    expect(r1.cached).toBe(false);

    // Same set, different order in the URL → must hit the cache.
    const r2 = await jsonOf(await mod.GET(makeRequest("/api/headlines/summary?category=markets,tech")));
    expect(r2.summary).toBe("briefing #1");
    expect(r2.cached).toBe(true);
    expect(calls).toBe(1);
  });

  it("returns an error payload (but not a 500) when no headlines match the filter", async () => {
    setHermesResponder(() => "should not be called");
    const mod = await import("@/app/api/headlines/summary/route");
    const res = await mod.GET(makeRequest("/api/headlines/summary?category=nonexistent"));
    const j = await jsonOf(res);
    expect(j.summary).toBeNull();
    expect(j.error).toContain("no headlines");
  });
});
