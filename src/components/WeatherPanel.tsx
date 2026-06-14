"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { DEMO_EVENT } from "@/lib/demo-data";
import { useT } from "@/lib/i18n";

type WeatherHour = {
  iso: string;
  hour: number;
  temp: number;
  precip_prob: number | null;
};
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
  today?: {
    date: string;
    t_max: number;
    t_min: number;
    max_precip_prob: number | null;
    hourly: WeatherHour[];
  };
  daily?: WeatherDay[];
  error?: string;
};

const LS_KEY = "weatherPlace";

export default function WeatherPanel() {
  const { t } = useT();
  const [place, setPlace] = useState("Taipei");
  const [data, setData] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Hour the user is currently hovering on the precip chart, or null. Drives
  // both the highlighted bar color AND the floating tooltip badge.
  const [hoverHour, setHoverHour] = useState<number | null>(null);

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
  const today = data?.today;

  // Pre-compute the precip chart in one pass. We render an SVG inline so the
  // widget doesn't pull recharts just for 24 bars + a temp range. Resolution:
  // 24 hourly buckets, height = chart h. Width comes from a CSS-driven viewBox
  // so the chart scales to the widget.
  const chart = useMemo(() => {
    const hourly = today?.hourly ?? [];
    if (hourly.length === 0) return null;
    // Buckets always represent local 00..23. If the API returned a partial
    // window (e.g. mid-day refresh that lost early-AM data), zero-fill the gap
    // so x-axis stays anchored at midnight.
    const byHour: Array<{ hour: number; pop: number | null; temp: number | null }> = Array.from(
      { length: 24 },
      (_, h) => ({ hour: h, pop: null, temp: null }),
    );
    for (const h of hourly) {
      if (h.hour >= 0 && h.hour < 24) {
        byHour[h.hour] = { hour: h.hour, pop: h.precip_prob, temp: h.temp };
      }
    }
    return byHour;
  }, [today]);

  // Current local hour, for highlighting the bar that represents "now".
  const nowHour = new Date().getHours();

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">{t("widget.weather")}</h2>
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
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-[12px]">{t("common.loading")}</div>
        ) : data && !data.available ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-[12px] text-zinc-500 gap-1 px-3">
            <div>🌧️ Couldn’t load weather.</div>
            <div className="text-[11px] text-zinc-600">{data.error?.includes("not found") ? "Location not found — try another city." : "Network issue — will retry."}</div>
            <button onClick={() => load(place)} className="mt-1 text-amber-400 hover:text-amber-300 text-[11px]">{t("common.retry")}</button>
          </div>
        ) : cur ? (
          <>
            {/* Current — emoji + temp + today's high/low range */}
            <div className="flex items-center gap-3 px-1">
              <span className="text-5xl leading-none">{cur.emoji}</span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums text-zinc-100 leading-none">{cur.temp}°</span>
                  {today && (
                    <span className="text-[12px] tabular-nums text-zinc-400 leading-none">
                      <span className="text-rose-400">↑{today.t_max}°</span>
                      <span className="mx-1 text-zinc-700">/</span>
                      <span className="text-sky-400">↓{today.t_min}°</span>
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-zinc-400 truncate mt-0.5">{cur.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5 px-1 text-[11px] text-zinc-500">
              <span>{t("weather.feelsLike")} {cur.feels_like}°</span>
              {cur.humidity != null && <span>💧 {cur.humidity}%</span>}
              {cur.wind != null && <span>💨 {Math.round(cur.wind)} km/h</span>}
            </div>

            {/* Rain probability over today — bars per local hour */}
            {chart && (
              <div className="mt-auto pt-2" data-testid="weather-rain-chart">
                <div className="flex items-baseline justify-between text-[10px] text-zinc-500 mb-1 px-0.5">
                  <span className="uppercase tracking-wider">{t("weather.precip")} · {t("weather.today")}</span>
                  {today?.max_precip_prob != null && (
                    <span className="tabular-nums text-sky-300">peak {today.max_precip_prob}%</span>
                  )}
                </div>
                <div className="relative w-full" style={{ height: 56 }}>
                  <svg
                    viewBox="0 0 240 56"
                    preserveAspectRatio="none"
                    className="w-full h-full"
                    aria-label="Hourly precipitation probability for today"
                  >
                    {/* 0/50/100 gridlines */}
                    {[0, 28, 56].map((y, i) => (
                      <line
                        key={i}
                        x1="0"
                        x2="240"
                        y1={y === 0 ? 0.5 : y === 56 ? 55.5 : y}
                        y2={y === 0 ? 0.5 : y === 56 ? 55.5 : y}
                        stroke="#27272a"
                        strokeWidth="0.5"
                        strokeDasharray={y === 28 ? "2,3" : undefined}
                      />
                    ))}
                    {chart.map((b, i) => {
                      const pop = b.pop ?? 0;
                      const barH = Math.max(0.5, (pop / 100) * 56);
                      const x = i * 10; // 24 bars * 10 = 240 (matches viewBox width)
                      const isNow = b.hour === nowHour;
                      const isHover = hoverHour === b.hour;
                      // "Now" bar uses warm amber against the cool-blue rain
                      // bars so it reads as a distinct scrubber, not just a
                      // slightly-lighter blue. Hover wins over now so the
                      // tooltip target you're pointing at always highlights.
                      const fill = isHover
                        ? "#7dd3fc"
                        : isNow
                          ? "#fbbf24" // amber-400
                          : pop >= 50
                            ? "#0ea5e9"
                            : pop >= 20
                              ? "#0c7ea2"
                              : "#1e3a5f";
                      return (
                        <g key={i}>
                          {isNow && (
                            // Faint amber column behind the now bar — makes
                            // the highlight visible even when precip is 0%.
                            <rect
                              x={x}
                              y={0}
                              width={10}
                              height={56}
                              fill="#fbbf24"
                              opacity={0.10}
                              pointerEvents="none"
                            />
                          )}
                          {/* The visible coloured bar (no pointer events; the
                              wider hit target below handles hover). */}
                          <rect
                            x={x + 0.5}
                            y={isNow ? Math.min(56 - barH, 52) : 56 - barH}
                            width={9}
                            height={isNow ? Math.max(barH, 4) : barH}
                            fill={fill}
                            opacity={pop === 0 && !isHover && !isNow ? 0.25 : 1}
                            pointerEvents="none"
                          />
                          {isNow && (
                            // Tiny amber pip on top of the now bar so it's
                            // recognizable as a marker even at low precip.
                            <circle
                              cx={x + 5}
                              cy={Math.max(2, (isNow ? Math.min(56 - barH, 52) : 56 - barH) - 1.5)}
                              r={1.4}
                              fill="#fbbf24"
                              pointerEvents="none"
                            />
                          )}
                          {/* Full-height transparent hit target so even 0%
                              bars are easy to hover over. */}
                          <rect
                            x={x}
                            y={0}
                            width={10}
                            height={56}
                            fill="transparent"
                            onMouseEnter={() => setHoverHour(b.hour)}
                            onMouseLeave={() => setHoverHour((h) => (h === b.hour ? null : h))}
                            style={{ cursor: "crosshair" }}
                          >
                            <title>{`${String(b.hour).padStart(2, "0")}:00${isNow ? " (now)" : ""} — ${pop}% rain${b.temp != null ? `, ${b.temp}°` : ""}`}</title>
                          </rect>
                        </g>
                      );
                    })}
                  </svg>
                  {/* Floating tooltip — pops instantly on bar hover, anchored
                      horizontally to the hovered bar (24 bars → 100/24 ≈ 4.17%
                      per bar; center the badge over bar n at (n + 0.5) * step). */}
                  {hoverHour !== null && chart[hoverHour] && (() => {
                    const b = chart[hoverHour];
                    const pop = b.pop ?? 0;
                    const leftPct = ((b.hour + 0.5) / 24) * 100;
                    // Flip the anchor to the right side once we're past the
                    // midpoint, so the tooltip doesn't overflow the widget.
                    const isLeftHalf = leftPct < 50;
                    return (
                      <div
                        className="pointer-events-none absolute -top-1 -translate-y-full rounded-md bg-zinc-900/95 border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-100 shadow-lg tabular-nums whitespace-nowrap z-10"
                        style={{
                          left: `${leftPct}%`,
                          transform: `translate(${isLeftHalf ? "-25%" : "-75%"}, -100%)`,
                        }}
                      >
                        <span className="text-zinc-400">{String(b.hour).padStart(2, "0")}:00</span>
                        {" · "}
                        <span className={pop >= 50 ? "text-sky-300 font-medium" : "text-zinc-200"}>{pop}%</span>
                        {b.temp != null && <span className="text-zinc-500"> · {Math.round(b.temp)}°</span>}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5 px-0.5 tabular-nums">
                  <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
                </div>
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
