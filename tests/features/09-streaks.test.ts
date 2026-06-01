// @vitest-environment node
// Placeholder tests for FEATURE 9: Streaks / adherence
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 9: Streaks / adherence", () => {
  it.todo("TODO(feature-9): /api/streaks endpoint exists and returns JSON");
  it.todo("TODO(feature-9): response includes meal_log streak (consecutive days with >=1 meal logged)");
  it.todo("TODO(feature-9): response includes protein_goal_hit count this week");
  it.todo("TODO(feature-9): response includes DCA consecutive_runs count");
});
