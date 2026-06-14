import db from "@/lib/db";

// Spotify OAuth (Authorization Code flow) + now-playing reader for the
// dashboard. Tokens live in the settings KV table (spotify.*). Read-only
// playback scopes — we never mutate the user's playback here.
//
// Setup (one time):
//   1. Create an app at https://developer.spotify.com/dashboard
//   2. Add redirect URI:  http://127.0.0.1:3000/api/spotify/callback
//   3. Put creds in .env.local:
//        SPOTIFY_CLIENT_ID=...
//        SPOTIFY_CLIENT_SECRET=...
//        SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/spotify/callback  (optional override)

export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
].join(" ");

export function getClientId(): string | null {
  return process.env.SPOTIFY_CLIENT_ID || null;
}
export function getClientSecret(): string | null {
  return process.env.SPOTIFY_CLIENT_SECRET || null;
}
export function getRedirectUri(): string {
  return process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/spotify/callback";
}
export function isConfigured(): boolean {
  return !!(getClientId() && getClientSecret());
}

// ── settings KV helpers ─────────────────────────────────────────────────────
function setKV(key: string, value: string) {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
function getKV(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export type SpotifyTokens = { access_token: string; refresh_token: string; expires_at: number };

export function saveTokens(t: { access_token: string; refresh_token?: string; expires_in: number }) {
  setKV("spotify.access_token", t.access_token);
  // Refresh token is only returned on first auth; keep the existing one otherwise.
  if (t.refresh_token) setKV("spotify.refresh_token", t.refresh_token);
  setKV("spotify.expires_at", String(Date.now() + t.expires_in * 1000));
}

export function readTokens(): SpotifyTokens | null {
  const access_token = getKV("spotify.access_token");
  const refresh_token = getKV("spotify.refresh_token");
  const expires_at = Number(getKV("spotify.expires_at") || 0);
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token, expires_at };
}

export function isConnected(): boolean {
  return readTokens() != null;
}

// Mark disconnected without deleting the row (SOUL: no DB deletes) — blank the
// tokens so isConnected() returns false.
export function clearTokens() {
  setKV("spotify.access_token", "");
  setKV("spotify.refresh_token", "");
  setKV("spotify.expires_at", "0");
}

// ── OAuth ────────────────────────────────────────────────────────────────────
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId() || "",
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "false",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64");
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
  saveTokens(j);
}

async function refreshAccessToken(refresh_token: string): Promise<string> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token });
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`token refresh failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  saveTokens(j);
  return j.access_token;
}

// Returns a valid access token, refreshing if it expires within 60s.
export async function getValidAccessToken(): Promise<string | null> {
  const t = readTokens();
  if (!t) return null;
  if (Date.now() < t.expires_at - 60_000) return t.access_token;
  return refreshAccessToken(t.refresh_token);
}

// ── now playing ──────────────────────────────────────────────────────────────
export type NowPlaying = {
  is_playing: boolean;
  track: string | null;
  artists: string | null;
  album: string | null;
  album_art: string | null;
  progress_ms: number | null;
  duration_ms: number | null;
  track_url: string | null;
};

export async function getNowPlaying(): Promise<NowPlaying> {
  const empty: NowPlaying = {
    is_playing: false, track: null, artists: null, album: null,
    album_art: null, progress_ms: null, duration_ms: null, track_url: null,
  };
  const token = await getValidAccessToken();
  if (!token) return empty;

  const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  // 204 = nothing playing
  if (r.status === 204) return empty;
  if (!r.ok) throw new Error(`now-playing failed: ${r.status}`);
  const j = await r.json();
  const item = j?.item;
  if (!item) return { ...empty, is_playing: !!j?.is_playing };

  const images = item.album?.images ?? [];
  const art = images.length ? images[Math.min(1, images.length - 1)].url : null; // medium when available
  return {
    is_playing: !!j.is_playing,
    track: item.name ?? null,
    artists: Array.isArray(item.artists) ? item.artists.map((a: { name: string }) => a.name).join(", ") : null,
    album: item.album?.name ?? null,
    album_art: art,
    progress_ms: typeof j.progress_ms === "number" ? j.progress_ms : null,
    duration_ms: typeof item.duration_ms === "number" ? item.duration_ms : null,
    track_url: item.external_urls?.spotify ?? null,
  };
}

// ── playback control ────────────────────────────────────────────────────────
// Thin wrapper around the Spotify Web API player endpoints. Returns:
//   { ok: true }                           on success
//   { ok: false, status, reason }          on Spotify API error
//   { ok: false, status: 401, ... }        if not connected
// Auto-refreshes the access token on 401 once before giving up.
export type ControlResult =
  | { ok: true; status: number }
  | { ok: false; status: number; reason: string };

async function callSpotify(
  method: "PUT" | "POST" | "GET",
  path: string,
  init: { query?: Record<string, string | number | boolean>; body?: unknown } = {},
): Promise<ControlResult> {
  const doFetch = async (token: string): Promise<Response> => {
    const url = new URL(`https://api.spotify.com/v1${path}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let body: BodyInit | undefined;
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }
    return fetch(url.toString(), { method, headers, body, cache: "no-store" });
  };

  let token = await getValidAccessToken();
  if (!token) return { ok: false, status: 401, reason: "not_connected" };

  let r = await doFetch(token);
  // 401 → token may have just expired between getValidAccessToken's check and the call.
  // Try one forced refresh.
  if (r.status === 401) {
    const stored = readTokens();
    if (stored?.refresh_token) {
      try {
        token = await refreshAccessToken(stored.refresh_token);
        r = await doFetch(token);
      } catch {
        return { ok: false, status: 401, reason: "token_refresh_failed" };
      }
    }
  }

  if (r.ok || r.status === 204) return { ok: true, status: r.status };

  // 404 from player endpoints typically means "no active device".
  let reason = `spotify_${r.status}`;
  if (r.status === 404) reason = "no_active_device";
  else if (r.status === 403) reason = "premium_required_or_forbidden";
  else {
    // Try to surface Spotify's error message if there is one.
    try {
      const j = await r.json();
      if (j?.error?.message) reason = String(j.error.message);
    } catch {
      /* ignore */
    }
  }
  return { ok: false, status: r.status, reason };
}

export async function play(deviceId?: string): Promise<ControlResult> {
  return callSpotify("PUT", "/me/player/play", deviceId ? { query: { device_id: deviceId } } : {});
}
export async function pause(deviceId?: string): Promise<ControlResult> {
  return callSpotify("PUT", "/me/player/pause", deviceId ? { query: { device_id: deviceId } } : {});
}
export async function nextTrack(deviceId?: string): Promise<ControlResult> {
  return callSpotify("POST", "/me/player/next", deviceId ? { query: { device_id: deviceId } } : {});
}
export async function previousTrack(deviceId?: string): Promise<ControlResult> {
  return callSpotify("POST", "/me/player/previous", deviceId ? { query: { device_id: deviceId } } : {});
}
export async function setShuffle(state: boolean, deviceId?: string): Promise<ControlResult> {
  const q: Record<string, string | boolean> = { state };
  if (deviceId) q.device_id = deviceId;
  return callSpotify("PUT", "/me/player/shuffle", { query: q });
}
// state must be one of "off" | "track" | "context"
export async function setRepeat(
  state: "off" | "track" | "context",
  deviceId?: string,
): Promise<ControlResult> {
  const q: Record<string, string> = { state };
  if (deviceId) q.device_id = deviceId;
  return callSpotify("PUT", "/me/player/repeat", { query: q });
}
// volume_percent: 0..100
export async function setVolume(volume_percent: number, deviceId?: string): Promise<ControlResult> {
  const v = Math.max(0, Math.min(100, Math.round(volume_percent)));
  const q: Record<string, string | number> = { volume_percent: v };
  if (deviceId) q.device_id = deviceId;
  return callSpotify("PUT", "/me/player/volume", { query: q });
}
// Toggle play/pause based on current state (read once to decide).
export async function togglePlayback(deviceId?: string): Promise<ControlResult> {
  try {
    const now = await getNowPlaying();
    if (now.is_playing) return pause(deviceId);
    return play(deviceId);
  } catch {
    // If we can't read state, default to play.
    return play(deviceId);
  }
}
