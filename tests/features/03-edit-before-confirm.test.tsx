// @vitest-environment jsdom
// Placeholder tests for FEATURE 3: Edit before confirm
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 3: Edit before confirm", () => {
  it.todo("TODO(feature-3): trade confirm modal exposes editable quantity and price fields");
  it.todo("TODO(feature-3): meal confirm modal exposes editable per-item macros (cal/protein/carbs/fat)");
  it.todo("TODO(feature-3): weight confirm modal exposes editable weight_kg");
  it.todo("TODO(feature-3): edited payload is what gets POSTed to /api/log/commit (not the original parse)");
});
