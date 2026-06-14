"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Props = {
  onCreated: () => void; // called after a widget is generated + persisted
  /**
   * When true, render a slim icon button that matches the other input-row
   * controls (8×8 round). When false, render the legacy floating FAB style.
   * Default is true so the creator inlines into the dashboard input row.
   */
  inline?: boolean;
};

const EXAMPLES = [
  "a pomodoro timer",
  "countdown to my birthday Nov 7",
  "a tip splitter calculator",
  "world clocks for Taipei, NYC, London",
  "a dice roller",
  "a breathing exercise animation",
  "a markdown scratchpad",
];

// Inline ✨ icon that sits in the dashboard's input-row alongside the mic and
// auto-save toggles. Clicking it pops a small "Make me…" pill anchored above
// the icon (so it doesn't squeeze the chat input). Submit calls
// /api/widgets/generate; success closes the popover and notifies the parent.
//
// inline=false falls back to the original bottom-right floating FAB for any
// other surface that may still want it.
export default function WidgetCreator({ onCreated, inline = true }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Rotate the placeholder example while idle.
  useEffect(() => {
    if (!open || text) return;
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(id);
  }, [open, text]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Click-outside to close the popover (inline mode only).
  useEffect(() => {
    if (!inline || !open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
        setError(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [inline, open]);

  const submit = useCallback(async () => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/widgets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const j = await r.json();
      if (!r.ok || !j?.widget) {
        setError(j?.error || "Couldn't generate that — try rephrasing.");
        return;
      }
      setText("");
      setOpen(false);
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [text, busy, onCreated]);

  // ── inline icon + anchored popover ─────────────────────────────────────────
  if (inline) {
    return (
      <div ref={popRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Generate a widget with AI"
          aria-expanded={open}
          title="Generate a widget with AI"
          className={`rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors ${
            open
              ? "bg-violet-500/20 text-violet-200"
              : "text-zinc-500 hover:text-violet-300 hover:bg-zinc-800"
          }`}
        >
          ✨
        </button>

        {open && (
          <div
            data-testid="widget-creator-popover"
            className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-[min(420px,88vw)] animate-[fadeIn_120ms_ease-out]"
          >
            {error && (
              <div className="mb-2 rounded-lg border border-rose-800/60 bg-rose-950/90 backdrop-blur px-3 py-2 text-[12px] text-rose-200 shadow-xl">
                {error}
              </div>
            )}
            <div className="flex items-center gap-1 rounded-full border border-violet-700/60 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/50 pl-4 pr-1.5 py-1.5">
              <span className="text-violet-400 text-[14px] shrink-0">✨</span>
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") {
                    setOpen(false);
                    setError(null);
                  }
                }}
                disabled={busy}
                placeholder={busy ? "Hermes is building it…" : `Make me ${EXAMPLES[exampleIdx]}…`}
                className="flex-1 min-w-0 bg-transparent text-[14px] text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || !text.trim()}
                className="shrink-0 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-50 text-[13px] font-medium px-3 py-1 transition-colors"
              >
                {busy ? "…" : "Build"}
              </button>
            </div>
          </div>
        )}
        <style jsx>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(6px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      </div>
    );
  }

  // ── legacy floating FAB (kept for backwards compat) ────────────────────────
  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
      {error && open && (
        <div className="max-w-[280px] rounded-lg border border-rose-800/60 bg-rose-950/80 backdrop-blur px-3 py-2 text-[12px] text-rose-200 shadow-xl">
          {error}
        </div>
      )}

      {open ? (
        <div className="flex items-center gap-1 rounded-full border border-violet-700/60 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/50 pl-4 pr-1.5 py-1.5 w-[min(420px,88vw)] animate-[fadeIn_120ms_ease-out]">
          <span className="text-violet-400 text-[14px] shrink-0">✨</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") { setOpen(false); setError(null); }
            }}
            disabled={busy}
            placeholder={busy ? "Hermes is building it…" : `Make me ${EXAMPLES[exampleIdx]}…`}
            className="flex-1 min-w-0 bg-transparent text-[14px] text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            className="shrink-0 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-50 text-[13px] font-medium px-3 py-1 transition-colors"
          >
            {busy ? "…" : "Build"}
          </button>
          <button
            onClick={() => { setOpen(false); setError(null); }}
            className="shrink-0 text-zinc-500 hover:text-zinc-200 px-1.5"
            title="Close"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          title="Generate a widget with AI"
          className="h-12 w-12 rounded-full bg-violet-600 hover:bg-violet-500 text-zinc-50 text-2xl leading-none shadow-2xl shadow-violet-900/40 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        >
          +
        </button>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
