"use client";

import { useEffect, useState, useCallback } from "react";

export type Todo = {
  id: number;
  created_ts: number;
  updated_ts: number;
  title: string;
  notes: string | null;
  due_ts: number | null;
  priority: number; // 0..3
  done: number; // 0|1
  done_ts: number | null;
  sort_order: number;
};

function fmtDue(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTom = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0);
  const datePart = sameDay ? "Today" : isTom ? "Tomorrow" : d.toLocaleDateString([], { month: "short", day: "numeric" });
  return hasTime ? `${datePart} ${time}` : datePart;
}

function isOverdue(t: Todo): boolean {
  return !t.done && t.due_ts != null && t.due_ts < Date.now();
}

function toLocalDatetimeInput(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeInput(s: string): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

const PRIORITY_LABEL: Record<number, { label: string; cls: string }> = {
  0: { label: "—", cls: "text-zinc-500" },
  1: { label: "low", cls: "text-sky-400" },
  2: { label: "med", cls: "text-amber-400" },
  3: { label: "hi", cls: "text-rose-400" },
};

export default function TodoMenu({ inline = false }: { inline?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ title: string; notes: string; due: string; priority: number }>({
    title: "",
    notes: "",
    due: "",
    priority: 0,
  });
  // Quick-add row
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDue, setQuickDue] = useState("");
  const [quickPriority, setQuickPriority] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/todos", { cache: "no-store" });
      const j = await r.json();
      setTodos(j.rows || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open || inline) refresh();
  }, [open, inline, refresh]);

  // Light background refresh every 60s while open or always (inline panel).
  useEffect(() => {
    if (!open && !inline) return;
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [open, inline, refresh]);

  const openCount = todos.filter((t) => !t.done).length;
  const overdueCount = todos.filter(isOverdue).length;
  const visible = showDone ? todos : todos.filter((t) => !t.done);

  async function addTodo() {
    const title = quickTitle.trim();
    if (!title) return;
    const body = {
      title,
      due_ts: fromLocalDatetimeInput(quickDue),
      priority: quickPriority,
    };
    const r = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setQuickTitle("");
      setQuickDue("");
      setQuickPriority(0);
      refresh();
    }
  }

  async function patchTodo(id: number, patch: Partial<Todo>) {
    const r = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) refresh();
  }

  async function deleteTodo(id: number) {
    if (!confirm("Delete this task?")) return;
    const r = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (r.ok) refresh();
  }

  function startEdit(t: Todo) {
    setEditingId(t.id);
    setDraft({
      title: t.title,
      notes: t.notes ?? "",
      due: toLocalDatetimeInput(t.due_ts),
      priority: t.priority,
    });
  }

  async function saveEdit() {
    if (editingId == null) return;
    await patchTodo(editingId, {
      title: draft.title.trim(),
      notes: draft.notes || null,
      due_ts: fromLocalDatetimeInput(draft.due),
      priority: draft.priority,
    });
    setEditingId(null);
  }

  // Shared inner body (header controls + quick-add + list). Used both inside the
  // header dropdown (default) and inline inside the dashboard widget panel.
  const body = (
    <>
      <div className="px-3 py-2 border-b border-zinc-900 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">
          Todos <span className="text-zinc-600">({openCount}{overdueCount ? ` · ${overdueCount} overdue` : ""})</span>
        </span>
        <label className="text-[10px] text-zinc-500 flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            className="accent-zinc-400"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          show done
        </label>
      </div>

      {/* Quick add */}
      <div className="p-2 border-b border-zinc-900 space-y-1.5">
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo();
          }}
          placeholder="new task…"
          className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[13px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={quickDue}
            onChange={(e) => setQuickDue(e.target.value)}
            className="flex-1 rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-600"
          />
          <select
            value={quickPriority}
            onChange={(e) => setQuickPriority(parseInt(e.target.value, 10))}
            className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-600"
          >
            <option value={0}>none</option>
            <option value={1}>low</option>
            <option value={2}>med</option>
            <option value={3}>high</option>
          </select>
          <button
            onClick={addTodo}
            disabled={!quickTitle.trim()}
            className="rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-0.5 text-[11px] text-zinc-50"
          >
            add
          </button>
        </div>
      </div>

      {/* List */}
      {loading && todos.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-zinc-500">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-zinc-500">
          {showDone ? "No todos yet." : "No open todos — nice."}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-900">
          {visible.map((t) => {
            const overdue = isOverdue(t);
            const isEditing = editingId === t.id;
            return (
              <li key={t.id} className="px-3 py-2">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[13px] text-zinc-100"
                      autoFocus
                    />
                    <textarea
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      placeholder="notes (optional)"
                      rows={2}
                      className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[12px] text-zinc-300 placeholder-zinc-600 resize-none"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="datetime-local"
                        value={draft.due}
                        onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                        className="flex-1 rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300"
                      />
                      <select
                        value={draft.priority}
                        onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value, 10) })}
                        className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300"
                      >
                        <option value={0}>none</option>
                        <option value={1}>low</option>
                        <option value={2}>med</option>
                        <option value={3}>high</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
                      >
                        cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={!draft.title.trim()}
                        className="rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-2 py-0.5 text-[11px] text-zinc-50"
                      >
                        save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!t.done}
                      onChange={(e) => patchTodo(t.id, { done: e.target.checked ? 1 : 0 })}
                      className="mt-1 accent-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-[13px] leading-snug ${
                          t.done ? "line-through text-zinc-500" : "text-zinc-100"
                        }`}
                      >
                        {t.title}
                      </div>
                      {t.notes && (
                        <div className="text-[11px] text-zinc-500 leading-snug mt-0.5 whitespace-pre-wrap">
                          {t.notes}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px]">
                        {t.due_ts && (
                          <span className={overdue ? "text-rose-400" : "text-zinc-500"}>
                            {overdue ? "⚠ " : "📅 "}
                            {fmtDue(t.due_ts)}
                          </span>
                        )}
                        {t.priority > 0 && (
                          <span className={PRIORITY_LABEL[t.priority].cls}>
                            ● {PRIORITY_LABEL[t.priority].label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-[11px] text-zinc-500 hover:text-zinc-200"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteTodo(t.id)}
                        className="text-[11px] text-zinc-500 hover:text-rose-400"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  // Inline mode: render the body directly into the panel (no trigger, no popover).
  // Used by the dashboard widget so there's no nested "Todos ▾" dropdown.
  if (inline) {
    return <div className="h-full overflow-y-auto">{body}</div>;
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
        title="Todos"
        aria-label="Todos"
      >
        ✓ Todos <span className="text-zinc-500">({openCount}{overdueCount ? ` · ${overdueCount} overdue` : ""})</span>
        <span className="text-zinc-500">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-[420px] max-h-[75vh] overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/95 backdrop-blur shadow-xl z-50">
            {body}
          </div>
        </>
      )}
    </div>
  );
}
