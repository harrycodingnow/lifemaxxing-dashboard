"use client";

import { useState, useCallback } from "react";
import { useT } from "@/lib/i18n";

type Digest = {
  window_days: number;
  trades: { count: number; buys: number; sells: number; items: Array<{ side: string; qty: number; name: string; price: number; currency: string }> };
  nutrition: { meals_logged: number; days_logged: number; avg_calories_per_logged_day: number; avg_protein_per_logged_day: number };
  weight: { readings: number; first_kg: number | null; last_kg: number | null; delta_kg: number | null };
  todos: { completed: number; added: number; still_open: number; completed_titles: string[] };
  habits: { tracked: number; done_counts: Record<string, number> };
};

export default function WeeklyReview() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);

  const load = useCallback(async (withSummary: boolean) => {
    setLoading(true);
    setSummaryError(null);
    try {
      const r = await fetch(`/api/review/weekly?window=7&summary=${withSummary ? "1" : "0"}`, { cache: "no-store" });
      const j = await r.json();
      setDigest(j.digest || null);
      setSummary(j.summary || null);
      setSummaryError(j.summary_error || null);
    } catch (e) {
      setSummaryError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const openModal = () => {
    setOpen(true);
    // Fast first paint with the digest, then ask Hermes for the prose summary.
    setSummary(null);
    setDigest(null);
    load(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
        title={t("review.title")}
      >
        📊 Review
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <h3 className="text-sm font-semibold text-zinc-100">📊 {t("review.title")} <span className="text-zinc-500 font-normal">· last 7 days</span></h3>
              <button type="button" onClick={() => setOpen(false)} title={t("review.close")} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
              {/* Hermes summary */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                {loading && !summary ? (
                  <div className="flex items-center gap-2 text-zinc-500 text-[13px]">
                    <span className="inline-block w-3 h-3 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                    {t("review.generating")}
                  </div>
                ) : summary ? (
                  <div className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{summary}</div>
                ) : (
                  <div className="text-[12px] text-zinc-500">
                    {summaryError ? `Summary unavailable (${summaryError}).` : "No summary."}
                    <button onClick={() => load(true)} className="ml-2 text-amber-400 hover:text-amber-300">retry</button>
                  </div>
                )}
              </div>

              {/* Raw digest stats */}
              {digest && (
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <Stat label="Trades" value={`${digest.trades.count}`} sub={`${digest.trades.buys} buy · ${digest.trades.sells} sell`} />
                  <Stat label="Meals logged" value={`${digest.nutrition.meals_logged}`} sub={`${digest.nutrition.days_logged}/7 days · ~${digest.nutrition.avg_protein_per_logged_day}g P/day`} />
                  <Stat label="Weight" value={digest.weight.last_kg != null ? `${digest.weight.last_kg}kg` : "—"} sub={digest.weight.delta_kg != null ? `${digest.weight.delta_kg >= 0 ? "+" : ""}${digest.weight.delta_kg}kg this week` : "no readings"} />
                  <Stat label="Todos done" value={`${digest.todos.completed}`} sub={`${digest.todos.added} added · ${digest.todos.still_open} open`} />
                  {digest.habits.tracked > 0 && (
                    <div className="col-span-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Habits</div>
                      {Object.keys(digest.habits.done_counts).length === 0 ? (
                        <div className="text-zinc-600">No habit check-ins this week.</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(digest.habits.done_counts).map(([name, n]) => (
                            <span key={name} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">{name} <span className="text-orange-400 tabular-nums">{n}/7</span></span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-zinc-100">{value}</div>
      <div className="text-[10px] text-zinc-500">{sub}</div>
    </div>
  );
}
