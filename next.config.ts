import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 dev mode blocks cross-origin asset requests from origins other
  // than the hostname the dev server was initialized with (localhost by
  // default). This breaks hydration when the dashboard is opened on
  // 127.0.0.1 (required for the Spotify OAuth callback to work). Whitelist
  // both so hydration succeeds regardless of which host the tab is on.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
