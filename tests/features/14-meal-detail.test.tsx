// @vitest-environment jsdom
// Placeholder tests for FEATURE 14: Per-meal detail
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 14: Per-meal detail", () => {
  it.todo("TODO(feature-14): clicking a meal row opens a detail view");
  it.todo("TODO(feature-14): items_json is parsed and rendered as a list");
  it.todo("TODO(feature-14): each item shows per-item macros (cal/protein/carbs/fat)");
  it.todo("TODO(feature-14): sources_json is rendered as clickable references");
});
