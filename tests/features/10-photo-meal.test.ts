// @vitest-environment node
// Placeholder tests for FEATURE 10: Photo-based meal logging
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 10: Photo-based meal logging", () => {
  it.todo("TODO(feature-10): POST /api/log accepts multipart/form-data with an image field");
  it.todo("TODO(feature-10): request is routed through a mocked vision model");
  it.todo("TODO(feature-10): response shape matches text-meal path: {kind: 'meal', needsConfirm: true, parsed: {...}}");
  it.todo("TODO(feature-10): non-image multipart payload falls back to text parsing or 400");
});
