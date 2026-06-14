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

  // Detect the hostname the browser ACTUALLY used. Under Next 16's dev server
  // `new URL(req.url).hostname` is unreliable (often returns "localhost" even
  // when the request hit 127.0.0.1, which previously caused an infinite
  // redirect loop). The Host header is what the client sent — trust that.
  const hostHeader = req.headers.get("host") || "";
  const hostOnly = hostHeader.split(":")[0].toLowerCase();
  if (hostOnly === "localhost") {
    // Forward to 127.0.0.1 once so the OAuth state cookie set below lives on
    // the same host as the callback (Spotify's redirect URI is 127.0.0.1).
    const target = new URL(req.url);
    target.hostname = "127.0.0.1";
    // If req.url's hostname was already 127.0.0.1 (proxying weirdness), bail
    // out of the redirect to avoid a loop.
    if (target.hostname !== "127.0.0.1") {
      return NextResponse.json({ error: "could not rewrite hostname" }, { status: 500 });
    }
    return NextResponse.redirect(target);
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
