// @vitest-environment node
// Placeholder tests for FEATURE 15: Multi-user / auth
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 15: Multi-user / auth", () => {
  it.todo("TODO(feature-15): trades, meals, weights, settings rows carry a user_id column");
  it.todo("TODO(feature-15): unauthenticated write requests (POST /api/log, /api/goals) return 401");
  it.todo("TODO(feature-15): reads (GET /api/portfolio, /api/nutrition, /api/weights) scope to the session user_id");
  it.todo("TODO(feature-15): no cross-user data leak: user A cannot see user B's rows");
});
