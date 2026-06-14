"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { Marquee, type MarqueeItem } from "@/components/Marquee";
import TodoMenu from "@/components/TodoMenu";
import HabitPanel from "@/components/HabitPanel";
import SubscriptionPanel from "@/components/SubscriptionPanel";
import NetWorthPanel from "@/components/NetWorthPanel";
import CalendarPanel from "@/components/CalendarPanel";
import SpotifyPanel from "@/components/SpotifyPanel";
import WeatherPanel from "@/components/WeatherPanel";
import CustomWidget from "@/components/CustomWidget";
import WidgetCreator from "@/components/WidgetCreator";
import WeeklyReview from "@/components/WeeklyReview";
import ReadLaterPanel from "@/components/ReadLaterPanel";
import { DashboardLayout, type WidgetSpec } from "@/components/DashboardLayout";
import { isDemoMode, setDemoMode, installDemoFetch, DEMO_EVENT } from "@/lib/demo-data";
import {
  isLiquidGlassEnabled,
  setLiquidGlassEnabled,
  LIQUID_GLASS_CLASS,
  LIQUID_GLASS_EVENT,
} from "@/lib/liquid-glass";
import { useT, setLang } from "@/lib/i18n";

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

// Per-category tone for news labels (chips, marquee, panel).
const NEWS_CATEGORY_TONE: Record<string, string> = {
  Markets: "text-emerald-400",
  Business: "text-teal-400",
  World: "text-sky-400",
  Politics: "text-rose-400",
  Tech: "text-violet-400",
  Taiwan: "text-amber-400",
};
function newsTone(category?: string) {
  return (category && NEWS_CATEGORY_TONE[category]) || "text-zinc-400";
}

export default function Home() {
  const { t, lang } = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const queueRef = useRef<string[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [nutrition, setNutrition] = useState<Nutrition | null>(null);
  const [weight, setWeight] = useState<Weight | null>(null);
  const [weightRange, setWeightRange] = useState(90);
  const [toast, setToast] = useState<string | null>(null);
  const [editGoals, setEditGoals] = useState(false);
  const [editing, setEditing] = useState<null | "trades" | "meals" | "weights">(null);
  const [holdingsView, setHoldingsView] = useState<null | "all" | "tw_stock" | "us_stock" | "crypto">(null);
  useEffect(() => {
    if (!holdingsView) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHoldingsView(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [holdingsView]);

  // ── Projects ───────────────────────────────────────────────────────────
  type ProjectRow = {
    id: number;
    created_ts: number;
    updated_ts: number;
    name: string;
    description: string | null;
    phase: string;
    status: string;
    current_problem: string | null;
    next_step: string | null;
    priority: number;
    url: string | null;
    sort_order: number;
    archived_at: number | null;
  };
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [editingProject, setEditingProject] = useState<ProjectRow | "new" | null>(null);
  const loadProjects = useCallback(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProjects(j.rows ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (!editingProject) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditingProject(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingProject]);
  const [goalsDraft, setGoalsDraft] = useState<{ calories: string; protein_g: string; carbs_g: string; fat_g: string }>({
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });
  const [savingGoals, setSavingGoals] = useState(false);
  const [dcaOpen, setDcaOpen] = useState(false);
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
    | { kind: "todo"; preview: string; payload: { title: string; notes: string; due_ts: number | null; priority: number }; text: string }
    | { kind: "subscription"; preview: string; payload: { name: string; amount: number; currency: "TWD" | "USD"; cycle: "weekly" | "monthly" | "yearly"; next_charge_ts: number | null; url: string; notes: string }; text: string }
    | { kind: "habit"; preview: string; payload: { name: string; status: "done" | "skip" }; text: string }
    | { kind: "networth"; preview: string; payload: { kind: "cash" | "liability"; name: string; balance: number; currency: "TWD" | "USD"; account_kind: string }; text: string }
    | { kind: "batch"; preview: string; payload: { entries: Array<{ kind: "trade" | "meal" | "weight" | "todo" | "subscription" | "habit" | "networth"; payload: any; raw?: string }> }; text: string };
  const [pending, setPending] = useState<Pending | null>(null);
  // "Ask your data" answer card. Set when the log route returns kind=answer.
  // Lives separately from `pending` because there's nothing to confirm — it's
  // a read-only display surfaced above the input row until the user dismisses.
  type AnswerCard = {
    question: string;
    answer: string;
    display: "table" | "scalar" | "list" | "narrative";
    sql?: string | null;
    params?: unknown[];
    explanation?: string | null;
    columns?: string[];
    rows?: unknown[][];
    row_count?: number;
    truncated?: boolean;
    error?: string | null;
  };
  const [answer, setAnswer] = useState<AnswerCard | null>(null);
  const [answerSqlOpen, setAnswerSqlOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [displayCcy, setDisplayCcy] = useState<"TWD" | "USD">("TWD");
  // Demo/mock-data mode (for screenshots). Install the fetch interceptor
  // synchronously on first render so the very first refreshAll already sees it.
  const [demoMode, setDemoModeState] = useState(false);
  if (typeof window !== "undefined") installDemoFetch();
  // Liquid Glass theme: persisted opt-in iOS-26-ish frosted look. State is
  // mirrored as a class on <html> so the global CSS overrides apply
  // synchronously (no flash of plain theme on page refresh).
  const [glass, setGlassState] = useState(false);

  type Stats = {
    cashflow: { buys_usd: number; sells_usd: number; net_usd: number; trade_count: number; fx_used: number };
    streaks: { meal_log: number; protein_goal: number; protein_hit_last_7: number; dca: number; weigh_in: number };
    window_days: number;
  };
  const [stats, setStats] = useState<Stats | null>(null);
  const [cashWindow, setCashWindow] = useState(1);
  type NetWorthSummary = {
    portfolio_ok: boolean;
    components: { portfolio: { usd: number; twd: number }; cash: { usd: number; twd: number }; liabilities: { usd: number; twd: number } };
    net_worth: { usd: number; twd: number };
    counts: { cash: number; liabilities: number };
  };
  const [networth, setNetworth] = useState<NetWorthSummary | null>(null);
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [nutritionDay, setNutritionDay] = useState<string>(todayStr());
  const shiftNutritionDay = (delta: number) => {
    const [y, m, d] = nutritionDay.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    const next = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    if (next > todayStr()) return; // no future
    setNutritionDay(next);
  };
  const isToday = nutritionDay === todayStr();
  type Headline = { title: string; link: string; source: string; category?: string };
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [newsCategory, setNewsCategory] = useState<string>("All");
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsSummary, setNewsSummary] = useState<string | null>(null);
  const [newsSummaryLoading, setNewsSummaryLoading] = useState(false);
  const [newsSummaryOpen, setNewsSummaryOpen] = useState(false);
  type CalEventLite = { calendar: string; title: string; start_ts: number | null; all_day: boolean; multi_day: boolean };
  const [nextEvent, setNextEvent] = useState<CalEventLite | null>(null);
  type WeatherLite = { location: string; current: { temp: number; emoji: string; label: string } } | null;
  const [weather, setWeather] = useState<WeatherLite>(null);
  type CustomWidgetRow = { id: number; title: string; html: string; w: number; h: number };
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetRow[]>([]);
  const loadCustomWidgets = useCallback(async () => {
    try {
      const r = await fetch("/api/widgets", { cache: "no-store" });
      const j = await r.json();
      if (Array.isArray(j?.widgets)) setCustomWidgets(j.widgets);
    } catch {
      /* keep last */
    }
  }, []);
  const deleteCustomWidget = useCallback(async (id: number) => {
    setCustomWidgets((cur) => cur.filter((w) => w.id !== id)); // optimistic
    try {
      await fetch(`/api/widgets/${id}`, { method: "DELETE" });
    } catch {
      loadCustomWidgets(); // re-sync on failure
    }
  }, [loadCustomWidgets]);
  useEffect(() => { loadCustomWidgets(); }, [loadCustomWidgets]);
  type LastEntry = { kind: "trade" | "meal" | "weight"; id: number; label: string; at: number };
  const [lastEntry, setLastEntry] = useState<LastEntry | null>(null);
  const [listening, setListening] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(false);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("autoConfirm") : null;
    if (saved === "1") setAutoConfirm(true);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("autoConfirm", autoConfirm ? "1" : "0");
  }, [autoConfirm]);
  // Demo mode: read persisted flag on mount, and re-render + re-fetch on flip.
  useEffect(() => {
    setDemoModeState(isDemoMode());
    const onChange = () => {
      setDemoModeState(isDemoMode());
      refreshAllRef.current?.();
      // Also refresh the headline marquee so the demo looks complete.
      fetch("/api/headlines")
        .then((r) => r.json())
        .then((j) => Array.isArray(j?.headlines) && setHeadlines(j.headlines))
        .catch(() => {});
    };
    window.addEventListener(DEMO_EVENT, onChange);
    return () => window.removeEventListener(DEMO_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Liquid Glass theme: same pattern — hydrate from localStorage and react
  // to any in-page toggle. We also sync the class on <html> here so we cover
  // the path where another tab flipped it.
  useEffect(() => {
    const on = isLiquidGlassEnabled();
    setGlassState(on);
    document.documentElement.classList.toggle(LIQUID_GLASS_CLASS, on);
    const onChange = () => {
      const v = isLiquidGlassEnabled();
      setGlassState(v);
      document.documentElement.classList.toggle(LIQUID_GLASS_CLASS, v);
    };
    window.addEventListener(LIQUID_GLASS_EVENT, onChange);
    return () => window.removeEventListener(LIQUID_GLASS_EVENT, onChange);
  }, []);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const PLACEHOLDER_EXAMPLES = [
    t("chat.placeholder.default"),
    "bought 5 NVDA @ 880",
    "had a louisa shake + bagel",
    "72.3kg",
    "todo: pay rent @tomorrow !high",
    "did meditation",
    "skipped gym",
    "netflix 390/mo",
    "cathay cash 250000",
    "sold 0.01 BTC @ 95000",
    "how much did I spend on coffee this month?",
    "all my BTC trades",
    "average protein on days I hit the gym",
    "what are my top 5 longest habit streaks?",
  ];

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("displayCcy") : null;
    if (saved === "USD" || saved === "TWD") setDisplayCcy(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("displayCcy", displayCcy);
  }, [displayCcy]);

  const refreshAll = useCallback(async () => {
    const tz = new Date().getTimezoneOffset(); // minutes east of UTC, negated
    const [p, n, w, d, s, nw] = await Promise.all([
      fetch("/api/portfolio").then((r) => r.json()),
      fetch(`/api/nutrition?day=${nutritionDay}`).then((r) => r.json()),
      fetch(`/api/weights?days=${weightRange}`).then((r) => r.json()),
      fetch("/api/recurring").then((r) => r.json()).catch(() => null),
      fetch(`/api/stats?window=${cashWindow}&tz=${tz}`).then((r) => r.json()).catch(() => null),
      fetch("/api/networth").then((r) => r.json()).catch(() => null),
    ]);
    setPortfolio(p);
    setNutrition(n);
    setWeight(w);
    setDca(d);
    setStats(s);
    setNetworth(nw);
  }, [weightRange, cashWindow, nutritionDay]);

  // Stable ref so the demo-mode listener (mounted once) can call the latest refreshAll.
  const refreshAllRef = useRef<(() => void) | null>(null);
  useEffect(() => { refreshAllRef.current = refreshAll; }, [refreshAll]);

  // Fetch an AI news briefing (shells to Hermes server-side). Respects the
  // active category filter so "Summarize" on the Taiwan tab summarizes Taiwan.
  const fetchNewsSummary = useCallback(async (category: string) => {
    setNewsSummaryLoading(true);
    setNewsSummaryOpen(true);
    setNewsSummary(null);
    try {
      const q = category && category !== "All" ? `?category=${encodeURIComponent(category.toLowerCase())}` : "";
      const r = await fetch(`/api/headlines/summary${q}`);
      const j = await r.json();
      setNewsSummary(j?.summary || (j?.error ? `Couldn't summarize: ${j.error}` : "No summary available."));
    } catch (e) {
      setNewsSummary(`Couldn't summarize: ${String(e)}`);
    } finally {
      setNewsSummaryLoading(false);
    }
  }, []);
  // Clear a stale summary when the category filter changes.
  useEffect(() => { setNewsSummary(null); setNewsSummaryOpen(false); }, [newsCategory]);

  useEffect(() => {
    refreshAll();
    const t = setInterval(() => {
      fetch("/api/portfolio").then((r) => r.json()).then(setPortfolio).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [refreshAll]);

  // Headlines for top marquee — fetch once + refresh every 5 minutes
  useEffect(() => {
    const load = () =>
      fetch("/api/headlines")
        .then((r) => r.json())
        .then((j) => Array.isArray(j?.headlines) && setHeadlines(j.headlines))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Next upcoming calendar event for the marquee. Light poll (shells out to osascript).
  useEffect(() => {
    const load = () =>
      fetch("/api/calendar?days=14")
        .then((r) => r.json())
        .then((j) => {
          if (!j?.available || !Array.isArray(j.events)) { setNextEvent(null); return; }
          const now = Date.now();
          const upcoming = j.events.find((e: CalEventLite) => e.start_ts != null && e.start_ts >= now) || j.events[0] || null;
          setNextEvent(upcoming);
        })
        .catch(() => setNextEvent(null));
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Weather for the marquee.
  useEffect(() => {
    const load = () =>
      fetch("/api/weather")
        .then((r) => r.json())
        .then((j) => {
          if (j?.available && j.current) setWeather({ location: j.location, current: j.current });
          else setWeather(null);
        })
        .catch(() => setWeather(null));
    load();
    const t = setInterval(load, 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const ms = toast === "Saved" && lastEntry ? 10000 : 3000;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, lastEntry]);

  // Surface Spotify OAuth callback status (?spotify=connected|denied|bad_state|error)
  // as a toast, then strip the query param so a refresh doesn't re-fire it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const s = url.searchParams.get("spotify");
    if (!s) return;
    const msg: Record<string, string> = {
      connected: "🎧 Spotify connected.",
      denied: "Spotify connection denied.",
      bad_state: "Spotify login failed: state mismatch. Try the Connect button again (must stay on 127.0.0.1, not localhost).",
      error: "Spotify token exchange failed. Check SPOTIFY_CLIENT_ID / SECRET in .env.local.",
    };
    setToast(msg[s] ?? `Spotify: ${s}`);
    url.searchParams.delete("spotify");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Rotate placeholder examples every 4s when input is empty + not busy.
  useEffect(() => {
    if (busy || text) return;
    const t = setInterval(() => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, [busy, text, PLACEHOLDER_EXAMPLES.length]);

  // Auto-clear pinned last-entry after 30s.
  useEffect(() => {
    if (!lastEntry) return;
    const remaining = 30000 - (Date.now() - lastEntry.at);
    if (remaining <= 0) { setLastEntry(null); return; }
    const t = setTimeout(() => setLastEntry(null), remaining);
    return () => clearTimeout(t);
  }, [lastEntry]);

  // Voice dictation via MediaRecorder → /api/transcribe (local faster-whisper).
  // Detected after mount so SSR (always false) matches the first client render
  // and we don't trip a hydration mismatch on the mic button.
  const [speechSupported, setSpeechSupported] = useState(false);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== "undefined"
    ) {
      setSpeechSupported(true);
    }
  }, []);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  async function startDictation() {
    if (!speechSupported) return;
    // Toggle: if recording, stop → triggers onstop → upload.
    if (listening && recorderRef.current) {
      try { recorderRef.current.stop(); } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Pick a mimetype the browser actually supports (Safari prefers mp4).
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mime = mimeCandidates.find((m) => (window as unknown as { MediaRecorder: { isTypeSupported: (m: string) => boolean } }).MediaRecorder.isTypeSupported(m)) || "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstart = () => setListening(true);
      rec.onerror = (e) => {
        setListening(false);
        recorderRef.current = null;
        setToast(`Recorder error: ${(e as unknown as { error?: { message?: string } }).error?.message || "unknown"}`);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      rec.onstop = async () => {
        setListening(false);
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) { setToast("No audio captured"); return; }
        try {
          setToast("Transcribing…");
          const form = new FormData();
          const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : (rec.mimeType || "").includes("ogg") ? "ogg" : "webm";
          form.append("audio", blob, `voice.${ext}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: form });
          const j = await r.json();
          if (!r.ok) { setToast(`Voice error: ${j.error || r.statusText}`); return; }
          const t = (j.text || "").trim();
          if (!t) { setToast("Heard nothing"); return; }
          setText((prev) => (prev ? prev + " " : "") + t);
          setToast(null);
        } catch (err) {
          setToast(`Transcribe failed: ${(err as Error).message}`);
        }
      };
      recorderRef.current = rec;
      rec.start();
    } catch (err) {
      setListening(false);
      const msg = (err as Error).message || "";
      setToast(msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")
        ? "Mic blocked — allow microphone in browser settings"
        : `Voice start failed: ${msg}`);
    }
  }

  async function processOne(t: string) {
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
        if (autoConfirm) {
          // YOLO: commit immediately, no modal.
          const cr = await fetch("/api/log/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: j.kind, payload: j.payload, text: t }),
          });
          const cj = await cr.json();
          if (!cr.ok) {
            setToast(`Auto-save failed: ${cj.error || cr.statusText}`);
          } else {
            if (cj.kind === "batch" && Array.isArray(cj.results)) {
              const ok = cj.results.filter((x: { ok: boolean; id?: number; kind: string }) => x.ok && x.id);
              if (ok.length > 0) {
                const last = ok[ok.length - 1];
                setLastEntry({ kind: last.kind, id: last.id, label: `${ok.length} entries`, at: Date.now() });
              }
            } else if (cj.id && (cj.kind === "trade" || cj.kind === "meal" || cj.kind === "weight")) {
              let label = cj.kind as string;
              if (j.kind === "trade") label = `${j.payload.side} ${j.payload.symbol}`;
              else if (j.kind === "meal") label = `${j.payload.meal_type || "meal"}`;
              else if (j.kind === "weight") label = `${j.payload.weight_kg}kg`;
              setLastEntry({ kind: cj.kind, id: cj.id, label, at: Date.now() });
            }
            setToast(`Saved ${cj.kind}${j.preview ? ` · ${j.preview}` : ""}`);
            await refreshAll();
          }
          return { needsModal: false };
        } else {
          setPending({ kind: j.kind, preview: j.preview, payload: j.payload, text: t });
          return { needsModal: true };
        }
      } else if (j.kind === "answer") {
        // Question response (NL → SQL → result). Render an inline answer card
        // instead of a toast — the user wants to see the data, not a flash.
        setAnswer({
          question: t,
          answer: j.answer || j.message || "",
          display: j.display || "narrative",
          sql: j.sql ?? null,
          params: j.params,
          explanation: j.explanation ?? null,
          columns: j.columns,
          rows: j.rows,
          row_count: j.row_count,
          truncated: !!j.truncated,
          error: j.error ?? null,
        });
        setAnswerSqlOpen(false);
      } else {
        await refreshAll();
        setToast("Saved");
      }
    } catch (e) {
      setToast(`Error: ${(e as Error).message}`);
    }
    return { needsModal: false };
  }

  // Drain the queue one item at a time. Stops if a confirm modal opens.
  const drainingRef = useRef(false);
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        setQueue((q) => q.slice(1));
        setBusy(true);
        const res = await processOne(next);
        setBusy(false);
        if (res.needsModal) break; // wait for user to resolve modal
      }
    } finally {
      drainingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    // If already busy or there's a pending modal, just enqueue.
    if (busy || pending || drainingRef.current) {
      setQueue((q) => [...q, t]);
      return;
    }
    setQueue((q) => [...q, t]);
    // Defer to let state propagate, then drain.
    setTimeout(() => { void drainQueue(); }, 0);
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
        // Track for undo. Batch entries get the most recent id only.
        if (j.kind === "batch" && Array.isArray(j.results)) {
          const ok = j.results.filter((x: { ok: boolean; id?: number; kind: string }) => x.ok && x.id);
          if (ok.length > 0) {
            const last = ok[ok.length - 1];
            setLastEntry({ kind: last.kind, id: last.id, label: `${ok.length} entries`, at: Date.now() });
          }
        } else if (j.id && (j.kind === "trade" || j.kind === "meal" || j.kind === "weight")) {
          let label = j.kind as string;
          if (pending.kind === "trade") label = `${pending.payload.side} ${pending.payload.symbol}`;
          else if (pending.kind === "meal") label = `${pending.payload.meal_type || "meal"}`;
          else if (pending.kind === "weight") label = `${pending.payload.weight_kg}kg`;
          setLastEntry({ kind: j.kind, id: j.id, label, at: Date.now() });
        }
        setToast("Saved");
      }
      setPending(null);
      await refreshAll();
    } catch (e) {
      setToast(`Commit error: ${(e as Error).message}`);
    } finally {
      setCommitting(false);
      // Resume queued messages now that the modal is resolved.
      if (queueRef.current.length > 0) setTimeout(() => { void drainQueue(); }, 0);
    }
  }

  async function undoLast() {
    if (!lastEntry) return;
    const table = lastEntry.kind === "trade" ? "trades" : lastEntry.kind === "meal" ? "meals" : "weights";
    const r = await fetch(`/api/${table}/${lastEntry.id}`, { method: "DELETE" });
    if (!r.ok) { setToast("Undo failed."); return; }
    setLastEntry(null);
    setToast("Undone.");
    await refreshAll();
  }

  function cancelPending() {
    setPending(null);
    if (queueRef.current.length > 0) setTimeout(() => { void drainQueue(); }, 0);
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
    { key: "tw_stock" as const, label: lang === "zh" ? "台股" : "TW", pill: "TWSE", pillTone: "bg-emerald-900/40 text-emerald-400" },
    { key: "us_stock" as const, label: lang === "zh" ? "美股" : "US", pill: "NYSE/NDQ", pillTone: "bg-emerald-900/40 text-emerald-400" },
    { key: "crypto" as const, label: lang === "zh" ? "加密" : "Crypto", pill: "24/7", pillTone: "bg-blue-900/40 text-blue-400" },
  ];

  // Build marquee items (top headline + tickers + streaks + DCA countdown)
  const marqueeItems: MarqueeItem[] = [];
  // Headlines — show a category tag so the marquee advertises the variety.
  for (const h of headlines.slice(0, 8)) {
    marqueeItems.push({
      key: `news-${h.link || h.title}`,
      href: h.link || undefined,
      node: (
        <>
          {h.category && <span className={newsTone(h.category)}>{h.category.toUpperCase()}</span>}
          {h.category && <span className="text-zinc-600"> · </span>}
          <span className="text-amber-400">📰 {h.source}</span>
          <span className="text-zinc-400"> · </span>
          <span className="text-zinc-200">{h.title}</span>
        </>
      ),
    });
  }
  // Tickers — top 4 positions by market value (USD)
  if (portfolio?.positions?.length) {
    const top = [...portfolio.positions]
      .filter((p) => p.market_value_usd != null)
      .sort((a, b) => (b.market_value_usd ?? 0) - (a.market_value_usd ?? 0))
      .slice(0, 4);
    for (const p of top) {
      const pct = p.change_pct_today;
      const tone = pct == null ? "text-zinc-400" : pct >= 0 ? "text-emerald-400" : "text-rose-400";
      const arrow = pct == null ? "·" : pct >= 0 ? "▲" : "▼";
      marqueeItems.push({
        key: `tk-${p.symbol}`,
        node: (
          <>
            <span className="text-zinc-300">{p.symbol}</span>
            <span className="text-zinc-500"> {p.current_price != null ? p.current_price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"} </span>
            <span className={tone}>{arrow} {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}</span>
          </>
        ),
      });
    }
  }
  // Streaks
  if (stats?.streaks) {
    const s = stats.streaks;
    if (s.meal_log > 0) marqueeItems.push({ key: "streak-meals", node: <><span className="text-orange-400">🔥 Meal log:</span> <span className="text-zinc-200">{s.meal_log}d</span></> });
    if (s.protein_goal > 0) marqueeItems.push({ key: "streak-protein", node: <><span className="text-orange-400">🔥 Protein goal:</span> <span className="text-zinc-200">{s.protein_goal}d</span></> });
    if (s.weigh_in > 0) marqueeItems.push({ key: "streak-weigh", node: <><span className="text-orange-400">🔥 Weigh-in:</span> <span className="text-zinc-200">{s.weigh_in}d</span></> });
    if (s.dca > 0) marqueeItems.push({ key: "streak-dca", node: <><span className="text-orange-400">🔥 DCA:</span> <span className="text-zinc-200">{s.dca}w</span></> });
  }
  // DCA countdown
  if (dca?.next_run_ts) {
    const ms = dca.next_run_ts - Date.now();
    if (ms > 0) {
      const days = Math.floor(ms / 86400000);
      const hours = Math.floor((ms % 86400000) / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      marqueeItems.push({
        key: "dca-countdown",
        node: (
          <>
            <span className="text-amber-300">⏱ Next DCA:</span>{" "}
            <span className="text-zinc-200">{label}</span>
            <span className="text-zinc-500"> · ${dca.job.amountPerRun}</span>
          </>
        ),
      });
    }
  }
  // Next calendar event
  if (nextEvent) {
    const when = (() => {
      if (nextEvent.start_ts == null) return "";
      const d = new Date(nextEvent.start_ts);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400_000);
      const day = diff === 0 ? "Today" : diff === 1 ? "Tmrw" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      const time = nextEvent.all_day || nextEvent.multi_day ? "" : ` ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      return `${day}${time}`;
    })();
    marqueeItems.push({
      key: "next-event",
      node: (
        <>
          <span className="text-sky-300">📅 Next:</span>{" "}
          <span className="text-zinc-200">{nextEvent.title}</span>
          {when && <span className="text-zinc-500"> · {when}</span>}
        </>
      ),
    });
  }
  // Weather
  if (weather?.current) {
    marqueeItems.push({
      key: "weather",
      node: (
        <>
          <span>{weather.current.emoji}</span>{" "}
          <span className="text-zinc-200">{weather.current.temp}°</span>
          <span className="text-zinc-500"> · {weather.current.label}</span>
          <span className="text-zinc-600"> · {weather.location}</span>
        </>
      ),
    });
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-4 py-2 border-b border-zinc-900 shrink-0">
        <h1 className="text-xl font-semibold tracking-tight leading-none text-zinc-100 shrink-0">lifemaxxing</h1>
        <div className="flex-1 min-w-0 px-2">
          <Marquee items={marqueeItems} intervalMs={6000} className="text-zinc-300" />
        </div>
        <div id="dashboard-widgets-slot" className="flex items-center gap-1 shrink-0" />
        <div className="relative shrink-0 hidden">
          <button
            onClick={() => setNewsOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
            data-testid="news-dropdown-button"
            aria-label="All headlines"
          >
            📰 News <span className="text-zinc-500">({headlines.length})</span>
            <span className="text-zinc-500">▾</span>
          </button>
          {newsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNewsOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 w-[420px] max-h-[70vh] overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/95 backdrop-blur shadow-xl z-50"
                data-testid="news-dropdown-panel"
              >
                <div className="px-3 py-2 border-b border-zinc-900 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">Top headlines</span>
                  <span className="text-[10px] text-zinc-600">refreshes every 5 min</span>
                </div>
                {headlines.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[12px] text-zinc-500">No headlines yet.</div>
                ) : (
                  <ul className="divide-y divide-zinc-900">
                    {headlines.map((h, i) => (
                      <li key={`${h.link}-${i}`}>
                        <a
                          href={h.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-3 py-2 hover:bg-zinc-900/60"
                          onClick={() => setNewsOpen(false)}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-amber-400">{h.source}</span>
                          </div>
                          <div className="text-[12px] text-zinc-200 leading-snug">{h.title}</div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-zinc-500 shrink-0">
          {networth?.counts && (networth.counts.cash > 0 || networth.counts.liabilities > 0) && (
            <div
              className="hidden sm:flex flex-col items-end leading-none ml-2"
              title={`Net worth = investments ${fmtMoney(totalsToDisplay(networth.components.portfolio.usd), displayCcy)} + cash ${fmtMoney(totalsToDisplay(networth.components.cash.usd), displayCcy)} − debts ${fmtMoney(totalsToDisplay(networth.components.liabilities.usd), displayCcy)}`}
            >
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Net worth</span>
              <span className="text-[13px] font-semibold tabular-nums text-zinc-100">
                {fmtMoney(totalsToDisplay(networth.net_worth.usd), displayCcy)}
              </span>
            </div>
          )}
          <WeeklyReview />
          <div className="relative ml-2">
            <button
              onClick={() => setDcaOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-900/60 bg-amber-950/30 px-2 py-0.5 text-[12px] text-amber-300 hover:bg-amber-900/40"
              title="Recurring DCA"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              DCA
              {dca?.totalBtc != null && (
                <span className="tabular-nums text-zinc-300">{dca.totalBtc.toFixed(4)} {dca.job.target}</span>
              )}
              {dca?.pnlPct != null && (
                <span className={`tabular-nums ${colorPnl(dca.pnl)}`}>{fmtPct(dca.pnlPct)}</span>
              )}
              <span className="text-zinc-500">▾</span>
            </button>
            {dcaOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDcaOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl text-zinc-200">
                  <div className="flex items-center justify-between text-[12px] text-amber-400/80 mb-2">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      DCA · {dca?.job.source ?? "USDC"}→{dca?.job.target ?? "BTC"}
                    </span>
                    <span className="text-zinc-500">{dca?.runs ?? 0} runs</span>
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-zinc-100">
                    {dca?.totalBtc != null ? `${dca.totalBtc.toFixed(6)} ${dca.job.target}` : "—"}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[12px]">
                    <span className={colorPnl(dca?.pnl)}>
                      {dca?.pnl != null
                        ? `${fmtMoney(totalsToDisplay(dca.pnl), displayCcy)} (${fmtPct(dca.pnlPct)})`
                        : dca?.totalUsdSpent != null
                        ? `${fmtMoney(totalsToDisplay(dca.totalUsdSpent), displayCcy)} in`
                        : "—"}
                    </span>
                    <span className="text-zinc-500">${dca?.job.amountPerRun ?? 8}/day</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-2 gap-2 text-[12px]">
                    <div>
                      <div className="text-zinc-500">Avg cost</div>
                      <div className="tabular-nums">{dca?.avgCost != null ? `$${dca.avgCost.toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Spot</div>
                      <div className="tabular-nums">{dca?.currentPrice != null ? `$${dca.currentPrice.toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Spent</div>
                      <div className="tabular-nums">{dca?.totalUsdSpent != null ? `$${dca.totalUsdSpent.toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Value</div>
                      <div className="tabular-nums">{dca?.marketValue != null ? `$${dca.marketValue.toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
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
          <button
            onClick={() => setDemoMode(!demoMode)}
            title={demoMode ? t("nav.demo.on") : t("nav.demo.off")}
            aria-label={demoMode ? t("nav.demo.disable") : t("nav.demo.enable")}
            className={`ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] transition-colors ${
              demoMode
                ? "border-fuchsia-700/60 bg-fuchsia-950/40 text-fuchsia-300 hover:bg-fuchsia-900/40"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {demoMode && <span className="inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-pulse" />}
            {t("nav.demo.label")}
          </button>
          <button
            onClick={() => setLiquidGlassEnabled(!glass)}
            data-testid="liquid-glass-toggle"
            title={glass ? t("nav.glass.on") : t("nav.glass.off")}
            aria-label={glass ? t("nav.glass.disable") : t("nav.glass.enable")}
            aria-pressed={glass}
            className={`ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] transition-colors ${
              glass
                ? "border-sky-400/60 bg-white/15 text-white backdrop-blur hover:bg-white/25"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {glass && <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-300 animate-pulse" />}
            <span aria-hidden>◎</span>
            {t("nav.glass.label")}
          </button>
          <button
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            data-testid="lang-toggle"
            title={t("nav.lang.toggle")}
            aria-label={t("nav.lang.toggle")}
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 px-2 py-0.5 text-[12px] tabular-nums"
          >
            <span className={lang === "en" ? "text-zinc-100" : "text-zinc-500"}>EN</span>
            <span className="text-zinc-700">/</span>
            <span className={lang === "zh" ? "text-zinc-100" : "text-zinc-500"}>中</span>
          </button>
        </div>
      </header>

      {/* Main grid — draggable / resizable widget shell */}
      <DashboardLayout
        specs={[
        {
          id: "portfolio",
          title: t("widget.portfolio"),
          defaultLayout: { x: 0, y: 0, w: 12, h: 3 },
          dockable: true,
          render: () => (
            <div className="h-full px-3 py-2 flex items-center justify-between gap-4 min-h-0">

          <button
            type="button"
            onClick={() => setHoldingsView("all")}
            className="shrink-0 text-left rounded-md px-1 -mx-1 hover:bg-zinc-800/60 transition-colors"
            title={t("portfolio.total")}
          >
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">{t("widget.portfolio")} <span className="text-zinc-600">▾</span></div>
            <div className="text-3xl font-semibold leading-tight">
              <FlipNumber value={fmtMoney(totalsToDisplay(portfolio?.totals.market_value_usd), displayCcy)} />
            </div>
            {(() => {
              let todayPctNum = 0;
              let todayPctDen = 0;
              let todayUsd = 0;
              let haveAny = false;
              for (const p of portfolio?.positions ?? []) {
                if (p.change_pct_today != null && p.market_value_usd != null) {
                  todayPctNum += p.change_pct_today * p.market_value_usd;
                  todayPctDen += p.market_value_usd;
                  // today's $ contribution: mv - mv/(1+pct/100)
                  const denom = 1 + p.change_pct_today / 100;
                  if (denom !== 0) todayUsd += p.market_value_usd - p.market_value_usd / denom;
                  haveAny = true;
                }
              }
              const todayPct = todayPctDen > 0 ? todayPctNum / todayPctDen : null;
              return (
                <div className={`text-[13px] leading-tight ${colorPnl(haveAny ? todayUsd : null)}`}>
                  <FlipNumber value={haveAny ? `${fmtMoney(totalsToDisplay(todayUsd), displayCcy)} (${fmtPct(todayPct)}) ${t("portfolio.today")}` : "—"} />
                </div>
              );
            })()}
          </button>
          <div className="flex-1 grid grid-cols-3 gap-2">
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
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setHoldingsView(g.key)}
                  className="text-left rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 hover:bg-zinc-800/80 hover:border-zinc-700 transition-colors"
                  title={g.label}
                >
                  <div className="flex items-center justify-between text-[12px] text-zinc-500">
                    <span className="flex items-center gap-1">{g.label} <span className="text-zinc-600">▾</span></span>
                    <span>{t("portfolio.positions", { n: rows.length })}</span>
                  </div>
                  <div className="text-lg font-semibold tabular-nums"><FlipNumber value={fmtMoney(mv || null, displayCcy)} /></div>
                  <div className={`text-[12px] ${colorPnl(today)}`}>{today != null ? <><FlipNumber value={fmtPct(today)} /> {t("portfolio.today")}</> : "—"}</div>
                </button>
              );
            })}
          </div>
            </div>
          ),
        },
        {
          id: "nutrition",
          title: t("widget.nutrition"),
          defaultLayout: { x: 0, y: 3, w: 6, h: 8 },
          dockable: true,
          render: () => (
            <div className="h-full px-3 py-2 flex flex-col min-h-0">

          <div className="flex items-baseline justify-between mb-1.5 shrink-0">
            <h2 className="text-base font-medium text-zinc-200 flex items-center gap-1.5">
              <span>{t("widget.nutrition")} ·</span>
              <button
                onClick={() => shiftNutritionDay(-1)}
                className="px-1 text-zinc-500 hover:text-zinc-200"
                title={lang === "zh" ? "前一天" : "Previous day"}
                aria-label={lang === "zh" ? "前一天" : "Previous day"}
              >‹</button>
              <label className="relative cursor-pointer hover:text-white" title={lang === "zh" ? "選擇日期" : "Pick date"}>
                <span>{isToday ? t("nutrition.today") : nutritionDay}</span>
                <input
                  type="date"
                  value={nutritionDay}
                  max={todayStr()}
                  onChange={(e) => e.target.value && setNutritionDay(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <button
                onClick={() => shiftNutritionDay(1)}
                disabled={isToday}
                className="px-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                title={lang === "zh" ? "後一天" : "Next day"}
                aria-label={lang === "zh" ? "後一天" : "Next day"}
              >›</button>
              {!isToday && (
                <button
                  onClick={() => setNutritionDay(todayStr())}
                  className="ml-1 text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                  title={lang === "zh" ? "跳到今天" : "Jump to today"}
                >{t("nutrition.today")}</button>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {(() => {
                const goal = nutrition?.goals?.calories ?? 0;
                const eaten = nutrition?.totals?.calories ?? 0;
                const left = goal - eaten;
                if (!goal) return <span className="text-[12px] text-zinc-500">{eaten} kcal</span>;
                const over = left < 0;
                return (
                  <span className={`text-[12px] ${over ? "text-amber-400" : "text-zinc-400"}`} title={`${eaten} / ${goal} kcal`}>
                    {over ? (lang === "zh" ? `超出 ${Math.abs(left)}` : `+${Math.abs(left)} over`) : t("nutrition.kcalLeft", { n: left })}
                  </span>
                );
              })()}
              <button
                onClick={() => setEditing("meals")}
                className="text-[12px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                title={lang === "zh" ? "編輯餐點" : "Edit meals"}
              >
                ✎ {t("nutrition.meals")}
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
                title={lang === "zh" ? "編輯每日目標" : "Edit daily goals"}
              >
                ⚙ {t("nutrition.goals")}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 shrink-0">
            {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((k) => {
              const label = k === "calories" ? t("nutrition.kcal") : k === "protein_g" ? t("nutrition.protein") : k === "carbs_g" ? t("nutrition.carbs") : t("nutrition.fat");
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
              <div key={m.id} className="group flex items-center justify-between text-[13px] border-b border-zinc-800/60 py-0.5">
                <div className="min-w-0 flex-1 truncate">
                  <span className="text-[11px] uppercase text-zinc-500 mr-1">{m.meal_type || "meal"}</span>
                  <span className="text-zinc-200">{m.description}</span>
                </div>
                <div className="text-zinc-400 tabular-nums whitespace-nowrap ml-2">
                  {Math.round(m.calories)} kcal · P{Math.round(m.protein_g)} C{Math.round(m.carbs_g)} F{Math.round(m.fat_g)}
                </div>
                <div className="ml-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => setEditing("meals")}
                    title="Edit meal"
                    className="text-[11px] px-1 py-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >✎</button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete this meal?\n\n${m.description}`)) return;
                      const r = await fetch(`/api/meals/${m.id}`, { method: "DELETE" });
                      if (!r.ok) { setToast("Delete failed."); return; }
                      setToast("Meal deleted.");
                      await refreshAll();
                    }}
                    title="Delete meal"
                    className="text-[11px] px-1 py-0.5 rounded text-zinc-400 hover:text-rose-300 hover:bg-zinc-800"
                  >✕</button>
                </div>
              </div>
            ))}
            {(nutrition?.meals.length ?? 0) === 0 && (
              <div className="py-3 text-center text-[13px] text-zinc-500">No meals logged today.</div>
            )}
          </div>
            </div>
          ),
        },
        {
          id: "weight",
          title: t("widget.weight"),
          defaultLayout: { x: 6, y: 3, w: 6, h: 8 },
          dockable: true,
          render: () => (
            <div className="h-full px-3 py-2 flex flex-col min-h-0">

          <div className="flex items-center justify-between mb-1 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium text-zinc-200">{t("widget.weight")}</h2>
              <button
                onClick={() => setEditing("weights")}
                className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                title={lang === "zh" ? "編輯體重紀錄" : "Edit weigh-ins"}
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
                    : (lang === "zh" ? "無資料" : "no data")}
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
                    id: r.id,
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
                  <Line
                    type="monotone"
                    dataKey="kg"
                    stroke="#60a5fa"
                    strokeWidth={1.5}
                    dot={(props: { cx?: number; cy?: number; payload?: { id?: number; kg?: number; date?: string } }) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null || !payload) return <g />;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={3}
                          fill="#60a5fa"
                          stroke="#0a0a0a"
                          strokeWidth={1}
                          style={{ cursor: "pointer" }}
                          onClick={async () => {
                            if (!payload.id) return;
                            if (!confirm(`Delete weigh-in?\n\n${payload.date}: ${payload.kg} kg`)) return;
                            const r = await fetch(`/api/weights/${payload.id}`, { method: "DELETE" });
                            if (!r.ok) { setToast("Delete failed."); return; }
                            setToast("Weigh-in deleted.");
                            await refreshAll();
                          }}
                        />
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="ma" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
            </div>
          ),
        },
        {
          id: "projects",
          title: t("widget.projects"),
          defaultLayout: { x: 0, y: 11, w: 12, h: 8 },
          dockable: true,
          render: () => (
            <div className="h-full px-3 py-2 flex flex-col min-h-0">

          <div className="flex items-baseline justify-between mb-1.5 shrink-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">{t("widget.projects")}</h2>
              <span className="text-[10px] text-zinc-600">
                {t("projects.active", { n: projects.length })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditingProject("new")}
              className="text-[11px] text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-0.5"
              title={lang === "zh" ? "新增專案" : "Add project"}
            >
              + {t("common.add")}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {projects.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600 text-[12px]">
                {lang === "zh" ? "目前沒有專案。點 " : "No projects yet. Click "}<span className="mx-1 text-zinc-400">+ {t("common.add")}</span>{lang === "zh" ? " 來追蹤一個。" : " to track one."}
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                {projects.map((p) => {
                  const phaseTone: Record<string, string> = {
                    idea: "bg-zinc-800 text-zinc-300 border-zinc-700",
                    planning: "bg-sky-950/60 text-sky-300 border-sky-800",
                    building: "bg-amber-950/60 text-amber-300 border-amber-800",
                    shipping: "bg-violet-950/60 text-violet-300 border-violet-800",
                    maintaining: "bg-emerald-950/60 text-emerald-300 border-emerald-800",
                    paused: "bg-zinc-900 text-zinc-500 border-zinc-800",
                    done: "bg-zinc-900 text-zinc-600 border-zinc-800 line-through",
                  };
                  const statusTone: Record<string, string> = {
                    on_track: "text-emerald-400",
                    at_risk: "text-amber-400",
                    blocked: "text-rose-400",
                    done: "text-zinc-500",
                  };
                  const prioMark = p.priority >= 3 ? "★★★" : p.priority === 2 ? "★★" : p.priority === 1 ? "★" : "";
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setEditingProject(p)}
                      className="text-left rounded-lg border border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/70 transition-colors px-2.5 py-2 flex flex-col gap-1 min-h-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[13px] font-medium text-zinc-100 truncate">{p.name}</div>
                        {prioMark && <div className="text-[9px] text-amber-500 shrink-0 leading-4">{prioMark}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] uppercase tracking-wider rounded border px-1.5 py-0.5 ${phaseTone[p.phase] ?? phaseTone.idea}`}>
                          {t(`projects.phase.${p.phase}` as never) || p.phase}
                        </span>
                        <span className={`text-[10px] ${statusTone[p.status] ?? "text-zinc-400"}`}>
                          {t(`projects.status.${p.status}` as never) || p.status.replace("_", " ")}
                        </span>
                      </div>
                      {p.current_problem && (
                        <div className="text-[11px] text-rose-300/90 leading-snug line-clamp-2">
                          ⚠ {p.current_problem}
                        </div>
                      )}
                      {p.next_step && (
                        <div className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                          → {p.next_step}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
            </div>
          ),
        },
        {
          id: "news",
          title: t("widget.news"),
          defaultLayout: { x: 0, y: 19, w: 6, h: 6 },
          dockable: true,
          defaultDocked: true,
          render: () => {
            const cats = ["All", ...Array.from(new Set(headlines.map((h) => h.category).filter(Boolean) as string[]))];
            const shown = newsCategory === "All" ? headlines : headlines.filter((h) => h.category === newsCategory);
            return (
            <div className="h-full flex flex-col min-h-0">
              {/* Category filter chips + Summarize */}
              <div className="shrink-0 flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-zinc-900">
                {cats.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewsCategory(c)}
                    className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border transition-colors ${
                      newsCategory === c
                        ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                        : `border-zinc-800 hover:border-zinc-600 ${c === "All" ? "text-zinc-400" : newsTone(c)}`
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <button
                  onClick={() => fetchNewsSummary(newsCategory)}
                  disabled={newsSummaryLoading || shown.length === 0}
                  className="ml-auto text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border border-violet-700/60 bg-violet-950/30 text-violet-300 hover:bg-violet-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="AI briefing of the headlines below"
                >
                  {newsSummaryLoading ? "✨ …" : "✨ Summarize"}
                </button>
              </div>
              {/* AI summary banner */}
              {newsSummaryOpen && (
                <div className="shrink-0 border-b border-zinc-900 bg-violet-950/15 px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-violet-400">✨ AI Briefing{newsCategory !== "All" ? ` · ${newsCategory}` : ""}</span>
                    <button onClick={() => setNewsSummaryOpen(false)} className="text-[11px] text-zinc-600 hover:text-zinc-300" title="Hide">✕</button>
                  </div>
                  {newsSummaryLoading ? (
                    <div className="text-[12px] text-zinc-500">Reading the headlines…</div>
                  ) : (
                    <div className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap">{newsSummary}</div>
                  )}
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {shown.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[12px] text-zinc-500">No headlines yet.</div>
                ) : (
                  <ul className="divide-y divide-zinc-900">
                    {shown.map((h, i) => (
                      <li key={`${h.link}-${i}`}>
                        <a
                          href={h.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-3 py-2 hover:bg-zinc-900/60"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            {h.category && <span className={`text-[10px] uppercase tracking-wider ${newsTone(h.category)}`}>{h.category}</span>}
                            {h.category && <span className="text-zinc-700 text-[10px]">·</span>}
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{h.source}</span>
                          </div>
                          <div className="text-[12px] text-zinc-200 leading-snug">{h.title}</div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            );
          },
        },
        {
          id: "todos",
          title: t("widget.todos"),
          defaultLayout: { x: 6, y: 19, w: 6, h: 6 },
          dockable: true,
          defaultDocked: true,
          render: () => (
            <div className="h-full overflow-auto">
              <TodoMenu inline />
            </div>
          ),
        },
        {
          id: "networth",
          title: "Net worth",
          defaultLayout: { x: 0, y: 25, w: 6, h: 8 },
          dockable: true,
          defaultDocked: true,
          render: () => <NetWorthPanel displayCcy={displayCcy} onChanged={refreshAll} />,
        },
        {
          id: "subscriptions",
          title: "Subscriptions",
          defaultLayout: { x: 6, y: 25, w: 6, h: 8 },
          dockable: true,
          defaultDocked: true,
          render: () => <SubscriptionPanel displayCcy={displayCcy} fx={fx} onChanged={refreshAll} />,
        },
        {
          id: "habits",
          title: "Habits",
          defaultLayout: { x: 0, y: 33, w: 6, h: 7 },
          dockable: true,
          defaultDocked: true,
          render: () => <HabitPanel onChanged={refreshAll} />,
        },
        {
          id: "calendar",
          title: "📅 Calendar",
          defaultLayout: { x: 6, y: 33, w: 6, h: 7 },
          dockable: true,
          defaultDocked: true,
          render: () => <CalendarPanel />,
        },
        {
          id: "spotify",
          title: "🎧 Spotify",
          defaultLayout: { x: 0, y: 40, w: 4, h: 8 },
          dockable: true,
          defaultDocked: true,
          render: () => <SpotifyPanel />,
        },
        {
          id: "weather",
          title: "🌤️ Weather",
          defaultLayout: { x: 4, y: 40, w: 4, h: 8 },
          dockable: true,
          defaultDocked: true,
          render: () => <WeatherPanel />,
        },
        {
          id: "read-later",
          title: t("widget.readLater"),
          defaultLayout: { x: 8, y: 40, w: 4, h: 8 },
          dockable: true,
          defaultDocked: true,
          render: () => <ReadLaterPanel />,
        },
        // User-generated widgets (Hermes-authored HTML, sandboxed iframe).
        ...customWidgets.map((cw, i) => ({
          id: `custom-${cw.id}`,
          title: `✨ ${cw.title}`,
          defaultLayout: { x: (i % 3) * 4, y: 48 + Math.floor(i / 3) * 8, w: cw.w || 4, h: cw.h || 6 },
          dockable: true,
          render: () => <CustomWidget html={cw.html} title={cw.title} onDelete={() => deleteCustomWidget(cw.id)} />,
        })),
        ]}
      />

      {/* Pinned input row */}
      <div className="shrink-0 px-2 pb-6 pt-1 flex flex-col items-center gap-1">

          {answer && (
            <div
              data-testid="answer-card"
              className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900/85 backdrop-blur px-3 py-2 text-[12px] text-zinc-200 shadow-xl shadow-black/40 animate-[fadeIn_140ms_ease-out]"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 shrink-0">{t("answer.q")}</span>
                  <span className="truncate text-zinc-300" title={answer.question}>{answer.question}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {answer.sql && (
                    <button
                      type="button"
                      onClick={() => setAnswerSqlOpen((v) => !v)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-600 rounded px-1.5 py-0.5"
                      title={answerSqlOpen ? t("answer.hideSql") : t("answer.showSql")}
                    >
                      {answerSqlOpen ? t("answer.hideSql") : t("answer.showSql")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAnswer(null)}
                    className="text-zinc-500 hover:text-zinc-200 text-sm leading-none px-1"
                    title={t("answer.dismiss")}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Result body — varies by display kind */}
              {answer.display === "narrative" || !answer.columns || !answer.rows ? (
                <div className="text-zinc-100 leading-snug">
                  {answer.error ? <span className="text-rose-300">{answer.answer}</span> : answer.answer}
                </div>
              ) : answer.display === "scalar" && answer.rows[0]?.[0] != null ? (
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="text-2xl tabular-nums text-emerald-300 leading-none">
                    {String(answer.rows[0][0])}
                  </div>
                  <div className="text-[11px] text-zinc-500">{answer.columns[0]}</div>
                  {answer.explanation && (
                    <div className="text-[11px] text-zinc-400 basis-full">{answer.explanation}</div>
                  )}
                </div>
              ) : answer.rows.length === 0 ? (
                <div className="text-zinc-500 italic">{t("answer.rows.zero")}</div>
              ) : (
                <>
                  {answer.explanation && (
                    <div className="text-[11px] text-zinc-400 mb-1.5">{answer.explanation}</div>
                  )}
                  <div className="max-h-64 overflow-auto rounded border border-zinc-800">
                    <table className="w-full text-[11px] tabular-nums">
                      <thead className="bg-zinc-900/80 text-zinc-500 sticky top-0">
                        <tr>
                          {answer.columns.map((c, i) => (
                            <th key={i} className="text-left font-medium uppercase tracking-wider px-2 py-1 border-b border-zinc-800">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {answer.rows.map((row, ri) => (
                          <tr key={ri} className="odd:bg-zinc-950/30">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 py-1 border-b border-zinc-900 text-zinc-200 align-top">
                                {cell == null ? <span className="text-zinc-600">·</span> : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {t(answer.row_count === 1 ? "answer.rows.count" : "answer.rows.countPlural", { n: answer.row_count ?? 0 })}
                    {answer.truncated && <span className="text-amber-400"> · {t("answer.truncated")}</span>}
                  </div>
                </>
              )}

              {answerSqlOpen && answer.sql && (
                <pre className="mt-2 text-[10px] leading-snug text-zinc-400 bg-black/40 border border-zinc-800 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                  {answer.sql}
                  {answer.params && answer.params.length > 0 && (
                    <>
                      {"\n"}
                      <span className="text-zinc-500">{t("answer.paramsLabel")} </span>
                      {JSON.stringify(answer.params)}
                    </>
                  )}
                </pre>
              )}
            </div>
          )}

          {lastEntry && Date.now() - lastEntry.at < 30000 && (
            <div
              data-testid="pinned-last-entry"
              className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 backdrop-blur px-3 py-0.5 text-[11px] text-zinc-400"
            >
              <span className="text-zinc-500">Last:</span>
              <span className="text-zinc-300">{lastEntry.label}</span>
              <button
                onClick={undoLast}
                className="text-amber-400 hover:text-amber-300 uppercase tracking-wider text-[10px] border-l border-zinc-700 pl-2"
              >
                ↶ undo
              </button>
            </div>
          )}
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
              placeholder={
                busy
                  ? (queue.length > 0
                      ? `Hermes is thinking… (${queue.length} queued) type to add more`
                      : "Hermes is thinking… type to queue another")
                  : PLACEHOLDER_EXAMPLES[placeholderIdx]
              }
              className="flex-1 bg-transparent text-base outline-none placeholder:text-zinc-500"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={startDictation}
                disabled={busy}
                aria-label={listening ? "Stop listening" : "Dictate"}
                title={listening ? "Listening… click to stop" : "Voice input"}
                className={`rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors ${
                  listening ? "bg-red-500/20 text-red-300 animate-pulse" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {listening ? "●" : "🎤"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAutoConfirm((v) => {
                  const nv = !v;
                  setToast(nv ? "Auto-save ON — no confirm popups" : "Auto-save OFF — confirm before saving");
                  return nv;
                });
              }}
              disabled={busy}
              aria-label={autoConfirm ? t("chat.autoSave.disable") : t("chat.autoSave.enable")}
              title={autoConfirm ? t("chat.autoSave.on") : t("chat.autoSave.off")}
              className={`rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors ${
                autoConfirm ? "bg-amber-500/20 text-amber-300" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              ⚡
            </button>
            <WidgetCreator onCreated={loadCustomWidgets} />
            <button
              onClick={send}
              disabled={!text.trim() && queue.length === 0 && !busy ? true : (!text.trim() ? true : false)}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 transition-colors flex items-center gap-1.5"
              title={queue.length > 0 ? `${queue.length} queued — will run in order` : undefined}
            >
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
                  <span>{queue.length > 0 ? `Queue +${queue.length}` : t("chat.parsing")}</span>
                </>
              ) : queue.length > 0 ? (
                `Queue +${queue.length}`
              ) : (
                t("chat.send")
              )}
            </button>
          </div>
      </div>


      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur px-4 py-1.5 text-base text-zinc-200 shadow-xl flex items-center gap-3">
          <span>{toast}</span>
          {toast === "Saved" && lastEntry && (
            <button
              onClick={undoLast}
              className="text-[12px] uppercase tracking-wider text-amber-400 hover:text-amber-300 border-l border-zinc-700 pl-3"
              title={`Undo: ${lastEntry.label}`}
            >
              ↶ Undo
            </button>
          )}
        </div>
      )}

      {/* Confirm modal */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-xl font-semibold">
                Confirm {pending.kind === "trade" ? "trade" : pending.kind === "meal" ? "meal" : pending.kind === "weight" ? "weight" : pending.kind === "todo" ? "todo" : pending.kind === "subscription" ? "subscription" : pending.kind === "habit" ? "habit" : pending.kind === "networth" ? (pending.payload.kind === "liability" ? "debt" : "cash") : "entry"}
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

            {pending.kind === "todo" && (
              <div className="space-y-2 text-lg">
                <div className="flex justify-between"><span className="text-zinc-400">Title</span><span className="font-medium">{pending.payload.title}</span></div>
                {pending.payload.notes && (
                  <div className="flex justify-between"><span className="text-zinc-400">Notes</span><span className="text-base text-zinc-300">{pending.payload.notes}</span></div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-400">Due</span>
                  <span>{pending.payload.due_ts ? new Date(pending.payload.due_ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : <span className="text-zinc-500">none</span>}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Priority</span>
                  <span>{(["none","low","medium","high"] as const)[pending.payload.priority] ?? "none"}</span>
                </div>
              </div>
            )}

            {pending.kind === "subscription" && (
              <div className="space-y-2 text-lg">
                <div className="flex justify-between"><span className="text-zinc-400">Service</span><span className="font-medium">{pending.payload.name}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Price</span><span>{pending.payload.currency === "USD" ? "$" : "NT$"}{pending.payload.amount.toLocaleString()} / {pending.payload.cycle === "yearly" ? "year" : pending.payload.cycle === "weekly" ? "week" : "month"}</span></div>
                {pending.payload.cycle !== "monthly" && (
                  <div className="flex justify-between"><span className="text-zinc-400">≈ Monthly</span><span className="text-base text-zinc-300">{pending.payload.currency === "USD" ? "$" : "NT$"}{Math.round(pending.payload.amount * (pending.payload.cycle === "yearly" ? 1 / 12 : 52 / 12)).toLocaleString()}</span></div>
                )}
                {pending.payload.next_charge_ts && (
                  <div className="flex justify-between"><span className="text-zinc-400">Next charge</span><span className="text-base">{new Date(pending.payload.next_charge_ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span></div>
                )}
              </div>
            )}

            {pending.kind === "habit" && (
              <div className="space-y-2 text-lg">
                <div className="flex justify-between"><span className="text-zinc-400">Habit</span><span className="font-medium">{pending.payload.name}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Today</span><span className={pending.payload.status === "done" ? "text-emerald-400" : "text-zinc-400"}>{pending.payload.status === "done" ? "✓ done" : "⊘ skipped"}</span></div>
              </div>
            )}

            {pending.kind === "networth" && (
              <div className="space-y-2 text-lg">
                <div className="flex justify-between"><span className="text-zinc-400">Type</span><span className={pending.payload.kind === "liability" ? "text-rose-400" : "text-emerald-400"}>{pending.payload.kind === "liability" ? "Debt / liability" : "Cash / asset"}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Name</span><span className="font-medium">{pending.payload.name}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Balance</span><span className="tabular-nums">{pending.payload.kind === "liability" ? "−" : ""}{pending.payload.currency === "USD" ? "$" : "NT$"}{pending.payload.balance.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Category</span><span className="text-base text-zinc-300">{pending.payload.account_kind.replace("_", " ")}</span></div>
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

      {holdingsView && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 px-4"
          onClick={() => setHoldingsView(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[80vh] rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-medium text-zinc-100">
                  {holdingsView === "all" ? "All Holdings" : holdingsView === "tw_stock" ? "TW Stocks" : holdingsView === "us_stock" ? "US Stocks" : "Crypto"}
                </h2>
                {holdingsView !== "all" && (
                  <button
                    onClick={() => setHoldingsView("all")}
                    className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                    title="Show all"
                  >all</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing("trades")}
                  className="text-[12px] text-zinc-500 hover:text-zinc-200 px-2 py-0.5 rounded border border-zinc-800 hover:border-zinc-600"
                  title="Edit trades"
                >✎ trades</button>
                <button
                  onClick={() => setHoldingsView(null)}
                  className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-2"
                  aria-label="Close"
                  title="Close"
                >✕</button>
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto p-3 ${holdingsView === "all" ? "grid grid-cols-1 md:grid-cols-3 gap-3" : "flex flex-col gap-3"}`}>
              {classGroups
                .filter((g) => holdingsView === "all" || g.key === holdingsView)
                .map((g) => {
                  const rows = (portfolio?.positions ?? []).filter((p) => p.asset_type === g.key);
                  return (
                    <div key={g.key} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-2 shrink-0">
                        <h3 className="text-sm font-medium text-zinc-200">{g.label === "TW" ? "TW Stocks" : g.label === "US" ? "US Stocks" : "Crypto"}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${g.pillTone}`}>{g.pill}</span>
                      </div>
                      <div className="space-y-1.5">
                        {rows.length === 0 && (
                          <div className="text-[13px] text-zinc-500 py-2">No positions</div>
                        )}
                        {rows.map((p) => (
                          <div key={`${p.asset_type}|${p.symbol}`} className="group flex items-center justify-between text-[13px]">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-zinc-100">{p.symbol.replace(/\.TW$/, "")}</div>
                              <div className="truncate text-[12px] text-zinc-500">{p.display_name}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="text-right whitespace-nowrap tabular-nums">
                                <div className="text-zinc-100"><FlipNumber value={fmtMoneyFull(p.current_price, p.currency)} /></div>
                                <div className={`text-[12px] ${colorPnl(p.change_pct_today)}`}><FlipNumber value={fmtPct(p.change_pct_today)} /></div>
                              </div>
                              <button
                                onClick={() => setEditing("trades")}
                                title={`Edit ${p.symbol} trades`}
                                className="opacity-0 group-hover:opacity-100 transition text-[11px] px-1 py-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                              >✎</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-zinc-800 flex justify-between text-[12px] shrink-0">
                        <span className="text-zinc-500">Value</span>
                        <span className="text-zinc-200 font-medium tabular-nums">
                          {fmtMoney(rows.reduce((s, p) => s + (toDisplay(p.market_value_native, p.currency) ?? 0), 0), displayCcy)}
                        </span>
                      </div>
                    </div>
                  );
                })}
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

      {/* Project editor modal */}
      {editingProject && (
        <ProjectEditor
          initial={editingProject === "new" ? null : editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => { setEditingProject(null); loadProjects(); }}
        />
      )}
    </div>
  );
}

// ─── Project editor (inline component) ─────────────────────────────────
function ProjectEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: {
    id: number;
    name: string;
    description: string | null;
    phase: string;
    status: string;
    current_problem: string | null;
    next_step: string | null;
    priority: number;
    url: string | null;
    archived_at: number | null;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [phase, setPhase] = useState(initial?.phase ?? "idea");
  const [status, setStatus] = useState(initial?.status ?? "on_track");
  const [currentProblem, setCurrentProblem] = useState(initial?.current_problem ?? "");
  const [nextStep, setNextStep] = useState(initial?.next_step ?? "");
  const [priority, setPriority] = useState<number>(initial?.priority ?? 2);
  const [url, setUrl] = useState(initial?.url ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr("name required"); return; }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name: trimmed,
        description: description.trim() || null,
        phase,
        status,
        current_problem: currentProblem.trim() || null,
        next_step: nextStep.trim() || null,
        priority,
        url: url.trim() || null,
      };
      const res = initial
        ? await fetch(`/api/projects/${initial.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/projects`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!initial) return;
    if (!confirm(`Archive "${initial.name}"? (soft-archive, not deleted)`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${initial.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-medium text-zinc-100">
            {initial ? "Edit project" : "New project"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              placeholder="CrossView, lifemaxxing-dashboard, …"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Phase</span>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              >
                <option value="idea">idea</option>
                <option value="planning">planning</option>
                <option value="building">building</option>
                <option value="shipping">shipping</option>
                <option value="maintaining">maintaining</option>
                <option value="paused">paused</option>
                <option value="done">done</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              >
                <option value="on_track">on track</option>
                <option value="at_risk">at risk</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Current problem / blocker
            </span>
            <textarea
              value={currentProblem}
              onChange={(e) => setCurrentProblem(e.target.value)}
              rows={3}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 resize-none"
              placeholder="What's stuck right now?"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Next step</span>
            <textarea
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              rows={2}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 resize-none"
              placeholder="The next concrete action"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              >
                <option value={1}>★ low</option>
                <option value={2}>★★ med</option>
                <option value={3}>★★★ high</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
                placeholder="https://github.com/…"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Notes</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 resize-none"
              placeholder="What this project is about, scope, goals…"
            />
          </label>

          {err && <div className="text-rose-400 text-xs">{err}</div>}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          {initial ? (
            <button
              type="button"
              onClick={archive}
              disabled={saving}
              className="text-[11px] text-zinc-500 hover:text-rose-400 disabled:opacity-50"
            >
              archive
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-xs text-zinc-400 hover:text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 hover:border-zinc-600"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-xs text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-50"
            >
              {saving ? "saving…" : initial ? "save" : "create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
