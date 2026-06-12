import { NextResponse } from "next/server";
import { buildAuthorizeUrl, isConfigured } from "@/lib/spotify";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kick off the Spotify Authorization Code flow: redirect the browser to the
// Spotify consent screen. A random state is set as a short-lived cookie and
// verified in the callback (CSRF guard).
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Spotify not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local." },
      { status: 503 },
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
