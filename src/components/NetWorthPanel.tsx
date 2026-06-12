"use client";

import { useEffect, useState, useCallback } from "react";

type Account = {
  id: number;
  name: string;
  balance: number;
  currency: "TWD" | "USD";
  kind: string;
  archived_at: number | null;
};
type NetWorth = {
  fx: { usd_twd: number };
  portfolio_ok: boolean;
  components: {
    portfolio: { usd: number; twd: number };
    cash: { usd: number; twd: number };
    liabilities: { usd: number; twd: number };
  };
  net_worth: { usd: number; twd: number };
  counts: { cash: number; liabilities: number };
};

const sym = (c: string) => (c === "USD" ? "$" : "NT$");
function fmt(n: number | null | undefined, ccy: "TWD" | "USD") {
  if (n == null || !isFinite(n)) return "—";
  return sym(ccy) + Math.round(n).toLocaleString();
}

export default function NetWorthPanel({
  displayCcy = "TWD",
  onChanged,
}: {
  displayCcy?: "TWD" | "USD";
  onChanged?: () => void;
}) {
  const [nw, setNw] = useState<NetWorth | null>(null);
  const [cash, setCash] = useState<Account[]>([]);
  const [liabs, setLiabs] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ row: Account | null; type: "cash" | "liability" } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [n, c, l] = await Promise.all([
        fetch("/api/networth", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/cash", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ rows: [] })),
        fetch("/api/liabilities", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ rows: [] })),
      ]);
      setNw(n);
      setCash(c.rows || []);
      setLiabs(l.rows || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 120_000);
    return () => clearInterval(id);
  }, [refresh]);

  const k = displayCcy === "USD" ? "usd" : "twd";
  const net = nw?.net_worth[k] ?? null;

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1.5 shrink-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">Net worth</h2>
          {nw && !nw.portfolio_ok && (
            <span className="text-[9px] text-amber-500" title="Some live prices unavailable; using cost basis">≈ prices stale</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setEditing({ row: null, type: "cash" })} className="text-[11px] text-emerald-400/80 hover:text-emerald-300 border border-zinc-800 hover:border-emerald-800 rounded px-2 py-0.5" title="Add cash/asset">+ cash</button>
          <button type="button" onClick={() => setEditing({ row: null, type: "liability" })} className="text-[11px] text-rose-400/80 hover:text-rose-300 border border-zinc-800 hover:border-rose-900 rounded px-2 py-0.5" title="Add debt/liability">+ debt</button>
        </div>
      </div>

      {/* Net worth headline + breakdown */}
      <div className="shrink-0 mb-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
        <div className="text-2xl font-semibold tabular-nums text-zinc-100">{fmt(net, displayCcy)}</div>
        <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div className="text-zinc-500">Investments</div>
            <div className="tabular-nums text-sky-300">{fmt(nw?.components.portfolio[k], displayCcy)}</div>
          </div>
          <div>
            <div className="text-zinc-500">Cash</div>
            <div className="tabular-nums text-emerald-300">{fmt(nw?.components.cash[k], displayCcy)}</div>
          </div>
          <div>
            <div className="text-zinc-500">Debts</div>
            <div className="tabular-nums text-rose-300">{nw ? `−${fmt(nw.components.liabilities[k], displayCcy).replace(/^[^\d—]*/, sym(displayCcy))}` : "—"}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {loading && !nw ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-[12px]">Loading…</div>
        ) : cash.length === 0 && liabs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-zinc-600 text-[12px] px-4">
            No accounts yet. Add cash/debt or type <span className="mx-1 text-zinc-400">&ldquo;cathay 250000&rdquo;</span>.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {cash.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Cash &amp; assets</div>
                <ul className="flex flex-col gap-1">
                  {cash.map((a) => (
                    <li key={`c-${a.id}`}>
                      <button type="button" onClick={() => setEditing({ row: a, type: "cash" })} className="w-full text-left flex items-center justify-between gap-2 rounded-md border border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/70 px-2.5 py-1.5 transition-colors">
                        <span className="text-[13px] text-zinc-200 truncate">{a.name} <span className="text-[10px] text-zinc-600">{a.kind.replace("_", " ")}</span></span>
                        <span className="text-[13px] tabular-nums text-emerald-300 shrink-0">{sym(a.currency)}{a.balance.toLocaleString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {liabs.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Debts</div>
                <ul className="flex flex-col gap-1">
                  {liabs.map((a) => (
                    <li key={`l-${a.id}`}>
                      <button type="button" onClick={() => setEditing({ row: a, type: "liability" })} className="w-full text-left flex items-center justify-between gap-2 rounded-md border border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/70 px-2.5 py-1.5 transition-colors">
                        <span className="text-[13px] text-zinc-200 truncate">{a.name} <span className="text-[10px] text-zinc-600">{a.kind.replace("_", " ")}</span></span>
                        <span className="text-[13px] tabular-nums text-rose-300 shrink-0">−{sym(a.currency)}{a.balance.toLocaleString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <AccountEditor
          initial={editing.row}
          type={editing.type}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

const CASH_KINDS = [["cash", "cash"], ["bank", "bank"], ["brokerage_cash", "brokerage"], ["other", "other"]] as const;
const LIAB_KINDS = [["loan", "loan"], ["credit_card", "credit card"], ["mortgage", "mortgage"], ["other", "other"]] as const;

function AccountEditor({
  initial,
  type,
  onClose,
  onSaved,
}: {
  initial: Account | null;
  type: "cash" | "liability";
  onClose: () => void;
  onSaved: () => void;
}) {
  const endpoint = type === "cash" ? "cash" : "liabilities";
  const kinds = type === "cash" ? CASH_KINDS : LIAB_KINDS;
  const [name, setName] = useState(initial?.name ?? "");
  const [balance, setBalance] = useState(initial ? String(initial.balance) : "");
  const [currency, setCurrency] = useState<"TWD" | "USD">(initial?.currency ?? "TWD");
  const [kind, setKind] = useState(initial?.kind ?? kinds[0][0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    const bal = Number(balance);
    if (!trimmed) { setErr("name required"); return; }
    if (!Number.isFinite(bal)) { setErr("balance must be a number"); return; }
    setSaving(true);
    setErr(null);
    try {
      const body = { name: trimmed, balance: Math.abs(bal), currency, kind };
      const res = initial
        ? await fetch(`/api/${endpoint}/${initial.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        : await fetch(`/api/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!initial) return;
    if (!confirm(`Remove "${initial.name}"? (soft-archive, not deleted)`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/${endpoint}/${initial.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  const title = `${initial ? "Edit" : "New"} ${type === "cash" ? "cash / asset" : "debt"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-medium text-zinc-100">{title}</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1">✕</button>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600" placeholder={type === "cash" ? "Cathay, BoA savings…" : "Student loan, Visa…"} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Balance</span>
              <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-zinc-600" placeholder="250000" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as "TWD" | "USD")} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
                <option value="TWD">TWD</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
              {kinds.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          {err && <div className="text-rose-400 text-xs">{err}</div>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          {initial ? (
            <button type="button" onClick={archive} disabled={saving} className="text-[11px] text-zinc-500 hover:text-rose-400 disabled:opacity-50">remove</button>
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
