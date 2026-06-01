"use client";

import { useEffect, useState } from "react";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "datetime" | "select";
  options?: { value: string; label: string }[];
  step?: string;
  min?: number;
  width?: string; // tailwind width class for cell
};

type Row = Record<string, unknown> & { id: number };

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  resource: "trades" | "meals" | "weights";
  fields: FieldDef[];
  /**
   * Optional override that returns the row list. Defaults to GET /api/<resource>?range_days=999
   * (only "weights" supports range_days; trades returns all by default; meals returns last 30d).
   */
  fetchUrl?: string;
  /** how to render a one-line summary if no fields shown inline */
  rowLabel?: (row: Row) => string;
  onChanged?: () => void;
};

const tsToInput = (ms: number): string => {
  const d = new Date(ms);
  // local datetime-local string (yyyy-MM-ddTHH:mm)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const inputToTs = (s: string): number => new Date(s).getTime();

export default function EditModal({
  open,
  onClose,
  title,
  resource,
  fields,
  fetchUrl,
  onChanged,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, Record<string, unknown>>>({});
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const url = fetchUrl ?? (resource === "weights" ? `/api/weights?range_days=999` : `/api/${resource}`);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      const data: Row[] = (j.rows ?? j.meals ?? []) as Row[];
      // newest first
      data.sort((a, b) => Number(b.ts ?? 0) - Number(a.ts ?? 0));
      setRows(data);
      setEdits({});
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

  if (!open) return null;

  const setEdit = (id: number, key: string, val: unknown) => {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: val } }));
  };

  const save = async (id: number) => {
    const patch = edits[id];
    if (!patch || Object.keys(patch).length === 0) return;
    setBusyId(id);
    setErr(null);
    try {
      const r = await fetch(`/api/${resource}/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      await load();
      onChanged?.();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const del = async (id: number) => {
    setBusyId(id);
    setErr(null);
    try {
      const r = await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      await load();
      onChanged?.();
      setConfirmDel(null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">{rows.length} rows</span>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">×</button>
          </div>
        </div>
        {err && (
          <div className="px-4 py-1.5 text-[12px] text-rose-400 bg-rose-950/30 border-b border-rose-900/40 shrink-0">{err}</div>
        )}
        <div className="overflow-auto flex-1">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
              <tr>
                {fields.map((f) => (
                  <th key={f.key} className="text-left font-normal px-2 py-1.5 border-b border-zinc-800 whitespace-nowrap">{f.label}</th>
                ))}
                <th className="px-2 py-1.5 border-b border-zinc-800 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-2 py-4 text-zinc-500" colSpan={fields.length + 1}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td className="px-2 py-4 text-zinc-500" colSpan={fields.length + 1}>No rows.</td></tr>
              )}
              {rows.map((row) => {
                const dirty = !!edits[row.id] && Object.keys(edits[row.id]).length > 0;
                const isConfirm = confirmDel === row.id;
                return (
                  <tr key={row.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                    {fields.map((f) => {
                      const raw = (edits[row.id]?.[f.key] ?? row[f.key]) as unknown;
                      const onChange = (v: unknown) => setEdit(row.id, f.key, v);
                      return (
                        <td key={f.key} className={`px-2 py-1 align-top ${f.width ?? ""}`}>
                          {f.type === "select" ? (
                            <select
                              value={String(raw ?? "")}
                              onChange={(e) => onChange(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-zinc-100"
                            >
                              {f.options?.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : f.type === "datetime" ? (
                            <input
                              type="datetime-local"
                              value={raw ? tsToInput(Number(raw)) : ""}
                              onChange={(e) => onChange(inputToTs(e.target.value))}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-zinc-100"
                            />
                          ) : f.type === "number" ? (
                            <input
                              type="number"
                              step={f.step ?? "any"}
                              min={f.min}
                              value={raw == null ? "" : String(raw)}
                              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-zinc-100 tabular-nums"
                            />
                          ) : (
                            <input
                              type="text"
                              value={raw == null ? "" : String(raw)}
                              onChange={(e) => onChange(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-zinc-100"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      {isConfirm ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            disabled={busyId === row.id}
                            onClick={() => del(row.id)}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-50"
                          >Delete</button>
                          <button
                            onClick={() => setConfirmDel(null)}
                            className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-300"
                          >Cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <button
                            disabled={!dirty || busyId === row.id}
                            onClick={() => save(row.id)}
                            className={`text-[11px] px-1.5 py-0.5 rounded ${dirty ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-500"}`}
                          >Save</button>
                          <button
                            onClick={() => setConfirmDel(row.id)}
                            className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                            title="Soft-delete (recoverable in DB)"
                          >✕</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px] text-zinc-500 border-t border-zinc-800 shrink-0">
          Edits are inline. Deletes are <span className="text-zinc-300">soft</span> (rows keep a <code>deleted_at</code> timestamp and can be restored in SQLite).
        </div>
      </div>
    </div>
  );
}
