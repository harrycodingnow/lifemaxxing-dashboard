import { NextResponse } from "next/server";
import { clearTokens } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disconnect Spotify — blanks the stored tokens (no DB row delete, per SOUL).
export async function POST() {
  clearTokens();
  return NextResponse.json({ ok: true, connected: false });
}
