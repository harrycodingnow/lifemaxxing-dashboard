"use client";

import { useEffect, useState, useCallback } from "react";

type CalEvent = {
  calendar: string;
  title: string;
  start: string;
  end: string;
  start_ts: number | null;
  end_ts: number | null;
  all_day: boolean;
  multi_day: boolean;
  location: string | null;
};
type CalResponse = {
  available: boolean;
  calendars: string[];
  days: number;
  events: CalEvent[];
  count: number;
  error?: string;
  permission_hint?: string | null;
};

// Stable color per calendar name.
const CAL_TONE: Record<string, string> = {};
const TONE_POOL = [
  "border-sky-700 bg-sky-950/40 text-sky-300",
  "border-fuchsia-700 bg-fuchsia-950/40 text-fuchsia-300",
  "border-emerald-700 bg-emerald-950/40 text-emerald-300",
  "border-amber-700 bg-amber-950/40 text-amber-300",
];
function calTone(name: string): string {
  if (!CAL_TONE[name]) {
    const idx = Object.keys(CAL_TONE).length % TONE_POOL.length;
    CAL_TONE[name] = TONE_POOL[idx];
  }
  return CAL_TONE[name];
}

function dayKey(ts: number | null): string {
  if (ts == null) return "Undated";
  return new Date(ts).toISOString().slice(0, 10);
}
function dayLabel(key: string): string {
  if (key === "Undated") return "Undated";
  const d = new Date(key + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400_000);
  const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : null;
  const fmt = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return rel ? `${rel} · ${fmt}` : fmt;
}
function timeLabel(ev: CalEvent): string {
  if (ev.all_day || ev.multi_day) return ev.multi_day ? "Multi-day" : "All day";
  if (ev.start_ts == null) return "";
  const t = new Date(ev.start_ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return t;
}

export default function CalendarPanel() {
  const [data, setData] = useState<CalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(14);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/calendar?days=${days}`, { cache: "no-store" });
      setData(await r.json());
    } catch (e) {
      setData({ available: false, calendars: [], days, events: [], count: 0, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Group events by day.
  const groups: { key: string; label: string; events: CalEvent[] }[] = [];
  if (data?.events) {
    const byDay = new Map<string, CalEvent[]>();
    for (const ev of data.events) {
      const k = dayKey(ev.start_ts);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(ev);
    }
    for (const k of Array.from(byDay.keys()).sort()) {
      groups.push({ key: k, label: dayLabel(k), events: byDay.get(k)! });
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1.5 shrink-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">Calendar</h2>
          <span className="text-[10px] text-zinc-600">{data?.count ?? 0} events · {days}d</span>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-600"
          >
            <option value={7}>7d</option>
            <option value={14}>14d</option>
            <option value={30}>30d</option>
          </select>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-[11px] text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-0.5 disabled:opacity-40"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {loading && !data ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-[12px]">Loading…</div>
        ) : data && !data.available ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[12px] text-zinc-500 px-4 gap-2">
            <div>📅 Calendar unavailable.</div>
            {data.permission_hint && <div className="text-[11px] text-zinc-600 leading-snug">{data.permission_hint}</div>}
            <button onClick={refresh} className="mt-1 text-amber-400 hover:text-amber-300 text-[11px]">retry</button>
          </div>
        ) : groups.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-zinc-600 text-[12px] px-4">
            Nothing scheduled in the next {days} days.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 sticky top-0 bg-zinc-900/40 backdrop-blur py-0.5">{g.label}</div>
                <ul className="flex flex-col gap-1">
                  {g.events.map((ev, i) => (
                    <li key={`${g.key}-${i}`} className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5">
                      <span className={`mt-0.5 text-[9px] uppercase tracking-wider rounded border px-1.5 py-0.5 shrink-0 ${calTone(ev.calendar)}`}>
                        {ev.calendar.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim() || ev.calendar}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-zinc-100 leading-snug truncate">{ev.title}</div>
                        <div className="text-[10px] text-zinc-500">
                          {timeLabel(ev)}
                          {ev.location && <span className="text-zinc-600"> · 📍 {ev.location}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
