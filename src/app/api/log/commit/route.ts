import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "trade" | "meal" | "weight" | "todo";

function writeEntry(kind: Kind, payload: any, sourceText: string, ts: number) {
  if (kind === "trade") {
    const p = payload;
    const info = db
      .prepare(
        `INSERT INTO trades (ts, asset_type, symbol, display_name, side, quantity, price, currency, note)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        ts,
        p.asset_type,
        p.symbol,
        p.display_name || p.symbol,
        p.side,
        Number(p.quantity),
        Number(p.price),
        p.currency,
        p.note || "",
      );
    return {
      id: info.lastInsertRowid,
      message: `${p.side} ${p.quantity} ${p.display_name || p.symbol} @ ${p.currency} ${p.price}`,
    };
  }
  if (kind === "meal") {
    const meal = payload;
    const info = db
      .prepare(
        `INSERT INTO meals (ts, description, meal_type, calories, protein_g, carbs_g, fat_g, items_json, sources_json)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        ts,
        sourceText,
        meal.meal_type || "unknown",
        Number(meal.totals?.calories || 0),
        Number(meal.totals?.protein_g || 0),
        Number(meal.totals?.carbs_g || 0),
        Number(meal.totals?.fat_g || 0),
        JSON.stringify(meal.items || []),
        JSON.stringify(meal.sources || []),
      );
    const t = meal.totals || {};
    return {
      id: info.lastInsertRowid,
      message: `meal ${Math.round(t.calories || 0)} kcal · P${Math.round(t.protein_g || 0)}g C${Math.round(t.carbs_g || 0)}g F${Math.round(t.fat_g || 0)}g`,
    };
  }
  if (kind === "weight") {
    const w = payload;
    const weight_kg = Number(w.weight_kg);
    const note = w.note || "";
    const info = db
      .prepare("INSERT INTO weights (ts, weight_kg, note) VALUES (?,?,?)")
      .run(ts, weight_kg, note);
    return {
      id: info.lastInsertRowid,
      message: `weight ${weight_kg} kg (${(weight_kg * 2.20462).toFixed(1)} lbs)`,
    };
  }
  if (kind === "todo") {
    const t = payload;
    const title = (t.title || "").toString().slice(0, 200);
    if (!title) throw new Error("todo missing title");
    const notes = (t.notes || "").toString();
    const due_ts = t.due_ts == null ? null : Number(t.due_ts);
    const priority = Math.max(0, Math.min(3, Number(t.priority) || 0));
    const info = db
      .prepare(
        `INSERT INTO todos (created_ts, updated_ts, title, notes, due_ts, priority, done, sort_order)
         VALUES (?,?,?,?,?,?,0,0)`,
      )
      .run(ts, ts, title, notes, due_ts, priority);
    const due = due_ts ? new Date(due_ts).toLocaleString() : "no due";
    return {
      id: info.lastInsertRowid,
      message: `todo "${title}" (${due}${priority ? `, P${priority}` : ""})`,
    };
  }
  throw new Error(`unknown kind: ${kind}`);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind: string = body?.kind;
  const payload = body?.payload;
  const text: string = (body?.text || "").toString();

  if (!kind || !payload) {
    return NextResponse.json({ error: "missing kind or payload" }, { status: 400 });
  }

  const now = Date.now();
  if (text) {
    db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
      now, "user", text, null,
    );
  }

  if (kind === "batch") {
    const entries: Array<{ kind: Kind; payload: any; raw?: string }> = payload?.entries || [];
    const results: any[] = [];
    let cursor = now;
    for (const e of entries) {
      try {
        const r = writeEntry(e.kind, e.payload, e.raw || text, cursor);
        results.push({ kind: e.kind, ok: true, id: r.id, message: r.message });
      } catch (err) {
        results.push({ kind: e.kind, ok: false, error: (err as Error).message });
      }
      cursor += 1; // keep ts ordering distinct
    }
    const msg = `Logged ${results.filter((r) => r.ok).length}/${results.length} entries: ${results.map((r) => r.ok ? r.message : `FAIL(${r.kind})`).join(" · ")}`;
    db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
      Date.now(), "assistant", msg, JSON.stringify({ kind: "batch", results }),
    );
    return NextResponse.json({ kind: "batch", results, message: msg });
  }

  try {
    const r = writeEntry(kind as Kind, payload, text, now);
    const prefix = kind === "trade" ? "Logged " : kind === "meal" ? "Logged " : "Logged ";
    const msg = `${prefix}${r.message}`;
    db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
      Date.now(), "assistant", msg, JSON.stringify({ kind, id: r.id, payload }),
    );
    return NextResponse.json({ kind, id: r.id, message: msg });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
