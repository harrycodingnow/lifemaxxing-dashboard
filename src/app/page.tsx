"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import FlipNumber from "@/components/FlipNumber";
import EditModal, { type FieldDef } from "@/components/EditModal";

type Position = {
  asset_type: string;
  symbol: string;
  display_name: string;
  currency: string;
  quantity: number;
  avg_cost: number;
  current_price: number | null;
  change_pct_today: number | null;
  market_value_native: number | null;
  pnl_native: number | null;
  pnl_pct: number | null;
  market_value_usd: number | null;
  cost_usd: number;
};

type Portfolio = {
  positions: Position[];
  totals: { market_value_usd: number; cost_usd: number; pnl_usd: number; pnl_pct: number };
  fx: { usd_twd: number };
  trade_count: number;
};

type MealItem = { name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Meal = {
  id: number;
  ts: number;
  description: string;
  meal_type: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items: MealItem[];
  sources: string[];
};

type Nutrition = {
  day: string;
  meals: Meal[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  goals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
};

type Weight = {
  range_days: number;
  rows: { id: number; ts: number; weight_kg: number; note: string | null }[];
  moving_avg_7d: { ts: number; weight_kg: number }[];
  stats: {
    count: number;
    latest_kg: number | null;
    latest_ts: number | null;
    earliest_kg: number | null;
    delta_kg: number | null;
    min_kg: number | null;
    max_kg: number | null;
  };
};

function fmtMoney(n: number | null | undefined, ccy = "USD") {
  if (n == null || !isFinite(n)) return "—";
  const sym = ccy === "TWD" ? "NT$" : "$";
  return sym + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtMoneyFull(n: number | null | undefined, ccy = "USD") {
  if (n == null || !isFinite(n)) return "—";
  const sym = ccy === "TWD" ? "NT$" : "$";
  return sym + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtPct(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  const s = n >= 0 ? "+" : "";
  return s + n.toFixed(2) + "%";
}
function colorPnl(n: number | null | undefined) {
  if (n == null) return "text-zinc-400";
  return n >= 0 ? "text-emerald-400" : "text-rose-400";
}

export default function Home() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [nutrition, setNutrition] = useState<Nutrition | null>(null);
  const [weight, setWeight] = useState<Weight | null>(null);
  const [weightRange, setWeightRange] = useState(90);
  const [toast, setToast] = useState<string | null>(null);
  const [editGoals, setEditGoals] = useState(false);
  const [editing, setEditing] = useState<null | "trades" | "meals" | "weights">(null);
  const [goalsDraft, setGoalsDraft] = useState<{ calories: string; protein_g: string; carbs_g: string; fat_g: string }>({
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });
  const [savingGoals, setSavingGoals] = useState(false);
  const [dca, setDca] = useState<{
    job: { name: string; schedule: string; action: string; source: string; target: string; amountPerRun: number };
    runs: number;
    last_run_ts: number | null;
    next_run_ts: number | null;
    totalBtc: number;
    totalUsdSpent: number;
    avgCost: number | null;
    currentPrice: number | null;
    marketValue: number | null;
    pnl: number | null;
    pnlPct: number | null;
    history: { ts: number; btc: number; price: number; usd: number }[];
  } | null>(null);

  type Pending =
    | { kind: "trade"; preview: string; payload: { asset_type: string; symbol: string; display_name: string; side: "buy" | "sell"; quantity: number; price: number; currency: string; note: string }; text: string }
    | { kind: "meal"; preview: string; payload: { meal_type: string; items: MealItem[]; totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number }; sources: string[]; confidence?: string; notes?: string }; text: string }
    | { kind: "weight"; preview: string; payload: { weight_kg: number; note: string }; text: string }
    | { kind: "batch"; preview: string; payload: { entries: Array<{ kind: "trade" | "meal" | "weight"; payload: any; raw?: string }> }; text: string };
  const [pending, setPending] = useState<Pending | null>(null);
  const [committing, setCommitting] = useState(false);
  const [displayCcy, setDisplayCcy] = useState<"TWD" | "USD">("TWD");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("displayCcy") : null;
    if (saved === "USD" || saved === "TWD") setDisplayCcy(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("displayCcy", displayCcy);
  }, [displayCcy]);

  const refreshAll = useCallback(async () => {
    const [p, n, w, d] = await Promise.all([
      fetch("/api/portfolio").then((r) => r.json()),
      fetch("/api/nutrition").then((r) => r.json()),
      fetch(`/api/weights?days=${weightRange}`).then((r) => r.json()),
      fetch("/api/recurring").then((r) => r.json()).catch(() => null),
    ]);
    setPortfolio(p);
    setNutrition(n);
    setWeight(w);
    setDca(d);
  }, [weightRange]);

  useEffect(() => {
    refreshAll();
    const t = setInterval(() => {
      fetch("/api/portfolio").then((r) => r.json()).then(setPortfolio).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [refreshAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setText("");
    try {
      const r = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const j = await r.json();
      if (!r.ok) {
        setToast(`Error: ${j.error || r.statusText}`);
      } else if (j.needsConfirm) {
        setPending({ kind: j.kind, preview: j.preview, payload: j.payload, text: t });
      } else {
        await refreshAll();
        setToast("Saved");
      }
    } catch (e) {
      setToast(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending() {
    if (!pending || committing) return;
    setCommitting(true);
    try {
      const r = await fetch("/api/log/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: pending.kind, payload: pending.payload, text: pending.text }),
      });
      const j = await r.json();
      if (!r.ok) {
        setToast(`Commit failed: ${j.error || r.statusText}`);
      } else {
        setToast("Saved");
      }
      setPending(null);
      await refreshAll();
    } catch (e) {
      setToast(`Commit error: ${(e as Error).message}`);
    } finally {
      setCommitting(false);
    }
  }

  function cancelPending() {
    setPending(null);
  }

  const totals = nutrition?.totals;
  const goals = nutrition?.goals;
  const fx = portfolio?.fx.usd_twd ?? 0;

  function toDisplay(n: number | null | undefined, native: string): number | null {
    if (n == null || !isFinite(n)) return null;
    if (native === displayCcy) return n;
    if (!fx) return null;
    const usd = native === "TWD" ? n / fx : n;
    return displayCcy === "TWD" ? usd * fx : usd;
  }
  function totalsToDisplay(usd: number | null | undefined): number | null {
    if (usd == null || !isFinite(usd)) return null;
    return displayCcy === "TWD" && fx ? usd * fx : usd;
  }

  const classGroups = [
    { key: "tw_stock" as const, label: "TW", pill: "TWSE", pillTone: "bg-emerald-900/40 text-emerald-400" },
    { key: "us_stock" as const, label: "US", pill: "NYSE/NDQ", pillTone: "bg-emerald-900/40 text-emerald-400" },
    { key: "crypto" as const, label: "Crypto", pill: "24/7", pillTone: "bg-blue-900/40 text-blue-400" },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">Lifemaxxing</h1>
        <div className="flex items-center gap-3 text-[12px] text-zinc-500">
          <span>USD/TWD {portfolio?.fx.usd_twd.toFixed(2) ?? "—"}</span>
          <span>·</span>
          <span>{portfolio?.trade_count ?? 0} trades</span>
          <span>·</span>
          <span>{nutrition?.meals.length ?? 0} meals</span>
          <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-[12px] ml-2">
            {(["TWD", "USD"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setDisplayCcy(c)}
                className={`px-2 py-0.5 ${displayCcy === c ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main grid — fits viewport */}
      <main className="flex-1 grid grid-cols-12 grid-rows-6 gap-2 p-2 overflow-hidden min-h-0">
        {/* Portfolio header (total + per-class KPIs) */}
        <section className="col-span-12 row-span-1 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 flex items-center justify-between gap-4 min-h-0">
          <div className="shrink-0">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Portfolio</div>
            <div className="text-3xl font-semibold leading-tight">
              <FlipNumber value={fmtMoney(totalsToDisplay(portfolio?.totals.market_value_usd), displayCcy)} />
            </div>
            <div className={`text-[13px] leading-tight ${colorPnl(portfolio?.totals.pnl_usd)}`}>
              <FlipNumber value={`${fmtMoney(totalsToDisplay(portfolio?.totals.pnl_usd), displayCcy)} (${fmtPct(portfolio?.totals.pnl_pct)})`} />
            </div>
          </div>
          <div className="flex-1 grid grid-cols-4 gap-2">
            {classGroups.map((g) => {
              const rows = (portfolio?.positions ?? []).filter((p) => p.asset_type === g.key);
              let mv = 0;
              let weightedTodayNum = 0;
              let weightedTodayDen = 0;
              for (const p of rows) {
                const v = toDisplay(p.market_value_native, p.currency);
                if (v != null) mv += v;
                if (p.change_pct_today != null && p.market_value_usd != null) {
                  weightedTodayNum += p.change_pct_today * p.market_value_usd;
                  weightedTodayDen += p.market_value_usd;
                }
              }
              const today = weightedTodayDen > 0 ? weightedTodayNum / weightedTodayDen : null;
              return (
                <div key={g.key} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5">
                  <div className="flex items-center justify-between text-[12px] text-zinc-500">
                    <span>{g.label}</span>
                    <span>{rows.length} pos</span>
                  </div>
                  <div className="text-lg font-semibold tabular-nums"><FlipNumber value={fmtMoney(mv || null, displayCcy)} /></div>
                  <div className={`text-[12px] ${colorPnl(today)}`}>{today != null ? <><FlipNumber value={fmtPct(today)} /> today</> : "—"}</div>
                </div>
              );
            })}
            {/* Recurring DCA card */}
            <div className="rounded-lg border border-amber-900/60 bg-gradient-to-br from-amber-950/40 to-zinc-900 px-3 py-1.5">
              <div className="flex items-center justify-between text-[12px] text-amber-400/80">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  DCA · {dca?.job.source ?? "USDC"}→{dca?.job.target ?? "BTC"}
                </span>
                <span className="text-zinc-500">{dca?.runs ?? 0} runs</span>
              </div>
              <div className="text-lg font-semibold tabular-nums text-zinc-100">
                {dca?.totalBtc != null ? `${dca.totalBtc.toFixed(6)} ${dca.job.target}` : "—"}
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className={colorPnl(dca?.pnl)}>
                  {dca?.pnl != null
                    ? `${fmtMoney(totalsToDisplay(dca.pnl), displayCcy)} (${fmtPct(dca.pnlPct)})`
                    : dca?.totalUsdSpent != null
                    ? `${fmtMoney(totalsToDisplay(dca.totalUsdSpent), displayCcy)} in`
                    : "—"}
                </span>
                <span className="text-zinc-500">
                  ${dca?.job.amountPerRun ?? 8}/day
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* TW / US / Crypto holdings (3 columns) */}
        {classGroups.map((g) => {
          const rows = (portfolio?.positions ?? []).filter((p) => p.asset_type === g.key);
          return (
            <section
              key={g.key}
              className="col-span-4 row-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 flex flex-col min-h-0"
            >
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <h3 className="text-base font-medium text-zinc-200">{g.label === "TW" ? "TW Stocks" : g.label === "US" ? "US Stocks" : "Crypto"}</h3>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${g.pillTone}`}>{g.pill}</span>
                  <button
                    onClick={() => setEditing("trades")}
                    className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                    title="Edit trades"
                  >✎</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0">
                {rows.length === 0 && (
                  <div className="text-[13px] text-zinc-500 py-2">No positions</div>
                )}
                {rows.map((p) => (
                  <div key={`${p.asset_type}|${p.symbol}`} className="flex items-center justify-between text-[13px]">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-100">{p.symbol.replace(/\.TW$/, "")}</div>
                      <div className="truncate text-[12px] text-zinc-500">{p.display_name}</div>
                    </div>
                    <div className="text-right whitespace-nowrap tabular-nums">
                      <div className="text-zinc-100"><FlipNumber value={fmtMoneyFull(p.current_price, p.currency)} /></div>
                      <div className={`text-[12px] ${colorPnl(p.change_pct_today)}`}><FlipNumber value={fmtPct(p.change_pct_today)} /></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-zinc-800 flex justify-between text-[12px] shrink-0">
                <span className="text-zinc-500">Value</span>
                <span className="text-zinc-200 font-medium tabular-nums">
                  {fmtMoney(rows.reduce((s, p) => s + (toDisplay(p.market_value_native, p.currency) ?? 0), 0), displayCcy)}
                </span>
              </div>
            </section>
          );
        })}

        {/* Nutrition */}
        <section className="col-span-6 row-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between mb-1.5 shrink-0">
            <h2 className="text-base font-medium text-zinc-200">Nutrition · {nutrition?.day ?? "today"}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-zinc-500">{nutrition?.meals.length ?? 0} meals</span>
              <button
                onClick={() => setEditing("meals")}
                className="text-[12px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                title="Edit meals"
              >
                ✎ meals
              </button>
              <button
                onClick={() => {
                  const g = nutrition?.goals;
                  setGoalsDraft({
                    calories: g ? String(g.calories) : "",
                    protein_g: g ? String(g.protein_g) : "",
                    carbs_g: g ? String(g.carbs_g) : "",
                    fat_g: g ? String(g.fat_g) : "",
                  });
                  setEditGoals(true);
                }}
                className="text-[12px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                title="Edit daily goals"
              >
                ⚙ goals
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 shrink-0">
            {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((k) => {
              const label = k === "calories" ? "kcal" : k === "protein_g" ? "P" : k === "carbs_g" ? "C" : "F";
              const cur = totals?.[k] ?? 0;
              const goal = goals?.[k] ?? 1;
              const pct = Math.min(100, (cur / goal) * 100);
              return (
                <div key={k} className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
                  <div className="text-lg font-semibold leading-tight tabular-nums">
                    {Math.round(cur)}
                    <span className="ml-1 text-[11px] text-zinc-500">/{goal}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex-1 overflow-y-auto pr-1 space-y-1 min-h-0">
            {(nutrition?.meals ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[13px] border-b border-zinc-800/60 py-0.5">
                <div className="min-w-0 flex-1 truncate">
                  <span className="text-[11px] uppercase text-zinc-500 mr-1">{m.meal_type || "meal"}</span>
                  <span className="text-zinc-200">{m.description}</span>
                </div>
                <div className="text-zinc-400 tabular-nums whitespace-nowrap ml-2">
                  {Math.round(m.calories)} kcal · P{Math.round(m.protein_g)} C{Math.round(m.carbs_g)} F{Math.round(m.fat_g)}
                </div>
              </div>
            ))}
            {(nutrition?.meals.length ?? 0) === 0 && (
              <div className="py-3 text-center text-[13px] text-zinc-500">No meals logged today.</div>
            )}
          </div>
        </section>

        {/* Weight */}
        <section className="col-span-6 row-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium text-zinc-200">Weight</h2>
              <button
                onClick={() => setEditing("weights")}
                className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                title="Edit weigh-ins"
              >✎</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-lg font-semibold leading-tight tabular-nums">
                  {weight?.stats.latest_kg != null ? `${weight.stats.latest_kg.toFixed(1)} kg` : "—"}
                </div>
                <div className={`text-[12px] leading-tight ${colorPnl(weight?.stats.delta_kg != null ? -(weight.stats.delta_kg) : null)}`}>
                  {weight?.stats.delta_kg != null
                    ? `${weight.stats.delta_kg >= 0 ? "+" : ""}${weight.stats.delta_kg.toFixed(1)} kg / ${weight.range_days}d`
                    : "no data"}
                </div>
              </div>
              <select
                value={weightRange}
                onChange={(e) => setWeightRange(parseInt(e.target.value, 10))}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[12px]"
              >
                <option value={30}>30d</option>
                <option value={90}>90d</option>
                <option value={180}>180d</option>
                <option value={365}>1y</option>
              </select>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {(weight?.rows.length ?? 0) === 0 ? (
              <div className="h-full flex items-center justify-center text-[13px] text-zinc-500">
                No weigh-ins. Try <code className="text-zinc-300 ml-1">weight 72.5kg</code>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={(weight?.rows ?? []).map((r, i) => ({
                    ts: r.ts,
                    date: new Date(r.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                    kg: r.weight_kg,
                    ma: weight?.moving_avg_7d[i]?.weight_kg,
                  }))}
                  margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                >
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={9} minTickGap={20} />
                  <YAxis stroke="#71717a" fontSize={9} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
                    labelStyle={{ color: "#a1a1aa" }}
                    formatter={(value, name) => [`${value} kg`, name === "kg" ? "weigh-in" : "7d avg"]}
                  />
                  {weight?.stats.latest_kg != null && (
                    <ReferenceLine y={weight.stats.latest_kg} stroke="#3f3f46" strokeDasharray="4 4" />
                  )}
                  <Line type="monotone" dataKey="kg" stroke="#60a5fa" strokeWidth={1.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="ma" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
        {/* Input row */}
        <section className="col-span-12 row-span-1 flex items-center justify-center min-h-0">
          <div className="w-full max-w-2xl rounded-full border border-zinc-700/80 bg-zinc-900/70 backdrop-blur pl-5 pr-1.5 py-1.5 flex items-center gap-2 shadow-lg shadow-black/30 focus-within:border-zinc-500 focus-within:bg-zinc-900/90 transition-colors">
            <span className="text-zinc-600 text-sm select-none">›</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={busy ? "Hermes is thinking…" : "Log a trade, meal, or weight…"}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-zinc-500"
              disabled={busy}
            />
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 transition-colors"
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur px-4 py-1.5 text-base text-zinc-200 shadow-xl">
          {toast}
        </div>
      )}

      {/* Confirm modal */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-xl font-semibold">
                Confirm {pending.kind === "trade" ? "trade" : pending.kind === "meal" ? "meal" : "weight"}
              </h3>
              <span className="text-[12px] uppercase tracking-wider text-zinc-500">parsed by Hermes</span>
            </div>
            <div className="mb-3 rounded-lg bg-zinc-950/50 border border-zinc-800 px-3 py-2 text-base text-zinc-400">
              You typed: <span className="text-zinc-200">{pending.text}</span>
            </div>

            {pending.kind === "trade" && (
              <div className="space-y-2 text-lg">
                <div className="flex justify-between"><span className="text-zinc-400">Action</span><span className="font-medium">{pending.payload.side.toUpperCase()}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Asset</span><span className="font-medium">{pending.payload.display_name} <span className="text-zinc-500">({pending.payload.symbol})</span></span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Type</span><span>{pending.payload.asset_type}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Quantity</span><span>{pending.payload.quantity}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Price</span><span>{pending.payload.currency} {pending.payload.price}</span></div>
                <div className="flex justify-between border-t border-zinc-800 pt-2 mt-2 font-medium"><span>Total</span><span>{pending.payload.currency} {(pending.payload.quantity * pending.payload.price).toLocaleString(undefined,{maximumFractionDigits:2})}</span></div>
              </div>
            )}

            {pending.kind === "meal" && (
              <div className="space-y-2 text-lg">
                <div className="flex justify-between"><span className="text-zinc-400">Meal</span><span className="font-medium capitalize">{pending.payload.meal_type}</span></div>
                <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                  {pending.payload.items.map((it, i: number) => (
                    <div key={i} className="px-3 py-2 text-base">
                      <div className="flex justify-between">
                        <span className="text-zinc-200">{it.name}</span>
                        <span className="text-zinc-400">{it.portion}</span>
                      </div>
                      <div className="text-[13px] text-zinc-500">
                        {Math.round(it.calories)} kcal · P{Math.round(it.protein_g)} C{Math.round(it.carbs_g)} F{Math.round(it.fat_g)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t border-zinc-800 pt-2 mt-2 font-medium">
                  <span>Total</span>
                  <span>{Math.round(pending.payload.totals.calories)} kcal · P{Math.round(pending.payload.totals.protein_g)} C{Math.round(pending.payload.totals.carbs_g)} F{Math.round(pending.payload.totals.fat_g)}</span>
                </div>
                {pending.payload.sources?.length > 0 && (
                  <div className="text-[12px] text-zinc-500 truncate">
                    src: {pending.payload.sources.join(", ")}
                  </div>
                )}
              </div>
            )}

            {pending.kind === "weight" && (
              <div className="space-y-2 text-lg">
                <div className="flex justify-between"><span className="text-zinc-400">Weight</span><span className="font-medium">{pending.payload.weight_kg} kg ({(pending.payload.weight_kg * 2.20462).toFixed(1)} lbs)</span></div>
                {pending.payload.note && (
                  <div className="flex justify-between"><span className="text-zinc-400">Note</span><span>{pending.payload.note}</span></div>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={cancelPending}
                disabled={committing}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-lg hover:bg-zinc-800 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={confirmPending}
                disabled={committing}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-lg font-medium hover:bg-emerald-500 disabled:opacity-40"
              >
                {committing ? "Saving…" : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit goals modal */}
      {editGoals && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-lg font-semibold">Daily nutrition goals</h3>
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">per day</span>
            </div>
            <div className="space-y-2">
              {([
                ["calories", "Calories (kcal)"],
                ["protein_g", "Protein (g)"],
                ["carbs_g", "Carbs (g)"],
                ["fat_g", "Fat (g)"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-400">{label}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={goalsDraft[k]}
                    onChange={(e) => setGoalsDraft((d) => ({ ...d, [k]: e.target.value }))}
                    placeholder={String(nutrition?.goals[k] ?? "")}
                    className="w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-base tabular-nums outline-none focus:border-zinc-500"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setEditGoals(false)}
                disabled={savingGoals}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-base hover:bg-zinc-800 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSavingGoals(true);
                  const payload: Record<string, number> = {};
                  for (const k of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
                    const n = Number(goalsDraft[k]);
                    if (Number.isFinite(n) && n > 0) payload[k] = n;
                  }
                  try {
                    await fetch("/api/goals", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ goals: payload }),
                    });
                    await refreshAll();
                    setToast("Goals updated.");
                    setEditGoals(false);
                  } catch {
                    setToast("Failed to save goals.");
                  } finally {
                    setSavingGoals(false);
                  }
                }}
                disabled={savingGoals}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-base font-medium hover:bg-emerald-500 disabled:opacity-40"
              >
                {savingGoals ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <EditModal
        open={editing === "trades"}
        onClose={() => setEditing(null)}
        title="Edit trades"
        resource="trades"
        fields={[
          { key: "ts", label: "When", type: "datetime", width: "w-44" },
          { key: "side", label: "Side", type: "select", options: [{ value: "buy", label: "buy" }, { value: "sell", label: "sell" }], width: "w-20" },
          { key: "asset_type", label: "Type", type: "select", options: [{ value: "tw_stock", label: "tw" }, { value: "us_stock", label: "us" }, { value: "crypto", label: "crypto" }], width: "w-24" },
          { key: "symbol", label: "Symbol", type: "text", width: "w-28" },
          { key: "display_name", label: "Name", type: "text" },
          { key: "quantity", label: "Qty", type: "number", step: "any", width: "w-24" },
          { key: "price", label: "Price", type: "number", step: "any", width: "w-28" },
          { key: "currency", label: "Ccy", type: "text", width: "w-16" },
          { key: "note", label: "Note", type: "text" },
        ]}
        onChanged={refreshAll}
      />

      <EditModal
        open={editing === "meals"}
        onClose={() => setEditing(null)}
        title="Edit meals (last 30d)"
        resource="meals"
        fetchUrl="/api/meals?days=30"
        fields={[
          { key: "ts", label: "When", type: "datetime", width: "w-44" },
          { key: "meal_type", label: "Meal", type: "select", options: [
            { value: "breakfast", label: "breakfast" }, { value: "lunch", label: "lunch" }, { value: "dinner", label: "dinner" }, { value: "snack", label: "snack" }, { value: "", label: "—" },
          ], width: "w-28" },
          { key: "description", label: "Description", type: "text" },
          { key: "calories", label: "kcal", type: "number", step: "1", width: "w-20" },
          { key: "protein_g", label: "P", type: "number", step: "0.1", width: "w-16" },
          { key: "carbs_g", label: "C", type: "number", step: "0.1", width: "w-16" },
          { key: "fat_g", label: "F", type: "number", step: "0.1", width: "w-16" },
        ]}
        onChanged={refreshAll}
      />

      <EditModal
        open={editing === "weights"}
        onClose={() => setEditing(null)}
        title="Edit weigh-ins"
        resource="weights"
        fetchUrl={`/api/weights?days=${weightRange}`}
        fields={[
          { key: "ts", label: "When", type: "datetime", width: "w-44" },
          { key: "weight_kg", label: "kg", type: "number", step: "0.1", width: "w-24" },
          { key: "note", label: "Note", type: "text" },
        ]}
        onChanged={refreshAll}
      />
    </div>
  );
}
