"use client";

import { useEffect, useState, useCallback } from "react";

export type Subscription = {
  id: number;
  name: string;
  amount: number;
  currency: "TWD" | "USD";
  cycle: "weekly" | "monthly" | "yearly";
  next_charge_ts: number | null;
  url: string | null;
  notes: string | null;
  archived_at: number | null;
};

const CYCLE_MULT: Record<string, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
const sym = (c: string) => (c === "USD" ? "$" : "NT$");

function fmtNextCharge(ts: number | null): { label: string; soon: boolean } | null {
  if (!ts) return null;
  const days = Math.ceil((ts - Date.now()) / 86400_000);
  if (days < 0) return { label: "overdue", soon: true };
  if (days === 0) return { label: "today", soon: true };
  if (days === 1) return { label: "tomorrow", soon: true };
  return { label: `in ${days}d`, soon: days <= 3 };
}

export default function SubscriptionPanel({
  displayCcy = "TWD",
  fx = 0,
  onChanged,
}: {
  displayCcy?: "TWD" | "USD";
  fx?: number; // usd→twd rate for combining the burn into one currency
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [monthly, setMonthly] = useState<{ twd: number; usd: number }>({ twd: 0, usd: 0 });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Subscription | "new" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/subscriptions", { cache: "no-store" });
      const j = await r.json();
      setRows(j.rows || []);
      setMonthly(j.monthly || { twd: 0, usd: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 120_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Combine the TWD + USD monthly burn into the user's display currency.
  const burnDisplay = (() => {
    const { twd, usd } = monthly;
    if (displayCcy === "TWD") {
      const combined = twd + (fx ? usd * fx : 0);
      return `${sym("TWD")}${Math.round(combined).toLocaleString()}/mo`;
    }
    const combined = usd + (fx ? twd / fx : 0);
    return `${sym("USD")}${Math.round(combined).toLocaleString()}/mo`;
  })();

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1.5 shrink-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">Subscriptions</h2>
          <span className="text-[11px] text-amber-300 tabular-nums" title="Total monthly burn">{burnDisplay}</span>
          <span className="text-[10px] text-zinc-600">{rows.length} active</span>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="text-[11px] text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-0.5"
          title="Add subscription"
        >
          + add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {loading && rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-[12px]">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-zinc-600 text-[12px] px-4">
            No subscriptions. Click <span className="mx-1 text-zinc-400">+ add</span> or type <span className="mx-1 text-zinc-400">&ldquo;netflix 390/mo&rdquo;</span>.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((s) => {
              const next = fmtNextCharge(s.next_charge_ts);
              const monthlyEq = Math.round(s.amount * (CYCLE_MULT[s.cycle] ?? 1));
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="w-full text-left flex items-center gap-2 rounded-lg border border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/70 transition-colors px-2.5 py-1.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-zinc-100 truncate">{s.name}</div>
                      <div className="text-[10px] text-zinc-500 tabular-nums">
                        {s.cycle !== "monthly" && <>≈{sym(s.currency)}{monthlyEq}/mo · </>}
                        {next && <span className={next.soon ? "text-amber-400" : ""}>renews {next.label}</span>}
                        {!next && <span className="text-zinc-600">no renewal date</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] tabular-nums text-zinc-200">
                        {sym(s.currency)}{s.amount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        /{s.cycle === "yearly" ? "yr" : s.cycle === "weekly" ? "wk" : "mo"}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <SubscriptionEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

function SubscriptionEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Subscription | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [currency, setCurrency] = useState<"TWD" | "USD">(initial?.currency ?? "TWD");
  const [cycle, setCycle] = useState<"weekly" | "monthly" | "yearly">(initial?.cycle ?? "monthly");
  const [nextCharge, setNextCharge] = useState(
    initial?.next_charge_ts ? new Date(initial.next_charge_ts).toISOString().slice(0, 10) : ""
  );
  const [url, setUrl] = useState(initial?.url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    const amt = Number(amount);
    if (!trimmed) { setErr("name required"); return; }
    if (!Number.isFinite(amt) || amt < 0) { setErr("amount must be a non-negative number"); return; }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name: trimmed,
        amount: amt,
        currency,
        cycle,
        next_charge_ts: nextCharge ? new Date(nextCharge + "T09:00").getTime() : null,
        url: url.trim() || null,
        notes: notes.trim() || null,
      };
      const res = initial
        ? await fetch(`/api/subscriptions/${initial.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        : await fetch(`/api/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!initial) return;
    if (!confirm(`Cancel/archive "${initial.name}"? (soft-archive, not deleted)`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/subscriptions/${initial.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-medium text-zinc-100">{initial ? "Edit subscription" : "New subscription"}</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600" placeholder="Netflix, Spotify, iCloud…" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Amount</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-zinc-600" placeholder="390" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as "TWD" | "USD")} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
                <option value="TWD">TWD</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Cycle</span>
              <select value={cycle} onChange={(e) => setCycle(e.target.value as "weekly" | "monthly" | "yearly")} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
                <option value="yearly">yearly</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Next charge</span>
              <input type="date" value={nextCharge} onChange={(e) => setNextCharge(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Manage/cancel URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600" placeholder="https://…" />
          </label>
          {err && <div className="text-rose-400 text-xs">{err}</div>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          {initial ? (
            <button type="button" onClick={archive} disabled={saving} className="text-[11px] text-zinc-500 hover:text-rose-400 disabled:opacity-50">cancel sub</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="text-xs text-zinc-400 hover:text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 hover:border-zinc-600">close</button>
            <button type="button" onClick={save} disabled={saving} className="text-xs text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-50">{saving ? "saving…" : initial ? "save" : "add"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
