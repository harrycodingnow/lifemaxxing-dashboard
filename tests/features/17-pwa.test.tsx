// @vitest-environment jsdom
// Placeholder tests for FEATURE 17: Mobile / PWA
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 17: Mobile / PWA", () => {
  it.todo("TODO(feature-17): public/manifest.json exists with name, short_name, icons, start_url, display fields");
  it.todo("TODO(feature-17): page.tsx renders a single-column stacked layout below the 768px breakpoint (matchMedia mock)");
  it.todo("TODO(feature-17): service worker is registered (or registration entry-point exists)");
  it.todo("TODO(feature-17): install-prompt UI surfaces when beforeinstallprompt fires");
});
