import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Coverage thresholds intentionally set to attainable starter values.
// TODO: raise to 80/70/80/80 once features-N tests land.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    environmentMatchGlobs: [
      ["tests/components/**", "jsdom"],
      ["tests/features/**", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/app/layout.tsx", "src/app/globals.css", "**/*.d.ts"],
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 50,
        statements: 60,
      },
    },
    testTimeout: 15000,
    pool: "forks", // better-sqlite3 native module is friendlier under forks
  },
});
