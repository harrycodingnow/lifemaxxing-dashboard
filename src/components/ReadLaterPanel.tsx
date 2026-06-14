"use client";

// Read Later widget — surfaces saved_links rows added via:
//   • the chat fast-path (paste a URL + maybe a "watch later" hint)
//   • the router LLM landing on intent="link"
//   • POSTs to /api/links from anywhere else
//
// Each row shows thumbnail + title + site/author + duration (YouTube) and a
// tiny status pill. Click the card to open in a new tab (auto-flips status to
// "reading"); use the row buttons to mark done or archive.

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { formatDuration } from "@/lib/links";

type SavedLink = {
  id: number;
  added_at: number;
  url: string;
  kind: string;
  title: string | null;
  description: string | null;
  author: string | null;
  site_name: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: "unread" | "reading" | "done";
  note: string | null;
  opened_at: number | null;
};

type FilterKey = "unread" | "reading" | "done" | "all";

export default function ReadLaterPanel() {
  const { t, lang } = useT();
  const [rows, setRows] = useState<SavedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("unread");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (which: FilterKey) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/links?status=${which}&limit=100`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(filter);
  }, [filter, refresh]);

  // Poll on focus so a link saved from the chat input appears here without a manual reload.
  useEffect(() => {
    const onFocus = () => void refresh(filter);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [filter, refresh]);

  async function patchLink(id: number, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const r = await fetch(`/api/links/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      // optimistic local update; if archive, drop the row outright
      setRows((cur) => {
        if (body.archive) return cur.filter((x) => x.id !== id);
        return cur.map((x) => (x.id === id ? { ...x, ...(body as Partial<SavedLink>) } : x));
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openLink(row: SavedLink) {
    window.open(row.url, "_blank", "noopener,noreferrer");
    if (row.status === "unread") void patchLink(row.id, { status: "reading" });
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "unread", label: lang === "zh" ? "未讀" : "Unread" },
    { key: "reading", label: lang === "zh" ? "閱讀中" : "Reading" },
    { key: "done", label: lang === "zh" ? "已完成" : "Done" },
    { key: "all", label: lang === "zh" ? "全部" : "All" },
  ];

  return (
    <div className="h-full px-3 py-2 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-zinc-500">{t("widget.readLater")}</h2>
          <span className="text-[10px] text-zinc-600">
            {loading ? t("common.loading") : `${rows.length}`}
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-zinc-800 overflow-hidden text-[10px]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-1.5 py-0.5 ${filter === f.key ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:bg-zinc-800"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-rose-400 mb-1 shrink-0" title={error}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5 min-h-0">
        {!loading && rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-zinc-600 text-center px-4">
            {lang === "zh"
              ? "目前沒有連結。在聊天輸入框貼上網址即可加入。"
              : "Nothing saved. Paste a URL into the chat below to add."}
          </div>
        ) : (
          rows.map((row) => (
            <LinkCard
              key={row.id}
              row={row}
              busy={busy === row.id}
              onOpen={() => openLink(row)}
              onMarkDone={() => patchLink(row.id, { status: row.status === "done" ? "unread" : "done" })}
              onArchive={() => patchLink(row.id, { archive: true })}
              labels={{
                openInNew: lang === "zh" ? "開啟連結" : "Open link",
                done: lang === "zh" ? "完成" : "Done",
                undo: lang === "zh" ? "取消完成" : "Undo done",
                archive: lang === "zh" ? "封存" : "Archive",
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LinkCard({
  row,
  busy,
  onOpen,
  onMarkDone,
  onArchive,
  labels,
}: {
  row: SavedLink;
  busy: boolean;
  onOpen: () => void;
  onMarkDone: () => void;
  onArchive: () => void;
  labels: { openInNew: string; done: string; undo: string; archive: string };
}) {
  const dur = formatDuration(row.duration_seconds);
  const subline = [row.author || row.site_name, dur].filter(Boolean).join(" · ");
  const kindBadge: Record<string, { tone: string; emoji: string }> = {
    youtube: { tone: "bg-red-950/60 text-red-300 border-red-900", emoji: "▶" },
    twitter: { tone: "bg-sky-950/60 text-sky-300 border-sky-900", emoji: "𝕏" },
    article: { tone: "bg-zinc-800 text-zinc-300 border-zinc-700", emoji: "📰" },
    other: { tone: "bg-zinc-900 text-zinc-400 border-zinc-800", emoji: "🔗" },
  };
  const badge = kindBadge[row.kind] ?? kindBadge.other;
  const statusTone =
    row.status === "done"
      ? "bg-emerald-950/60 text-emerald-300"
      : row.status === "reading"
        ? "bg-amber-950/60 text-amber-300"
        : "bg-zinc-900 text-zinc-500";

  return (
    <div
      className={`group flex items-stretch gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/70 transition-colors px-2 py-1.5 ${busy ? "opacity-60" : ""}`}
    >
      {row.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.thumbnail_url}
          alt=""
          loading="lazy"
          className="w-20 h-14 rounded-md object-cover bg-zinc-900 shrink-0 cursor-pointer"
          onClick={onOpen}
        />
      ) : (
        <div
          className="w-20 h-14 rounded-md bg-zinc-900 shrink-0 flex items-center justify-center text-lg cursor-pointer"
          onClick={onOpen}
          aria-hidden
        >
          {badge.emoji}
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
        title={labels.openInNew}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[9px] uppercase tracking-wider rounded border px-1 py-0.5 ${badge.tone}`}>
            {badge.emoji} {row.kind}
          </span>
          <span className={`text-[9px] uppercase tracking-wider rounded px-1 py-0.5 ${statusTone}`}>
            {row.status}
          </span>
        </div>
        <div className="text-[13px] font-medium text-zinc-100 leading-tight line-clamp-2">
          {row.title || row.url}
        </div>
        {subline && <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{subline}</div>}
        {row.note && <div className="text-[11px] text-zinc-400 italic mt-0.5 line-clamp-1">“{row.note}”</div>}
      </button>
      <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onMarkDone}
          disabled={busy}
          title={row.status === "done" ? labels.undo : labels.done}
          className="text-[11px] w-7 h-7 rounded border border-zinc-800 hover:border-emerald-700 text-zinc-400 hover:text-emerald-300 flex items-center justify-center"
        >
          {row.status === "done" ? "↶" : "✓"}
        </button>
        <button
          type="button"
          onClick={onArchive}
          disabled={busy}
          title={labels.archive}
          className="text-[11px] w-7 h-7 rounded border border-zinc-800 hover:border-rose-700 text-zinc-400 hover:text-rose-300 flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
