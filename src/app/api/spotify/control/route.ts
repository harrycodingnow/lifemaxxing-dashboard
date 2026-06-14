import { NextRequest, NextResponse } from "next/server";
import {
  isConfigured,
  isConnected,
  play,
  pause,
  nextTrack,
  previousTrack,
  setShuffle,
  setRepeat,
  setVolume,
  togglePlayback,
} from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/spotify/control
// Body: { action: "play" | "pause" | "toggle" | "next" | "previous"
//                | "shuffle" | "repeat" | "volume",
//          value?: boolean | "off" | "track" | "context" | number,
//          device_id?: string }
//
// Returns:
//   200 { ok: true }                       on success
//   202 { ok: true, note: "no_active_device", ... }
//                                          (Spotify replied 404 — still "ok" from the client's POV,
//                                          we just tell them to open the Spotify app on a device)
//   400 { error: "bad_action" | "bad_value" }
//   401 { error: "not_connected" }
//   503 { error: "not_configured" }
//   502 { error: "...spotify reason..." }
export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!isConnected()) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let body: { action?: string; value?: unknown; device_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").toLowerCase();
  const deviceId = typeof body.device_id === "string" && body.device_id ? body.device_id : undefined;

  let result;
  switch (action) {
    case "play":
      result = await play(deviceId);
      break;
    case "pause":
      result = await pause(deviceId);
      break;
    case "toggle":
      result = await togglePlayback(deviceId);
      break;
    case "next":
      result = await nextTrack(deviceId);
      break;
    case "previous":
    case "prev":
      result = await previousTrack(deviceId);
      break;
    case "shuffle": {
      if (typeof body.value !== "boolean") {
        return NextResponse.json({ error: "bad_value", expected: "boolean" }, { status: 400 });
      }
      result = await setShuffle(body.value, deviceId);
      break;
    }
    case "repeat": {
      const v = body.value;
      if (v !== "off" && v !== "track" && v !== "context") {
        return NextResponse.json(
          { error: "bad_value", expected: "off|track|context" },
          { status: 400 },
        );
      }
      result = await setRepeat(v, deviceId);
      break;
    }
    case "volume": {
      const v = body.value;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return NextResponse.json({ error: "bad_value", expected: "number 0..100" }, { status: 400 });
      }
      result = await setVolume(v, deviceId);
      break;
    }
    default:
      return NextResponse.json(
        {
          error: "bad_action",
          allowed: ["play", "pause", "toggle", "next", "previous", "shuffle", "repeat", "volume"],
        },
        { status: 400 },
      );
  }

  if (result.ok) {
    return NextResponse.json({ ok: true, action });
  }
  if (result.status === 404 || result.reason === "no_active_device") {
    return NextResponse.json(
      { ok: false, reason: "no_active_device", hint: "Open the Spotify app on any device first." },
      { status: 202 },
    );
  }
  if (result.status === 401) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }
  if (result.status === 403) {
    return NextResponse.json(
      { error: result.reason, hint: "Spotify Premium is required for playback control." },
      { status: 403 },
    );
  }
  return NextResponse.json({ error: result.reason }, { status: 502 });
}
