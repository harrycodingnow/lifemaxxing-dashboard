// @vitest-environment node
// Placeholder tests for FEATURE 16: Export / backup
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 16: Export / backup", () => {
  it.todo("TODO(feature-16): GET /api/export?format=csv&table=trades streams CSV");
  it.todo("TODO(feature-16): GET /api/export?format=json&table=meals streams JSON");
  it.todo("TODO(feature-16): table=all returns a multi-table envelope");
  it.todo("TODO(feature-16): CSV escaping handles values with commas, quotes, and newlines");
});
