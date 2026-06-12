import { NextResponse } from "next/server";
import { getNowPlaying, isConfigured, isConnected } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single endpoint the SpotifyPanel polls. Reports config/connection status plus
// the current track. Never throws to the client — degrades to a status flag.
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ configured: false, connected: false, now: null });
  }
  if (!isConnected()) {
    return NextResponse.json({ configured: true, connected: false, now: null });
  }
  try {
    const now = await getNowPlaying();
    return NextResponse.json({ configured: true, connected: true, now });
  } catch (e) {
    return NextResponse.json({ configured: true, connected: true, now: null, error: (e as Error).message });
  }
}
