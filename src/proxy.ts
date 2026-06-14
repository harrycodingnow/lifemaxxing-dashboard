import { NextResponse, type NextRequest } from "next/server";

// Force the entire dashboard onto 127.0.0.1 so Spotify's OAuth round-trip stays
// on ONE host. Spotify rewrites the post-auth callback to the host the user
// was on when they hit "Agree", so if a tab is open on http://localhost:3000
// the callback comes back to http://localhost:3000/api/spotify/callback —
// which is NOT what we whitelisted on the Spotify Developer Dashboard
// (127.0.0.1 only). Browsers also treat localhost and 127.0.0.1 as different
// hosts for cookie purposes, so the state cookie set during /login wouldn't
// be sent to the /callback on the other host.
//
// We can't use NextResponse.redirect() because Next/Turbopack normalize a
// same-origin absolute Location header down to a relative path, producing an
// infinite redirect loop when the source and target differ only by hostname.
// Instead we return a tiny HTML page that uses both an HTTP-equiv refresh
// (works without JS) and an explicit window.location.replace() (instant when
// JS is on). Browsers honor the full hostname in both forms.
export function proxy(req: NextRequest) {
  const hostHeader = req.headers.get("host") || "";
  const hostOnly = hostHeader.split(":")[0].toLowerCase();
  if (hostOnly === "localhost") {
    const url = new URL(req.url);
    const port = url.port || "3000";
    const target = `http://127.0.0.1:${port}${url.pathname}${url.search}`;
    const html =
      `<!doctype html><html><head>` +
      `<meta http-equiv="refresh" content="0;url=${target}">` +
      `<script>window.location.replace(${JSON.stringify(target)});</script>` +
      `</head><body>` +
      `<p>Redirecting to <a href="${target}">${target}</a>…</p>` +
      `<p style="color:#888;font-size:12px">Spotify OAuth requires 127.0.0.1 (not localhost). ` +
      `Bookmark this address for future visits.</p>` +
      `</body></html>`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};

