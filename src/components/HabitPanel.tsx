"use client";

import { useEffect, useState, useCallback } from "react";

export type Habit = {
  id: number;
  name: string;
  emoji: string | null;
  streak: number;
  longest: number;
  done_last_7: number;
  done_last_30: number;
  today_status: "done" | "skip" | null;
  total_done: number;
};

const tzMin = () => new Date().getTimezoneOffset();

export default function HabitPanel({ onChanged }: { onChanged?: () => void }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/habits?tz=${tzMin()}`, { cache: "no-store" });
      const j = await r.json();
      setHabits(j.rows || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function setStatus(h: Habit, status: "done" | "skip" | "none") {
    // Toggling the same status clears it.
    const next = h.today_status === status ? "none" : status;
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habit_id: h.id, status: next, tz: tzMin() }),
    });
    await refresh();
    onChanged?.();
  }

  async function addHabit() {
    const name = newName.trim();
    if (!name) return;
    const r = await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      setNewName("");
      setAdding(false);
      await refresh();
      onChanged?.();
    }
  }

  async function archiveHabit(h: Habit) {
    if (!confirm(`Archive habit "${h.name}"? (logs are kept)`)) return;
    const r = await fetch(`/api/habits/${h.id}`, { method: "DELETE" });
    if (r.ok) {
      await refresh();
      onChanged?.();
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1.5 shrink-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">Habits</h2>
          <span className="text-[10px] text-zinc-600">{habits.length} tracked</span>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-0.5"
          title="Add habit"
        >
          + add
        </button>
      </div>

      {adding && (
        <div className="flex items-center gap-1.5 mb-2 shrink-0">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addHabit(); if (e.key === "Escape") setAdding(false); }}
            placeholder="habit name (e.g. meditate, gym)…"
            className="flex-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[13px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <button onClick={addHabit} disabled={!newName.trim()} className="rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-2 py-1 text-[11px] text-zinc-50">add</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {loading && habits.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-[12px]">Loading…</div>
        ) : habits.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-zinc-600 text-[12px] px-4">
            No habits yet. Click <span className="mx-1 text-zinc-400">+ add</span> or type <span className="mx-1 text-zinc-400">&ldquo;did meditation&rdquo;</span> in the chat.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {habits.map((h) => {
              const done = h.today_status === "done";
              const skip = h.today_status === "skip";
              return (
                <li
                  key={h.id}
                  className="group flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-zinc-100 truncate">
                        {h.emoji ? `${h.emoji} ` : ""}{h.name}
                      </span>
                      {h.streak > 0 && (
                        <span className="text-[11px] text-orange-400 tabular-nums shrink-0" title={`Longest: ${h.longest}d`}>
                          🔥{h.streak}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 tabular-nums">
                      {h.done_last_7}/7 this week · {h.total_done} total
                      {h.longest > 0 && <> · best {h.longest}d</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setStatus(h, "done")}
                      title="Mark done today"
                      className={`w-7 h-7 rounded-md text-sm flex items-center justify-center transition-colors ${
                        done ? "bg-emerald-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                      }`}
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setStatus(h, "skip")}
                      title="Mark skipped today"
                      className={`w-7 h-7 rounded-md text-sm flex items-center justify-center transition-colors ${
                        skip ? "bg-zinc-600 text-white" : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      ⊘
                    </button>
                    <button
                      onClick={() => archiveHabit(h)}
                      title="Archive habit"
                      className="w-6 h-7 rounded-md text-[11px] text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
