import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hermesCall, extractJson } from "@/lib/hermes";
import { ROUTER_PROMPT, TRADE_PARSE_PROMPT, MEAL_RESEARCH_PROMPT, WEIGHT_PARSE_PROMPT, BATCH_PARSE_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouterOut = { intent: "trade" | "meal" | "weight" | "batch" | "question" | "unknown"; reason: string };
type TradeOut = {
  asset_type: "tw_stock" | "us_stock" | "crypto";
  symbol: string;
  display_name: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  currency: "TWD" | "USD";
  note: string;
};
type MealOut = {
  meal_type: string;
  items: Array<{ name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }>;
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  sources: string[];
  confidence: string;
  notes: string;
};

// POST /api/log -> PARSE ONLY (no DB write).
// Returns a preview the client must confirm via POST /api/log/commit.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text: string = (body?.text || "").toString().trim();
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });

  // 1) route intent
  let routed: RouterOut;
  try {
    const raw = await hermesCall(ROUTER_PROMPT(text), { timeoutMs: 60_000 });
    routed = extractJson<RouterOut>(raw);
  } catch (e) {
    return NextResponse.json(
      { error: `router failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  if (routed.intent === "batch") {
    let batch: { entries: Array<{ kind: "trade" | "meal" | "weight"; payload: any; raw?: string }> };
    try {
      const raw = await hermesCall(BATCH_PARSE_PROMPT(text), { timeoutMs: 180_000 });
      batch = extractJson(raw);
    } catch (e) {
      return NextResponse.json(
        { error: `batch parse failed: ${(e as Error).message}`, intent: routed.intent },
        { status: 500 },
      );
    }
    const entries = Array.isArray(batch?.entries) ? batch.entries : [];
    const previews = entries.map((e) => {
      if (e.kind === "trade") {
        const p = e.payload;
        return `${p.side?.toUpperCase()} ${p.quantity} ${p.display_name || p.symbol} @ ${p.currency} ${p.price}`;
      }
      if (e.kind === "meal") {
        const t = e.payload?.totals || {};
        return `meal ${Math.round(t.calories || 0)} kcal · P${Math.round(t.protein_g || 0)}g C${Math.round(t.carbs_g || 0)}g F${Math.round(t.fat_g || 0)}g`;
      }
      if (e.kind === "weight") {
        const v = Number(e.payload?.weight_kg);
        return `weight ${v} kg`;
      }
      return e.kind;
    });
    const preview = `${entries.length} entries: ${previews.join(" · ")}`;
    return NextResponse.json({ kind: "batch", preview, payload: { entries }, text, needsConfirm: true });
  }

  if (routed.intent === "trade") {
    let parsed: TradeOut;
    try {
      const raw = await hermesCall(TRADE_PARSE_PROMPT(text), { timeoutMs: 90_000 });
      parsed = extractJson<TradeOut>(raw);
    } catch (e) {
      return NextResponse.json(
        { error: `trade parse failed: ${(e as Error).message}`, intent: routed.intent },
        { status: 500 },
      );
    }
    const preview = `${parsed.side.toUpperCase()} ${parsed.quantity} ${parsed.display_name || parsed.symbol} @ ${parsed.currency} ${parsed.price}`;
    return NextResponse.json({ kind: "trade", preview, payload: parsed, text, needsConfirm: true });
  }

  if (routed.intent === "meal") {
    let meal: MealOut;
    try {
      const raw = await hermesCall(MEAL_RESEARCH_PROMPT(text), { timeoutMs: 120_000 });
      meal = extractJson<MealOut>(raw);
    } catch (e) {
      return NextResponse.json(
        { error: `meal research failed: ${(e as Error).message}`, intent: routed.intent },
        { status: 500 },
      );
    }
    const preview = `${Math.round(meal.totals.calories)} kcal · P${Math.round(meal.totals.protein_g)}g C${Math.round(meal.totals.carbs_g)}g F${Math.round(meal.totals.fat_g)}g`;
    return NextResponse.json({ kind: "meal", preview, payload: meal, text, needsConfirm: true });
  }

  if (routed.intent === "weight") {
    let weight_kg: number | null = null;
    let note = "";
    const m = text.match(/(-?\d+(?:\.\d+)?)\s*(kg|kgs|公斤|lb|lbs|pound|pounds)?/i);
    if (m) {
      const n = parseFloat(m[1]);
      const unit = (m[2] || "").toLowerCase();
      if (unit.startsWith("lb") || unit.startsWith("pound")) {
        weight_kg = +(n * 0.45359237).toFixed(1);
      } else if (unit.startsWith("kg") || unit === "公斤" || !unit) {
        if (!unit && (n < 30 || n > 250)) weight_kg = null;
        else weight_kg = +n.toFixed(1);
      }
    }
    if (weight_kg == null) {
      try {
        const raw = await hermesCall(WEIGHT_PARSE_PROMPT(text), { timeoutMs: 60_000 });
        const parsed = extractJson<{ value: number; unit: "kg" | "lb"; note?: string }>(raw);
        const v = Number(parsed.value);
        weight_kg = parsed.unit === "lb" ? +(v * 0.45359237).toFixed(1) : +v.toFixed(1);
        note = parsed.note || "";
      } catch (e) {
        return NextResponse.json(
          { error: `weight parse failed: ${(e as Error).message}`, intent: routed.intent },
          { status: 500 },
        );
      }
    }
    const preview = `${weight_kg} kg (${(weight_kg * 2.20462).toFixed(1)} lbs)`;
    return NextResponse.json({
      kind: "weight",
      preview,
      payload: { weight_kg, note },
      text,
      needsConfirm: true,
    });
  }

  // question / unknown: nothing to confirm, just log assistant reply directly
  const now = Date.now();
  db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
    now, "user", text, null,
  );
  const assistantMsg =
    routed.intent === "question"
      ? `That looks like a question, not a log entry. (${routed.reason})`
      : `Not sure how to log that: ${routed.reason}`;
  db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
    Date.now(), "assistant", assistantMsg, JSON.stringify({ kind: routed.intent, routed }),
  );
  return NextResponse.json({ kind: routed.intent, routed, message: assistantMsg, needsConfirm: false });
}
