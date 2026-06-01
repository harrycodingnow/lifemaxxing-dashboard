// @vitest-environment node
// Placeholder tests for FEATURE 8: Weight goal + projection
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 8: Weight goal + projection", () => {
  it.todo("TODO(feature-8): settings table accepts target_weight_kg (POST /api/goals persists it)");
  it.todo("TODO(feature-8): /api/weights response includes target_kg");
  it.todo("TODO(feature-8): /api/weights response includes eta_days computed from 7d MA slope");
  it.todo("TODO(feature-8): weight chart renders a reference line at target_kg");
});
