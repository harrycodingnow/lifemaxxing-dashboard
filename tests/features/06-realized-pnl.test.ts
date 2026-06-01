// @vitest-environment node
// Placeholder tests for FEATURE 6: Realized P&L
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 6: Realized P&L", () => {
  it.todo("TODO(feature-6): each position in /api/portfolio gains a realized_pnl_native field");
  it.todo("TODO(feature-6): /api/portfolio header gains a realized_ytd_usd total");
  it.todo("TODO(feature-6): FIFO matching of sells against buy lots produces the realized number");
  it.todo("TODO(feature-6): USD-conversion uses mocked usdTwd for TW realized P&L");
});
