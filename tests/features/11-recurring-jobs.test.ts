// @vitest-environment node
// Placeholder tests for FEATURE 11: Recurring DCA generalized
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 11: Recurring DCA generalized", () => {
  it.todo("TODO(feature-11): new recurring_jobs table exists with columns (id, name, schedule, source, target, amount, ...)");
  it.todo("TODO(feature-11): /api/recurring returns an array of jobs (not a single hardcoded BTC job)");
  it.todo("TODO(feature-11): ETH DCA job is represented and aggregates correctly");
  it.todo("TODO(feature-11): weekly cadence is supported (next_run_ts = last_run_ts + 7*24h*ms)");
});
