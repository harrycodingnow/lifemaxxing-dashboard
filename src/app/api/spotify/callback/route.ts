import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Spotify redirects here with ?code & ?state. Verify state, exchange the code
// for tokens, then bounce back to the dashboard.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieState = req.cookies.get("spotify_oauth_state")?.value;

  const home = new URL("/", url.origin);

  if (error) {
    home.searchParams.set("spotify", "denied");
    return NextResponse.redirect(home);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    home.searchParams.set("spotify", "bad_state");
    return NextResponse.redirect(home);
  }

  try {
    await exchangeCodeForTokens(code);
    home.searchParams.set("spotify", "connected");
  } catch {
    home.searchParams.set("spotify", "error");
  }
  const res = NextResponse.redirect(home);
  res.cookies.set("spotify_oauth_state", "", { maxAge: 0, path: "/" });
  return res;
}
