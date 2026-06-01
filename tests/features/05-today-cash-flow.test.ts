// @vitest-environment node
// Placeholder tests for FEATURE 5: Today's spend / cash-in
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 5: Today's spend / cash-in", () => {
  it.todo("TODO(feature-5): /api/portfolio response includes today_net_flow_usd field");
  it.todo("TODO(feature-5): today_net_flow_usd = sum of today's buys minus sells in USD (FX-converted from TWD)");
  it.todo("TODO(feature-5): soft-deleted trades are excluded from the calculation");
  it.todo("TODO(feature-5): boundary uses server local TZ midnight");
});
