// @vitest-environment jsdom
// Placeholder tests for FEATURE 4: Symbol/ticker autocomplete
// See task spec §5 — these MUST fail loudly once the feature lands but stay
// out of CI today via describe.skip + it.todo.
import { describe, it } from "vitest";

describe.skip("FEATURE 4: Symbol/ticker autocomplete", () => {
  it.todo("TODO(feature-4): typing /btc opens an autocomplete popup with matching tickers");
  it.todo("TODO(feature-4): typing /2330 opens popup for TWSE symbols");
  it.todo("TODO(feature-4): selecting a ticker fills a templated string into the input (e.g. 'bought X shares of BTC at $')");
  it.todo("TODO(feature-4): popup closes on Escape and on outside-click");
});
