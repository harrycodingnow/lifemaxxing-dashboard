// @vitest-environment jsdom
// Placeholder tests for FEATURE 7: Holdings detail drawer
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 7: Holdings detail drawer", () => {
  it.todo("TODO(feature-7): clicking a holdings row in page.tsx opens a drawer");
  it.todo("TODO(feature-7): drawer renders the trade history for that symbol");
  it.todo("TODO(feature-7): drawer renders a cost-basis reference line / value");
  it.todo("TODO(feature-7): drawer closes on Escape and on backdrop click");
});
