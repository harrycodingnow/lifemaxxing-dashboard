// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ROUTER_PROMPT,
  TRADE_PARSE_PROMPT,
  MEAL_RESEARCH_PROMPT,
  WEIGHT_PARSE_PROMPT,
  BATCH_PARSE_PROMPT,
  SUBSCRIPTION_PARSE_PROMPT,
  HABIT_PARSE_PROMPT,
  NETWORTH_PARSE_PROMPT,
  WEEKLY_REVIEW_PROMPT,
  NEWS_SUMMARY_PROMPT,
  WIDGET_GEN_PROMPT,
} from "@/lib/prompts";

describe("prompts", () => {
  it("ROUTER_PROMPT interpolates verbatim and lists all intents", () => {
    const s = ROUTER_PROMPT(`weird "quoted" \\n text`);
    expect(s).toContain(`weird "quoted" \\n text`);
    for (const intent of ["trade", "meal", "weight", "todo", "subscription", "habit", "networth", "batch", "question", "unknown"]) {
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

  it("SUBSCRIPTION_PARSE_PROMPT contains the subscription schema keys", () => {
    const s = SUBSCRIPTION_PARSE_PROMPT("netflix 390/mo", "2026-06-01T12:00");
    for (const key of ["name", "amount", "currency", "cycle", "next_charge_iso"]) {
      expect(s).toContain(`"${key}"`);
    }
    expect(s).toContain("netflix 390/mo");
    expect(s).toContain("2026-06-01T12:00");
  });

  it("HABIT_PARSE_PROMPT contains name/status schema", () => {
    const s = HABIT_PARSE_PROMPT("did meditation");
    expect(s).toContain(`"name"`);
    expect(s).toContain(`"status"`);
    expect(s).toContain("did meditation");
  });

  it("NETWORTH_PARSE_PROMPT contains kind/balance schema", () => {
    const s = NETWORTH_PARSE_PROMPT("cathay 250000");
    for (const key of ["kind", "name", "balance", "currency", "account_kind"]) {
      expect(s).toContain(`"${key}"`);
    }
    expect(s).toContain("cathay 250000");
  });

  it("WEEKLY_REVIEW_PROMPT embeds the digest JSON", () => {
    const s = WEEKLY_REVIEW_PROMPT('{"trades":{"count":2}}');
    expect(s).toContain('{"trades":{"count":2}}');
    expect(s).toMatch(/weekly review/i);
  });

  it("NEWS_SUMMARY_PROMPT embeds the headlines JSON and asks for a briefing", () => {
    const s = NEWS_SUMMARY_PROMPT('[{"title":"X","source":"WSJ","category":"Markets"}]');
    expect(s).toContain('[{"title":"X","source":"WSJ","category":"Markets"}]');
    expect(s).toMatch(/briefing/i);
    expect(s).toMatch(/do not invent/i);
  });

  it("WIDGET_GEN_PROMPT embeds the request and asks for a self-contained HTML doc", () => {
    const s = WIDGET_GEN_PROMPT("a pomodoro timer");
    expect(s).toContain("a pomodoro timer");
    expect(s).toMatch(/self-contained/i);
    expect(s).toMatch(/<!doctype html>/i);
    expect(s).toMatch(/sandbox/i);
  });

  it("snapshot: prompts are stable (intentional edits only)", () => {
    expect({
      router: ROUTER_PROMPT("X"),
      trade: TRADE_PARSE_PROMPT("X"),
      meal: MEAL_RESEARCH_PROMPT("X"),
      weight: WEIGHT_PARSE_PROMPT("X"),
      batch: BATCH_PARSE_PROMPT("X"),
      subscription: SUBSCRIPTION_PARSE_PROMPT("X", "2026-06-01T12:00"),
      habit: HABIT_PARSE_PROMPT("X"),
      networth: NETWORTH_PARSE_PROMPT("X"),
      weekly_review: WEEKLY_REVIEW_PROMPT("X"),
      news_summary: NEWS_SUMMARY_PROMPT("X"),
      widget_gen: WIDGET_GEN_PROMPT("X"),
    }).toMatchSnapshot();
  });
});
