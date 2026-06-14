import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl, isConfigured } from "@/lib/spotify";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kick off the Spotify Authorization Code flow: redirect the browser to the
// Spotify consent screen. A random state is set as a short-lived cookie and
// verified in the callback (CSRF guard).
//
// Important: Spotify's loopback redirect URI MUST use 127.0.0.1 (not
// "localhost"). Browsers treat localhost and 127.0.0.1 as different hosts for
// cookie purposes, so if the user opens the dashboard at localhost:3000 the
// state cookie set here would not be sent to the 127.0.0.1 callback → we'd
// always fail with bad_state. Detect that and bounce to the same path on
// 127.0.0.1 first so the entire OAuth dance happens on one host.
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Spotify not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local." },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  if (url.hostname === "localhost") {
    const bounce = new URL(url.toString());
    bounce.hostname = "127.0.0.1";
    return NextResponse.redirect(bounce);
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
