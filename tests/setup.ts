// Global Vitest setup for the lifemaxxing-dashboard test suite.
//
// Conventions:
//   • All tests use an in-memory better-sqlite3 instance — never the on-disk
//     data/lifemaxx.db file.
//   • All Yahoo + CoinGecko HTTP traffic is intercepted via MSW. An unmocked
//     fetch throws loudly so missing handlers fail fast.
//   • child_process.spawn is mocked at module level so the real hermes binary
//     is never invoked.
//   • Date.now() is real by default. Tests that depend on "today" use
//     vi.useFakeTimers + vi.setSystemTime to freeze 2026-06-01T12:00:00Z.

import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import "@testing-library/jest-dom/vitest";

import { defaultHandlers } from "./helpers/msw";
import { resetDb } from "./helpers/db";

// ────────────────────────────────────────────────────────────────────────────
// 1. better-sqlite3 in-memory DB — mocked at the module-resolution layer so
//    every `import db from "@/lib/db"` in production code resolves to a fresh
//    per-test-file instance.
// ────────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/db", async () => {
  const { getDb } = await import("./helpers/db");
  return { default: getDb() };
});

// ────────────────────────────────────────────────────────────────────────────
// 2. child_process.spawn — guard so the real hermes binary is never invoked.
//    Individual tests that exercise hermes use the helper at tests/helpers/hermes.ts
//    which captures spawn arguments without spawning.
// ────────────────────────────────────────────────────────────────────────────
vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    spawn: vi.fn(() => {
      throw new Error(
        "child_process.spawn called without test-level mock — install a per-test mock or use tests/helpers/hermes.ts",
      );
    }),
  };
});

// ────────────────────────────────────────────────────────────────────────────
// 3. hermes module — mocked so route handlers never need a real subprocess.
//    Tests configure responses via setHermesResponder(...).
// ────────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/hermes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hermes")>("@/lib/hermes");
  const { getHermesResponder } = await import("./helpers/hermes");
  return {
    ...actual,
    hermesCall: vi.fn(async (prompt: string) => {
      const responder = getHermesResponder();
      return responder(prompt);
    }),
  };
});

// ────────────────────────────────────────────────────────────────────────────
// 4. MSW: Yahoo + CoinGecko handlers. Catch-all that THROWS on any unmocked
//    HTTP call.
// ────────────────────────────────────────────────────────────────────────────
export const server = setupServer(
  ...defaultHandlers(),
  http.all("*", ({ request }) => {
    // last-resort: any URL we didn't register a handler for blows up the test.
    throw new Error(`Unmocked fetch: ${request.method} ${request.url}`);
    // Note: returning HttpResponse.error() would just look like a network
    // failure to production code, which it then swallows. Throwing here makes
    // missing mocks surface immediately.
    return HttpResponse.error();
  }),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetDb();
});
afterEach(() => {
  server.resetHandlers(
    ...defaultHandlers(),
    http.all("*", ({ request }) => {
      throw new Error(`Unmocked fetch: ${request.method} ${request.url}`);
    }),
  );
  vi.useRealTimers();
});
afterAll(() => server.close());
