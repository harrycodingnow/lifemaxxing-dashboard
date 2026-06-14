// @vitest-environment node
//
// Spotify playback control — route + lib coverage.
//
// We don't mock fetch directly: MSW handlers in tests/setup.ts already throw on
// any unhandled URL, so we register Spotify API matchers per test via server.use().
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { POST as controlPOST } from "@/app/api/spotify/control/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { resetDb, getDb } from "../helpers/db";
import { server } from "../setup";

// Seed the settings KV with valid-looking tokens so isConnected() returns true
// and getValidAccessToken() doesn't try to refresh.
function seedSpotifyTokens(opts: { expired?: boolean } = {}) {
  const db = getDb();
  const expiresAt = opts.expired ? Date.now() - 60_000 : Date.now() + 60 * 60_000;
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`).run(
    "spotify.access_token",
    "fake-access-token",
  );
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`).run(
    "spotify.refresh_token",
    "fake-refresh-token",
  );
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`).run(
    "spotify.expires_at",
    String(expiresAt),
  );
}

beforeEach(() => {
  resetDb();
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
});

describe("POST /api/spotify/control", () => {
  it("503 when not configured", async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "next" } }),
    );
    expect(res.status).toBe(503);
    expect((await jsonOf(res)).error).toBe("not_configured");
  });

  it("401 when configured but not connected", async () => {
    // No tokens in DB.
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "next" } }),
    );
    expect(res.status).toBe(401);
    expect((await jsonOf(res)).error).toBe("not_connected");
  });

  it("400 for unknown action", async () => {
    seedSpotifyTokens();
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "explode" } }),
    );
    expect(res.status).toBe(400);
    const j = await jsonOf(res);
    expect(j.error).toBe("bad_action");
    expect(j.allowed).toContain("next");
  });

  it("400 for bad volume value", async () => {
    seedSpotifyTokens();
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "volume", value: "loud" } }),
    );
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toBe("bad_value");
  });

  it("400 for bad shuffle value", async () => {
    seedSpotifyTokens();
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "shuffle", value: "on" } }),
    );
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toBe("bad_value");
  });

  it("400 for bad repeat value", async () => {
    seedSpotifyTokens();
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "repeat", value: "forever" } }),
    );
    expect(res.status).toBe(400);
  });

  it("next: POSTs Spotify /me/player/next and returns ok", async () => {
    seedSpotifyTokens();
    let called = 0;
    let calledMethod = "";
    server.use(
      http.post("https://api.spotify.com/v1/me/player/next", ({ request }) => {
        called++;
        calledMethod = request.method;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "next" } }),
    );
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).ok).toBe(true);
    expect(called).toBe(1);
    expect(calledMethod).toBe("POST");
  });

  it("previous: aliases prev and POSTs Spotify /me/player/previous", async () => {
    seedSpotifyTokens();
    let called = 0;
    server.use(
      http.post("https://api.spotify.com/v1/me/player/previous", () => {
        called++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "prev" } }),
    );
    expect(res.status).toBe(200);
    expect(called).toBe(1);
  });

  it("play: PUTs Spotify /me/player/play", async () => {
    seedSpotifyTokens();
    let called = 0;
    server.use(
      http.put("https://api.spotify.com/v1/me/player/play", () => {
        called++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "play" } }),
    );
    expect(res.status).toBe(200);
    expect(called).toBe(1);
  });

  it("pause: PUTs Spotify /me/player/pause", async () => {
    seedSpotifyTokens();
    let called = 0;
    server.use(
      http.put("https://api.spotify.com/v1/me/player/pause", () => {
        called++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "pause" } }),
    );
    expect(res.status).toBe(200);
    expect(called).toBe(1);
  });

  it("toggle: reads currently-playing and calls pause when playing", async () => {
    seedSpotifyTokens();
    let pausedCount = 0;
    let playedCount = 0;
    server.use(
      http.get("https://api.spotify.com/v1/me/player/currently-playing", () =>
        HttpResponse.json({
          is_playing: true,
          progress_ms: 1000,
          item: {
            name: "Test", duration_ms: 200_000,
            artists: [{ name: "A" }], album: { name: "B", images: [] },
            external_urls: { spotify: "https://open.spotify.com/track/x" },
          },
        }),
      ),
      http.put("https://api.spotify.com/v1/me/player/pause", () => {
        pausedCount++;
        return new HttpResponse(null, { status: 204 });
      }),
      http.put("https://api.spotify.com/v1/me/player/play", () => {
        playedCount++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "toggle" } }),
    );
    expect(res.status).toBe(200);
    expect(pausedCount).toBe(1);
    expect(playedCount).toBe(0);
  });

  it("toggle: calls play when paused (currently-playing returns 204)", async () => {
    seedSpotifyTokens();
    let pausedCount = 0;
    let playedCount = 0;
    server.use(
      http.get("https://api.spotify.com/v1/me/player/currently-playing", () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.put("https://api.spotify.com/v1/me/player/pause", () => {
        pausedCount++;
        return new HttpResponse(null, { status: 204 });
      }),
      http.put("https://api.spotify.com/v1/me/player/play", () => {
        playedCount++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "toggle" } }),
    );
    expect(res.status).toBe(200);
    expect(playedCount).toBe(1);
    expect(pausedCount).toBe(0);
  });

  it("404 from Spotify → 202 with no_active_device hint (still ok=false)", async () => {
    seedSpotifyTokens();
    server.use(
      http.post("https://api.spotify.com/v1/me/player/next", () =>
        HttpResponse.json({ error: { status: 404, message: "Player command failed: No active device found" } }, { status: 404 }),
      ),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "next" } }),
    );
    expect(res.status).toBe(202);
    const j = await jsonOf(res);
    expect(j.ok).toBe(false);
    expect(j.reason).toBe("no_active_device");
  });

  it("403 from Spotify → 403 with premium hint", async () => {
    seedSpotifyTokens();
    server.use(
      http.put("https://api.spotify.com/v1/me/player/pause", () =>
        HttpResponse.json({ error: { status: 403, message: "Premium required" } }, { status: 403 }),
      ),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "pause" } }),
    );
    expect(res.status).toBe(403);
    const j = await jsonOf(res);
    expect(j.hint).toMatch(/Premium/i);
  });

  it("shuffle: passes state=true as query param", async () => {
    seedSpotifyTokens();
    let receivedState: string | null = null;
    server.use(
      http.put("https://api.spotify.com/v1/me/player/shuffle", ({ request }) => {
        receivedState = new URL(request.url).searchParams.get("state");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "shuffle", value: true } }),
    );
    expect(res.status).toBe(200);
    expect(receivedState).toBe("true");
  });

  it("volume: clamps to 0..100 and PUTs volume_percent", async () => {
    seedSpotifyTokens();
    let received: string | null = null;
    server.use(
      http.put("https://api.spotify.com/v1/me/player/volume", ({ request }) => {
        received = new URL(request.url).searchParams.get("volume_percent");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "volume", value: 200 } }),
    );
    expect(res.status).toBe(200);
    expect(received).toBe("100");
  });

  it("401 from Spotify triggers a single token refresh, then retries", async () => {
    seedSpotifyTokens();
    let nextCalls = 0;
    let refreshCalls = 0;
    server.use(
      http.post("https://accounts.spotify.com/api/token", async () => {
        refreshCalls++;
        return HttpResponse.json({
          access_token: "refreshed-token",
          refresh_token: "fake-refresh-token",
          expires_in: 3600,
        });
      }),
      http.post("https://api.spotify.com/v1/me/player/next", ({ request }) => {
        nextCalls++;
        const auth = request.headers.get("authorization") || "";
        if (auth.includes("refreshed-token")) {
          return new HttpResponse(null, { status: 204 });
        }
        return HttpResponse.json({ error: { status: 401, message: "Token expired" } }, { status: 401 });
      }),
    );
    const res = await controlPOST(
      makeRequest("/api/spotify/control", { method: "POST", body: { action: "next" } }),
    );
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(nextCalls).toBe(2);
  });
});
