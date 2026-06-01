// @vitest-environment node
// Placeholder tests for FEATURE 12: Time-series portfolio chart
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 12: Time-series portfolio chart", () => {
  it.todo("TODO(feature-12): portfolio_snapshots table exists (ts, value_usd, ...)");
  it.todo("TODO(feature-12): /api/portfolio/history?days=N returns [{ts, value_usd}, ...]");
  it.todo("TODO(feature-12): snapshot writer is idempotent per calendar day (re-running same day updates, not inserts)");
  it.todo("TODO(feature-12): days param is respected and clipped to a sane max");
});
