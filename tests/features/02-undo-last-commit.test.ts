// @vitest-environment node
// Placeholder tests for FEATURE 2: Undo last commit
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 2: Undo last commit", () => {
  it.todo("TODO(feature-2): toast surfaces an Undo button for ~5s after a successful commit");
  it.todo("TODO(feature-2): clicking Undo calls DELETE /api/{kind}/:id with the just-returned id");
  it.todo("TODO(feature-2): after Undo, the row is soft-deleted (deleted_at set) and excluded from reads");
});
