// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ROUTER_PROMPT,
  TRADE_PARSE_PROMPT,
  MEAL_RESEARCH_PROMPT,
  WEIGHT_PARSE_PROMPT,
  BATCH_PARSE_PROMPT,
} from "@/lib/prompts";

describe("prompts", () => {
  it("ROUTER_PROMPT interpolates verbatim and lists all six intents", () => {
    const s = ROUTER_PROMPT(`weird "quoted" \\n text`);
    expect(s).toContain(`weird "quoted" \\n text`);
    for (const intent of ["trade", "meal", "weight", "batch", "question", "unknown"]) {
      expect(s).toContain(intent);
    }
    expect(s).toMatch(/"intent"/);
    expect(s).toMatch(/"reason"/);
  });

  it("TRADE_PARSE_PROMPT contains the full trade schema keys", () => {
    const s = TRADE_PARSE_PROMPT("buy 1 AAPL");
    for (const key of [
      "asset_type", "symbol", "display_name", "side",
      "quantity", "price", "currency", "note",
    ]) {
      expect(s).toContain(`"${key}"`);
    }
    expect(s).toContain("buy 1 AAPL");
  });

  it("MEAL_RESEARCH_PROMPT contains items + totals schema", () => {
    const s = MEAL_RESEARCH_PROMPT("oatmeal and eggs");
    for (const key of ["meal_type", "items", "totals", "sources", "confidence", "notes"]) {
      expect(s).toContain(`"${key}"`);
    }
    expect(s).toContain("oatmeal and eggs");
  });

  it("WEIGHT_PARSE_PROMPT contains value/unit schema", () => {
    const s = WEIGHT_PARSE_PROMPT("73.2 kg");
    expect(s).toContain(`"value"`);
    expect(s).toContain(`"unit"`);
    expect(s).toContain("73.2 kg");
  });

  it("BATCH_PARSE_PROMPT contains entries[] schema", () => {
    const s = BATCH_PARSE_PROMPT("a; b; c");
    expect(s).toContain(`"entries"`);
    expect(s).toContain(`"kind"`);
    expect(s).toContain(`"payload"`);
    expect(s).toContain("a; b; c");
  });

  it("snapshot: prompts are stable (intentional edits only)", () => {
    expect({
      router: ROUTER_PROMPT("X"),
      trade: TRADE_PARSE_PROMPT("X"),
      meal: MEAL_RESEARCH_PROMPT("X"),
      weight: WEIGHT_PARSE_PROMPT("X"),
      batch: BATCH_PARSE_PROMPT("X"),
    }).toMatchSnapshot();
  });
});
