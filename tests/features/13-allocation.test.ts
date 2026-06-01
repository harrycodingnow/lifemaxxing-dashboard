// @vitest-environment node
// Placeholder tests for FEATURE 13: Asset allocation donut data
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 13: Asset allocation donut data", () => {
  it.todo("TODO(feature-13): /api/portfolio response includes allocation: {tw_stock, us_stock, crypto, dca}");
  it.todo("TODO(feature-13): allocation percentages sum to 100 (within rounding tolerance)");
  it.todo("TODO(feature-13): DCA-tagged crypto buys aggregate into the dca bucket, not crypto");
  it.todo("TODO(feature-13): zero-position asset classes report 0 (not missing keys)");
});
