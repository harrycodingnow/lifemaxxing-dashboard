"use client";

import { useEffect, useState, useCallback } from "react";
import { DEMO_EVENT } from "@/lib/demo-data";

type WeatherDay = {
  date: string;
  code: number;
  label: string;
  emoji: string;
  t_max: number;
  t_min: number;
  precip_prob: number | null;
};
type Weather = {
  available: boolean;
  location?: string;
  timezone?: string;
  current?: {
    temp: number;
    feels_like: number;
    label: string;
    emoji: string;
    humidity: number | null;
    wind: number | null;
    is_day: boolean;
  };
  daily?: WeatherDay[];
  error?: string;
};

const LS_KEY = "weatherPlace";

function dayName(date: string): string {
  const d = new Date(date + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tmrw";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export default function WeatherPanel() {
  const [place, setPlace] = useState("Taipei");
  const [data, setData] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // Restore saved place on mount.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(LS_KEY);
      if (saved) setPlace(saved);
    }
  }, []);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/weather?place=${encodeURIComponent(p)}`, { cache: "no-store" });
      setData(await r.json());
    } catch (e) {
      setData({ available: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(place);
    const id = setInterval(() => load(place), 10 * 60_000);
    const onDemo = () => load(place);
    window.addEventListener(DEMO_EVENT, onDemo);
    return () => {
      clearInterval(id);
      window.removeEventListener(DEMO_EVENT, onDemo);
    };
  }, [place, load]);

  const submitPlace = () => {
    const p = draft.trim();
    setEditing(false);
    if (!p || p === place) return;
    setPlace(p);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, p);
  };

  const cur = data?.current;

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">Weather</h2>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitPlace(); if (e.key === "Escape") setEditing(false); }}
            onBlur={submitPlace}
            placeholder="city…"
            className="w-28 rounded bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-100 focus:outline-none focus:border-zinc-500"
          />
        ) : (
          <button
            onClick={() => { setDraft(data?.location ?? place); setEditing(true); }}
            className="text-[11px] text-zinc-400 hover:text-zinc-100 truncate max-w-[60%]"
            title="Change location"
          >
            {data?.location ?? place} ✎
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {loading && !data ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-[12px]">Loading…</div>
        ) : data && !data.available ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-[12px] text-zinc-500 gap-1 px-3">
            <div>🌧️ Couldn’t load weather.</div>
            <div className="text-[11px] text-zinc-600">{data.error?.includes("not found") ? "Location not found — try another city." : "Network issue — will retry."}</div>
            <button onClick={() => load(place)} className="mt-1 text-amber-400 hover:text-amber-300 text-[11px]">retry</button>
          </div>
        ) : cur ? (
          <>
            {/* Current */}
            <div className="flex items-center gap-3 px-1">
              <span className="text-5xl leading-none">{cur.emoji}</span>
              <div className="min-w-0">
                <div className="text-3xl font-semibold tabular-nums text-zinc-100 leading-none">{cur.temp}°</div>
                <div className="text-[12px] text-zinc-400 truncate">{cur.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5 px-1 text-[11px] text-zinc-500">
              <span>Feels {cur.feels_like}°</span>
              {cur.humidity != null && <span>💧 {cur.humidity}%</span>}
              {cur.wind != null && <span>💨 {Math.round(cur.wind)} km/h</span>}
            </div>

            {/* Forecast strip */}
            {data.daily && data.daily.length > 0 && (
              <div className="mt-auto pt-2 grid grid-cols-5 gap-1">
                {data.daily.slice(0, 5).map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-0.5 rounded-md bg-zinc-900/40 py-1.5" title={`${d.label}${d.precip_prob != null ? ` · ${d.precip_prob}% precip` : ""}`}>
                    <span className="text-[10px] text-zinc-500">{dayName(d.date)}</span>
                    <span className="text-lg leading-none">{d.emoji}</span>
                    <span className="text-[11px] tabular-nums text-zinc-200">{d.t_max}°</span>
                    <span className="text-[10px] tabular-nums text-zinc-500">{d.t_min}°</span>
                    {d.precip_prob != null && d.precip_prob >= 20 && (
                      <span className="text-[9px] text-sky-400 tabular-nums">{d.precip_prob}%</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-[12px]">No data.</div>
        )}
      </div>
    </div>
  );
}
