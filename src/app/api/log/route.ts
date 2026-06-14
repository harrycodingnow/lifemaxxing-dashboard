import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hermesCall, extractJson } from "@/lib/hermes";
import { ROUTER_PROMPT, TRADE_PARSE_PROMPT, MEAL_RESEARCH_PROMPT, WEIGHT_PARSE_PROMPT, BATCH_PARSE_PROMPT, TODO_PARSE_PROMPT, SUBSCRIPTION_PARSE_PROMPT, HABIT_PARSE_PROMPT, NETWORTH_PARSE_PROMPT, ASK_PROMPT } from "@/lib/prompts";
import { matchKnownFoods, hitToMealItem, type KnownFoodHit } from "@/lib/known-foods";
import { guardSelect, applyRowCap } from "@/lib/sql-guard";
import { looksLikeLinkSave, extractFirstUrl, fetchLinkMeta } from "@/lib/links";

// SECURITY: this endpoint shells out to the local `hermes` CLI with --yolo --ignore-rules,
// granting full tool access on the host machine. NEVER expose this dashboard to a public
// network — bind to 127.0.0.1 only. Hermes calls trust the caller completely.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouterOut = { intent: "trade" | "meal" | "weight" | "todo" | "subscription" | "habit" | "networth" | "link" | "batch" | "question" | "unknown"; reason: string };
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
type MealItem = { name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };
type MealTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type MealOut = {
  meal_type: string;
  items: MealItem[];
  totals: MealTotals;
  sources: string[];
  confidence: string;
  notes: string;
};

type TodoPayload = { title: string; notes: string; due_ts: number | null; priority: number };
type SubscriptionPayload = { name: string; amount: number; currency: "TWD" | "USD"; cycle: "weekly" | "monthly" | "yearly"; next_charge_ts: number | null; url: string; notes: string };
type HabitPayload = { name: string; status: "done" | "skip" };
type NetworthPayload = { kind: "cash" | "liability"; name: string; balance: number; currency: "TWD" | "USD"; account_kind: string };

const CYCLE_MULT: Record<string, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };

function subscriptionPreview(p: SubscriptionPayload): string {
  const sym = p.currency === "USD" ? "$" : "NT$";
  const cycleShort = p.cycle === "yearly" ? "/yr" : p.cycle === "weekly" ? "/wk" : "/mo";
  const monthly = p.amount * (CYCLE_MULT[p.cycle] ?? 1);
  const monthlyStr = p.cycle === "monthly" ? "" : ` · ≈${sym}${Math.round(monthly)}/mo`;
  return `${p.name} ${sym}${p.amount}${cycleShort}${monthlyStr}`;
}

function networthPreview(p: NetworthPayload): string {
  const sym = p.currency === "USD" ? "$" : "NT$";
  const label = p.kind === "liability" ? "owe" : "have";
  return `${p.name}: ${label} ${sym}${p.balance.toLocaleString()}`;
}

// Expand "1.2m", "250k", "25萬" style shorthands to a plain number. Returns null if unparseable.
function parseMoneyShorthand(raw: string): number | null {
  const s = raw.replace(/[, ]/g, "").toLowerCase();
  let m = s.match(/^(-?\d+(?:\.\d+)?)(m|k|萬|万)?$/);
  if (m) {
    let n = parseFloat(m[1]);
    if (m[2] === "m") n *= 1_000_000;
    else if (m[2] === "k") n *= 1_000;
    else if (m[2] === "萬" || m[2] === "万") n *= 10_000;
    return n;
  }
  return null;
}

// Lexical subscription parser for "<name> <amount>[/cycle]" e.g. "netflix 390/mo",
// "spotify 1990 yearly", "icloud NT$30 monthly". Returns null if no amount found.
function parseFastSubscription(body: string): SubscriptionPayload | null {
  let s = body.trim();
  let cycle: "weekly" | "monthly" | "yearly" = "monthly";
  // cycle words / suffixes
  if (/(\/?\s*(yr|year|yearly|annually|annual|年)|每年|年費)/i.test(s)) cycle = "yearly";
  else if (/(\/?\s*(wk|week|weekly|週|周)|每週|每周)/i.test(s)) cycle = "weekly";
  else if (/(\/?\s*(mo|month|monthly|月)|每月|月費)/i.test(s)) cycle = "monthly";
  // currency
  let currency: "TWD" | "USD" = "TWD";
  if (/(\bUSD\b|\$|美金|美元)/i.test(s)) currency = "USD";
  if (/(NT\$|NTD|台幣|新台幣)/i.test(s)) currency = "TWD";
  // amount: first number (optionally with currency symbol / k-m suffix)
  const am = s.match(/(?:NT\$|NTD|US\$|\$|￥|¥)?\s*(\d[\d,]*(?:\.\d+)?)(k|m|萬|万)?/i);
  if (!am) return null;
  const amount = parseMoneyShorthand(am[1] + (am[2] || ""));
  if (amount == null || amount <= 0) return null;
  // name = body with the matched amount + cycle/currency tokens stripped
  let name = s
    .replace(am[0], " ")
    .replace(/(\/?\s*(yr|year|yearly|annually|annual|mo|month|monthly|wk|week|weekly))/gi, " ")
    .replace(/(每年|年費|每月|月費|每週|每周|年|月|週|周)/g, " ")
    .replace(/(NT\$|NTD|US\$|USD|\$|美金|美元|台幣|新台幣|￥|¥)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) name = "subscription";
  return { name, amount, currency, cycle, next_charge_ts: null, url: "", notes: "" };
}

// Resolve loose date words to a Date. Returns null if unparseable.
function resolveTodoDate(token: string): Date | null {
  const now = new Date();
  const t = token.trim().toLowerCase();
  if (!t) return null;
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  if (t === "today" || t === "今天") return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
  if (t === "tomorrow" || t === "tmr" || t === "明天") {
    const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d;
  }
  if (t === "後天" || t === "day after tomorrow") {
    const d = new Date(now); d.setDate(d.getDate() + 2); d.setHours(9, 0, 0, 0); return d;
  }
  // "in 2h", "in 30m", "in 3 days"
  const rel = t.match(/^in\s+(\d+)\s*(m|min|mins|h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks)$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const d = new Date(now);
    if (unit.startsWith("m") && !unit.startsWith("min") === false || unit === "m" || unit.startsWith("min"))
      d.setMinutes(d.getMinutes() + n);
    else if (unit.startsWith("h")) d.setHours(d.getHours() + n);
    else if (unit.startsWith("d")) { d.setDate(d.getDate() + n); d.setHours(9, 0, 0, 0); }
    else if (unit.startsWith("w")) { d.setDate(d.getDate() + n * 7); d.setHours(9, 0, 0, 0); }
    return d;
  }
  // Weekday: "mon", "next fri"
  const wd = t.match(/^(?:next\s+)?(sun|mon|tue|wed|thu|fri|sat)/);
  if (wd) {
    const target = days.indexOf(wd[1]);
    const d = new Date(now);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0 || t.startsWith("next")) diff = diff === 0 ? 7 : diff + (t.startsWith("next") ? 7 : 0);
    d.setDate(d.getDate() + diff); d.setHours(9, 0, 0, 0);
    return d;
  }
  // Time-only HH:MM or H(am|pm)
  const tm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (tm) {
    let h = parseInt(tm[1], 10);
    const m = tm[2] ? parseInt(tm[2], 10) : 0;
    const ap = tm[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    const d = new Date(now); d.setHours(h, m, 0, 0);
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  // ISO-ish "2026-06-05" or "2026-06-05 15:00"
  const iso = t.match(/^(\d{4}-\d{1,2}-\d{1,2})(?:[\sT](\d{1,2}):(\d{2}))?$/);
  if (iso) {
    const [y, mo, da] = iso[1].split("-").map(Number);
    const h = iso[2] ? parseInt(iso[2], 10) : 9;
    const mn = iso[3] ? parseInt(iso[3], 10) : 0;
    return new Date(y, mo - 1, da, h, mn, 0, 0);
  }
  return null;
}

// Fast lexical todo parser: "title @<date/time> !<priority>"
// Examples: "pay rent @tomorrow !high", "call mom @3pm"
function parseFastTodo(body: string): TodoPayload {
  let priority = 0;
  let due_ts: number | null = null;
  let s = body;
  // priority flag
  const pm = s.match(/(?:^|\s)!(low|med|medium|high|urgent|1|2|3)\b/i);
  if (pm) {
    const v = pm[1].toLowerCase();
    priority = v === "urgent" || v === "high" || v === "3" ? 3
      : v === "med" || v === "medium" || v === "2" ? 2
      : v === "low" || v === "1" ? 1 : 0;
    s = s.replace(pm[0], " ");
  }
  // @date / @time — greedy: capture until next "@" or "!" or end
  const am = s.match(/(?:^|\s)@([^@!]+?)(?=\s+[!@]|$)/);
  if (am) {
    const d = resolveTodoDate(am[1].trim());
    if (d) due_ts = d.getTime();
    s = s.replace(am[0], " ");
  }
  const title = s.replace(/\s+/g, " ").trim();
  return { title: title || body.trim(), notes: "", due_ts, priority };
}

function todoPreview(t: TodoPayload): string {
  const bits: string[] = [t.title || "(untitled)"];
  if (t.due_ts) {
    const d = new Date(t.due_ts);
    const sameDay = new Date(); sameDay.setHours(0, 0, 0, 0);
    const tDay = new Date(d); tDay.setHours(0, 0, 0, 0);
    const isToday = sameDay.getTime() === tDay.getTime();
    const datePart = isToday ? "today" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timePart = d.getHours() === 0 && d.getMinutes() === 0 ? "" :
      ` ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    bits.push(`· ${datePart}${timePart}`);
  }
  if (t.priority) bits.push(`· P${t.priority}`);
  return bits.join(" ");
}

function buildMealFromHitsAndExtra(
  hits: KnownFoodHit[],
  extra: MealOut | null,
  meal_type: string,
): MealOut {
  const items: MealItem[] = hits.map(hitToMealItem);
  if (extra?.items?.length) items.push(...extra.items);
  const totals: MealTotals = items.reduce<MealTotals>(
    (acc, it) => {
      acc.calories += it.calories || 0;
      acc.protein_g += it.protein_g || 0;
      acc.carbs_g += it.carbs_g || 0;
      acc.fat_g += it.fat_g || 0;
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  const sources = [
    ...hits.map((h) => h.item.source),
    ...(extra?.sources || []),
  ];
  return {
    meal_type: extra?.meal_type || meal_type || "unknown",
    items,
    totals,
    sources: Array.from(new Set(sources)),
    confidence: hits.length && !extra ? "high" : extra?.confidence || "medium",
    notes: extra?.notes || (hits.length ? "Known-food table hit" : ""),
  };
}

// POST /api/log -> PARSE ONLY (no DB write).
// Returns a preview the client must confirm via POST /api/log/commit.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text: string = (body?.text || "").toString().trim();
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });

  // Fast path: todo with explicit prefix ("todo:", "task:", "/todo", "提醒:", "待辦:")
  // Avoids any LLM call. Supports @<date/time> and !<priority> flags.
  {
    const todoPrefix = text.match(/^\s*(?:\/todo|todo|task|提醒|待辦)\s*[:：]\s*(.+)$/i);
    if (todoPrefix) {
      const fast = parseFastTodo(todoPrefix[1].trim());
      return NextResponse.json({
        kind: "todo",
        preview: todoPreview(fast),
        payload: fast,
        text,
        needsConfirm: true,
      });
    }
  }

  // Fast path: habit check-in ("did X", "done X", "skipped X", "完成 X", "做了 X", "沒做 X").
  // Zero LLM calls — this is the highest-frequency, lowest-ambiguity intent.
  {
    const m = text.match(/^\s*(did|done|finished|completed|skip|skipped|missed|完成|做了|沒做|没做|跳過|跳过)\s+(.+?)\s*$/i);
    if (m) {
      const verb = m[1].toLowerCase();
      const isSkip = /^(skip|skipped|missed|沒做|没做|跳過|跳过)$/i.test(verb);
      let name = m[2].trim()
        .replace(/\s+(today|now|这次|這次)\s*$/i, "")
        .replace(/^(my|the)\s+/i, "")
        .trim();
      // Avoid hijacking meal/weight phrasing like "did eat 2 eggs" or numeric bodies.
      if (name && !/^\d/.test(name) && name.length <= 40) {
        const payload: HabitPayload = { name: name.toLowerCase(), status: isSkip ? "skip" : "done" };
        return NextResponse.json({
          kind: "habit",
          preview: `${isSkip ? "⊘ skip" : "✓ done"}: ${payload.name}`,
          payload,
          text,
          needsConfirm: true,
        });
      }
    }
  }

  // Fast path: subscription with explicit prefix ("sub:", "subscription:", "訂閱:").
  // The amount + cycle are parsed lexically. Falls through to the LLM intent on a miss.
  {
    const subPrefix = text.match(/^\s*(?:sub|subscription|訂閱)\s*[:：]\s*(.+)$/i);
    if (subPrefix) {
      const fast = parseFastSubscription(subPrefix[1].trim());
      if (fast) {
        return NextResponse.json({
          kind: "subscription",
          preview: subscriptionPreview(fast),
          payload: fast,
          text,
          needsConfirm: true,
        });
      }
    }
  }

  // Fast path: if the entire input matches the local known-foods table, skip both
  // the router and the meal LLM call. This is by far the most common case and
  // makes logging a familiar SKU effectively instant.
  {
    const { hits, leftover } = matchKnownFoods(text);
    if (hits.length && !leftover) {
      const meal = buildMealFromHitsAndExtra(hits, null, "unknown");
      const preview = `${Math.round(meal.totals.calories)} kcal · P${Math.round(meal.totals.protein_g)}g C${Math.round(meal.totals.carbs_g)}g F${Math.round(meal.totals.fat_g)}g`;
      return NextResponse.json({ kind: "meal", preview, payload: meal, text, needsConfirm: true });
    }
  }

  // Fast-path: URL save. If the entire message is essentially a URL (with at
  // most a short "watch later" / "稍後看" style hint), skip the router LLM
  // entirely and save it as a read-later link. Returns kind="link" so the
  // chat UI can show a confirmation pill that matches the existing flow.
  if (looksLikeLinkSave(text)) {
    const url = extractFirstUrl(text)!;
    const leftover = text.replace(url, "").trim();
    const note = leftover && leftover.length <= 500 ? leftover : null;
    try {
      const meta = await fetchLinkMeta(url);
      // Idempotent: if the same URL is already saved (and not archived), return it.
      const existing = db.prepare(
        `SELECT id, added_at, url, kind, title, description, author, site_name,
                thumbnail_url, duration_seconds, status, note, opened_at
         FROM saved_links WHERE url = ? AND archived_at IS NULL`,
      ).get(url) as Record<string, unknown> | undefined;
      let row: Record<string, unknown>;
      let duplicate = false;
      if (existing) {
        row = existing;
        duplicate = true;
      } else {
        const info = db.prepare(`
          INSERT INTO saved_links (
            added_at, url, kind, title, description, author, site_name,
            thumbnail_url, duration_seconds, status, note, raw_meta_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)
        `).run(
          Date.now(), meta.url, meta.kind, meta.title, meta.description, meta.author,
          meta.site_name, meta.thumbnail_url, meta.duration_seconds, note, JSON.stringify(meta.raw),
        );
        row = db.prepare(
          `SELECT id, added_at, url, kind, title, description, author, site_name,
                  thumbnail_url, duration_seconds, status, note, opened_at
           FROM saved_links WHERE id = ?`,
        ).get(info.lastInsertRowid) as Record<string, unknown>;
      }
      const titleStr = (row.title as string | null) ?? (row.url as string);
      const preview = duplicate ? `Already saved: ${titleStr}` : `Saved · ${titleStr}`;
      return NextResponse.json({
        kind: "link",
        preview,
        payload: row,
        text,
        needsConfirm: false,
        duplicate,
        routed: { intent: "link", reason: "URL fast-path" },
      });
    } catch (e) {
      return NextResponse.json(
        { error: `link save failed: ${(e as Error).message}` },
        { status: 500 },
      );
    }
  }

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
    // Try the local known-foods table first. If every chunk is a hit, skip Hermes entirely.
    const { hits, leftover } = matchKnownFoods(text);
    let meal: MealOut;
    if (hits.length && !leftover) {
      meal = buildMealFromHitsAndExtra(hits, null, "unknown");
    } else {
      let extra: MealOut | null = null;
      if (leftover || !hits.length) {
        try {
          const raw = await hermesCall(MEAL_RESEARCH_PROMPT(leftover || text), { timeoutMs: 120_000 });
          extra = extractJson<MealOut>(raw);
        } catch (e) {
          if (!hits.length) {
            return NextResponse.json(
              { error: `meal research failed: ${(e as Error).message}`, intent: routed.intent },
              { status: 500 },
            );
          }
          // Partial: we still have known-food hits; proceed without extra.
        }
      }
      meal = buildMealFromHitsAndExtra(hits, extra, "unknown");
    }
    const preview = `${Math.round(meal.totals.calories)} kcal · P${Math.round(meal.totals.protein_g)}g C${Math.round(meal.totals.carbs_g)}g F${Math.round(meal.totals.fat_g)}g`;
    return NextResponse.json({ kind: "meal", preview, payload: meal, text, needsConfirm: true });
  }

  if (routed.intent === "todo") {
    let parsed: { title: string; notes: string; due_iso: string; priority: number };
    try {
      const nowIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
      const raw = await hermesCall(TODO_PARSE_PROMPT(text, nowIso), { timeoutMs: 60_000 });
      parsed = extractJson(raw);
    } catch (e) {
      // LLM failed — fall back to fast parser on the raw text
      const fb = parseFastTodo(text);
      parsed = { title: fb.title, notes: fb.notes, due_iso: "", priority: fb.priority };
    }
    const llmDue = parsed.due_iso ? new Date(parsed.due_iso).getTime() || null : null;
    const payload: TodoPayload = {
      title: (parsed.title || text).slice(0, 200),
      notes: parsed.notes || "",
      due_ts: llmDue,
      priority: Math.max(0, Math.min(3, Number(parsed.priority) || 0)),
    };
    return NextResponse.json({
      kind: "todo",
      preview: todoPreview(payload),
      payload,
      text,
      needsConfirm: true,
    });
  }

  if (routed.intent === "subscription") {
    let parsed: { name: string; amount: number; currency: string; cycle: string; next_charge_iso: string; url: string; notes: string };
    try {
      const nowIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const raw = await hermesCall(SUBSCRIPTION_PARSE_PROMPT(text, nowIso), { timeoutMs: 60_000 });
      parsed = extractJson(raw);
    } catch (e) {
      // LLM failed — try the lexical fallback before giving up.
      const fb = parseFastSubscription(text);
      if (!fb) {
        return NextResponse.json(
          { error: `subscription parse failed: ${(e as Error).message}`, intent: routed.intent },
          { status: 500 },
        );
      }
      return NextResponse.json({ kind: "subscription", preview: subscriptionPreview(fb), payload: fb, text, needsConfirm: true });
    }
    const cycle = ["weekly", "monthly", "yearly"].includes(parsed.cycle) ? (parsed.cycle as SubscriptionPayload["cycle"]) : "monthly";
    const next_charge_ts = parsed.next_charge_iso ? new Date(parsed.next_charge_iso).getTime() || null : null;
    const payload: SubscriptionPayload = {
      name: (parsed.name || text).slice(0, 80),
      amount: Math.max(0, Number(parsed.amount) || 0),
      currency: parsed.currency === "USD" ? "USD" : "TWD",
      cycle,
      next_charge_ts,
      url: parsed.url || "",
      notes: parsed.notes || "",
    };
    return NextResponse.json({ kind: "subscription", preview: subscriptionPreview(payload), payload, text, needsConfirm: true });
  }

  if (routed.intent === "habit") {
    let parsed: { name: string; status: string };
    try {
      const raw = await hermesCall(HABIT_PARSE_PROMPT(text), { timeoutMs: 45_000 });
      parsed = extractJson(raw);
    } catch (e) {
      return NextResponse.json(
        { error: `habit parse failed: ${(e as Error).message}`, intent: routed.intent },
        { status: 500 },
      );
    }
    const payload: HabitPayload = {
      name: (parsed.name || text).toString().toLowerCase().slice(0, 40).trim(),
      status: parsed.status === "skip" ? "skip" : "done",
    };
    return NextResponse.json({
      kind: "habit",
      preview: `${payload.status === "skip" ? "⊘ skip" : "✓ done"}: ${payload.name}`,
      payload,
      text,
      needsConfirm: true,
    });
  }

  if (routed.intent === "networth") {
    let parsed: { kind: string; name: string; balance: number; currency: string; account_kind: string };
    try {
      const raw = await hermesCall(NETWORTH_PARSE_PROMPT(text), { timeoutMs: 45_000 });
      parsed = extractJson(raw);
    } catch (e) {
      return NextResponse.json(
        { error: `networth parse failed: ${(e as Error).message}`, intent: routed.intent },
        { status: 500 },
      );
    }
    const kind: "cash" | "liability" = parsed.kind === "liability" ? "liability" : "cash";
    const payload: NetworthPayload = {
      kind,
      name: (parsed.name || text).slice(0, 80),
      balance: Math.abs(Number(parsed.balance) || 0),
      currency: parsed.currency === "USD" ? "USD" : "TWD",
      account_kind: parsed.account_kind || (kind === "liability" ? "loan" : "cash"),
    };
    return NextResponse.json({ kind: "networth", preview: networthPreview(payload), payload, text, needsConfirm: true });
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

  // link: Hermes-routed (rare — most link saves hit the fast-path above).
  // Try to extract a URL from the original message and save it; if there's
  // no URL we fall through to the unknown handler.
  if (routed.intent === "link") {
    const url = extractFirstUrl(text);
    if (url) {
      const leftover = text.replace(url, "").trim();
      const note = leftover && leftover.length <= 500 ? leftover : null;
      try {
        const meta = await fetchLinkMeta(url);
        const existing = db.prepare(
          `SELECT id, added_at, url, kind, title, description, author, site_name,
                  thumbnail_url, duration_seconds, status, note, opened_at
           FROM saved_links WHERE url = ? AND archived_at IS NULL`,
        ).get(url) as Record<string, unknown> | undefined;
        let row: Record<string, unknown>;
        let duplicate = false;
        if (existing) {
          row = existing;
          duplicate = true;
        } else {
          const info = db.prepare(`
            INSERT INTO saved_links (
              added_at, url, kind, title, description, author, site_name,
              thumbnail_url, duration_seconds, status, note, raw_meta_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)
          `).run(
            Date.now(), meta.url, meta.kind, meta.title, meta.description, meta.author,
            meta.site_name, meta.thumbnail_url, meta.duration_seconds, note, JSON.stringify(meta.raw),
          );
          row = db.prepare(
            `SELECT id, added_at, url, kind, title, description, author, site_name,
                    thumbnail_url, duration_seconds, status, note, opened_at
             FROM saved_links WHERE id = ?`,
          ).get(info.lastInsertRowid) as Record<string, unknown>;
        }
        const titleStr = (row.title as string | null) ?? (row.url as string);
        const preview = duplicate ? `Already saved: ${titleStr}` : `Saved · ${titleStr}`;
        return NextResponse.json({
          kind: "link",
          preview,
          payload: row,
          text,
          needsConfirm: false,
          duplicate,
          routed,
        });
      } catch (e) {
        return NextResponse.json(
          { error: `link save failed: ${(e as Error).message}`, intent: routed.intent },
          { status: 500 },
        );
      }
    }
    // fall through: no URL found, treat as unknown
  }

  // question: NL → safe read-only SQL → execute → return as an answer card.
  if (routed.intent === "question") {
    const MAX_ROWS = 500;
    const nowIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);

    type AskOut =
      | { kind: "sql"; sql: string; params?: unknown[]; explanation?: string; display?: "table" | "scalar" | "list" }
      | { kind: "narrative"; narrative: string };

    let parsed: AskOut | null = null;
    let askError: string | null = null;
    try {
      const raw = await hermesCall(ASK_PROMPT(text, nowIso), { timeoutMs: 90_000 });
      parsed = extractJson<AskOut>(raw);
    } catch (e) {
      askError = (e as Error).message;
    }

    const tsNow = Date.now();
    db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
      tsNow, "user", text, null,
    );

    // Helper to log assistant reply + return a uniform shape.
    const reply = (msg: string, extra: Record<string, unknown> = {}) => {
      db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
        Date.now(), "assistant", msg, JSON.stringify({ kind: "answer", ...extra }),
      );
      return NextResponse.json({
        kind: "answer",
        routed,
        message: msg,
        needsConfirm: false,
        ...extra,
      });
    };

    if (askError || !parsed) {
      return reply(`Couldn't answer that: ${askError || "model returned no parseable JSON"}`, {
        display: "narrative",
        answer: "Question could not be parsed.",
        error: askError,
      });
    }

    if (parsed.kind === "narrative") {
      const narrative = String(parsed.narrative || "").trim() || "No answer.";
      return reply(narrative, { display: "narrative", answer: narrative });
    }

    if (parsed.kind !== "sql" || typeof parsed.sql !== "string") {
      return reply("Model returned an invalid response shape.", {
        display: "narrative",
        answer: "Model returned an invalid response shape.",
      });
    }

    const guard = guardSelect(parsed.sql);
    if (!guard.ok) {
      return reply(`Unsafe SQL rejected: ${guard.reason}`, {
        display: "narrative",
        answer: `Unsafe SQL rejected: ${guard.reason}`,
        sql: parsed.sql,
        explanation: parsed.explanation,
      });
    }
    const safeSql = applyRowCap(guard.sql, MAX_ROWS);
    const askParams = Array.isArray(parsed.params) ? parsed.params : [];

    let columns: string[] = [];
    let rows: unknown[][] = [];
    try {
      const stmt = db.prepare(safeSql);
      const colInfo = stmt.columns() as Array<{ name: string }>;
      columns = colInfo.map((c) => c.name);
      rows = stmt.raw().all(...(askParams as never[])) as unknown[][];
    } catch (e) {
      return reply(`SQL execution failed: ${(e as Error).message}`, {
        display: "narrative",
        answer: `SQL execution failed: ${(e as Error).message}`,
        sql: safeSql,
        params: askParams,
        explanation: parsed.explanation,
      });
    }

    const truncated = rows.length >= MAX_ROWS;
    const display: "table" | "scalar" | "list" =
      parsed.display === "scalar" || parsed.display === "list" || parsed.display === "table"
        ? parsed.display
        : rows.length === 1 && columns.length === 1
          ? "scalar"
          : "table";

    let answer = parsed.explanation || "";
    if (display === "scalar" && rows[0]?.[0] != null) {
      answer = `${columns[0]} = ${rows[0][0]}${parsed.explanation ? ` — ${parsed.explanation}` : ""}`;
    } else if (rows.length === 0) {
      answer = parsed.explanation ? `${parsed.explanation} (no rows matched)` : "No matching rows.";
    } else {
      answer = parsed.explanation
        ? `${parsed.explanation} (${rows.length} row${rows.length === 1 ? "" : "s"})`
        : `${rows.length} row${rows.length === 1 ? "" : "s"}`;
    }

    return reply(answer, {
      display,
      answer,
      sql: safeSql,
      params: askParams,
      explanation: parsed.explanation || null,
      columns,
      rows,
      row_count: rows.length,
      truncated,
    });
  }

  // unknown: nothing to confirm, just log assistant reply directly
  const now = Date.now();
  db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
    now, "user", text, null,
  );
  const assistantMsg = `Not sure how to log that: ${routed.reason}`;
  db.prepare("INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)").run(
    Date.now(), "assistant", assistantMsg, JSON.stringify({ kind: routed.intent, routed }),
  );
  return NextResponse.json({ kind: routed.intent, routed, message: assistantMsg, needsConfirm: false });
}
