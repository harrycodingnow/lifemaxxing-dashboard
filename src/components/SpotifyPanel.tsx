"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DEMO_EVENT } from "@/lib/demo-data";
import { useT } from "@/lib/i18n";

type NowPlaying = {
  is_playing: boolean;
  track: string | null;
  artists: string | null;
  album: string | null;
  album_art: string | null;
  progress_ms: number | null;
  duration_ms: number | null;
  track_url: string | null;
};
type Status = { configured: boolean; connected: boolean; now: NowPlaying | null; error?: string };

function fmtTime(ms: number | null): string {
  if (ms == null) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SpotifyPanel() {
  const { t } = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  // Locally interpolated progress so the bar moves smoothly between polls.
  const [progress, setProgress] = useState(0);
  const lastSync = useRef<{ at: number; progress: number; playing: boolean }>({ at: 0, progress: 0, playing: false });

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/spotify/now-playing", { cache: "no-store" });
      const j: Status = await r.json();
      setStatus(j);
      if (j.now?.progress_ms != null) {
        lastSync.current = { at: Date.now(), progress: j.now.progress_ms, playing: j.now.is_playing };
        setProgress(j.now.progress_ms);
      }
    } catch {
      /* keep last state */
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    // Re-poll immediately when demo mode is toggled so the panel reflects it.
    const onDemo = () => poll();
    window.addEventListener(DEMO_EVENT, onDemo);
    return () => {
      clearInterval(id);
      window.removeEventListener(DEMO_EVENT, onDemo);
    };
  }, [poll]);

  // Smooth progress interpolation between 5s polls.
  useEffect(() => {
    const id = setInterval(() => {
      const { at, progress: p, playing } = lastSync.current;
      if (!playing || !at) return;
      setProgress(p + (Date.now() - at));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      await fetch("/api/spotify/disconnect", { method: "POST" });
      await poll();
    } finally {
      setLoading(false);
    }
  }, [poll]);

  // ── Playback control (POST /api/spotify/control) ──────────────────────────
  const [ctrlBusy, setCtrlBusy] = useState<null | "play" | "pause" | "next" | "prev">(null);
  const [ctrlNote, setCtrlNote] = useState<string | null>(null);
  const control = useCallback(
    async (action: "toggle" | "next" | "previous", optimisticBusy: "play" | "pause" | "next" | "prev") => {
      setCtrlBusy(optimisticBusy);
      setCtrlNote(null);
      try {
        const r = await fetch("/api/spotify/control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok && r.status !== 202) {
          setCtrlNote(j?.hint || j?.error || `Error ${r.status}`);
        } else if (r.status === 202) {
          setCtrlNote(j?.hint || t("spotify.openApp"));
        }
        // Re-poll so progress + play state catch up.
        await poll();
      } catch (e) {
        setCtrlNote((e as Error).message);
      } finally {
        setCtrlBusy(null);
      }
    },
    [poll, t],
  );

  const now = status?.now ?? null;
  const playing = !!now?.is_playing;
  const duration = now?.duration_ms ?? null;
  const pct = duration && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  // ── Disc: spin ONLY the album art, no black vinyl backdrop ──
  // (The earlier "vinyl + sheen + spindle hole" wrapper looked busy and the
  // user asked us to spin just the album art itself.)
  const disc = (
    <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
      {now?.album_art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={now.album_art}
          alt={now.album ?? "album art"}
          className={`absolute inset-0 w-full h-full rounded-full object-cover shadow-2xl shadow-black/60 ${playing ? "cd-spin" : "cd-spin paused"}`}
          style={{ willChange: "transform" }}
          draggable={false}
        />
      ) : (
        <div
          className={`absolute inset-0 rounded-full bg-zinc-800 flex items-center justify-center shadow-2xl shadow-black/60 ${playing ? "cd-spin" : "cd-spin paused"}`}
          style={{ willChange: "transform" }}
        >
          <span className="text-2xl">🎵</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-[11px] uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <span className="text-emerald-500">●</span> {t("widget.spotify")}
        </h2>
        {status?.connected && (
          <button
            onClick={disconnect}
            disabled={loading}
            className="text-[10px] text-zinc-600 hover:text-rose-400 disabled:opacity-40"
            title={t("spotify.disconnect")}
          >
            {t("spotify.disconnect")}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
        {!status ? (
          <div className="text-zinc-600 text-[12px]">{t("common.loading")}</div>
        ) : !status.configured ? (
          <div className="text-center text-[12px] text-zinc-500 px-4 leading-snug">
            <div className="mb-1">🎧 Spotify not configured.</div>
            <div className="text-[11px] text-zinc-600">
              Add <code className="text-zinc-400">SPOTIFY_CLIENT_ID</code> and{" "}
              <code className="text-zinc-400">SPOTIFY_CLIENT_SECRET</code> to <code className="text-zinc-400">.env.local</code>.
            </div>
          </div>
        ) : !status.connected ? (
          <div className="text-center flex flex-col items-center gap-3">
            {disc}
            <a
              href="/api/spotify/login"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-medium text-[13px] px-4 py-1.5 transition-colors"
            >
              <span>●</span> {t("spotify.connect")}
            </a>
            <div className="text-[10px] text-zinc-600">Logs in through your browser</div>
          </div>
        ) : (
          <>
            {disc}
            <div className="text-center w-full px-2">
              {now?.track ? (
                <>
                  <a
                    href={now.track_url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[14px] text-zinc-100 font-medium truncate hover:underline"
                    title={now.track}
                  >
                    {now.track}
                  </a>
                  <div className="text-[12px] text-zinc-400 truncate" title={now.artists ?? ""}>{now.artists}</div>
                  {/* progress bar */}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500 tabular-nums">
                    <span>{fmtTime(progress)}</span>
                    <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
                    </div>
                    <span>{fmtTime(duration)}</span>
                  </div>
                  {!playing && <div className="mt-1 text-[10px] text-zinc-600 uppercase tracking-wider">Paused</div>}
                </>
              ) : (
                <div className="text-[12px] text-zinc-500">{t("spotify.nothingPlaying")}</div>
              )}
              {/* Transport controls — always rendered when connected so the user
                  can hit play even if "nothing is playing" (e.g. after pause). */}
              <div
                data-testid="spotify-transport"
                className="mt-3 flex items-center justify-center gap-3 text-zinc-300"
              >
                <button
                  type="button"
                  onClick={() => control("previous", "prev")}
                  disabled={!!ctrlBusy}
                  aria-label={t("spotify.previous")}
                  title={t("spotify.previous")}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-800 hover:text-white disabled:opacity-40 transition-colors"
                >
                  ⏮
                </button>
                <button
                  type="button"
                  onClick={() => control("toggle", playing ? "pause" : "play")}
                  disabled={!!ctrlBusy}
                  aria-label={playing ? t("spotify.pause") : t("spotify.play")}
                  title={playing ? t("spotify.pause") : t("spotify.play")}
                  className="w-11 h-11 rounded-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-zinc-950 text-lg disabled:opacity-40 transition-colors"
                >
                  {ctrlBusy === "play" || ctrlBusy === "pause" ? "…" : playing ? "⏸" : "▶"}
                </button>
                <button
                  type="button"
                  onClick={() => control("next", "next")}
                  disabled={!!ctrlBusy}
                  aria-label={t("spotify.next")}
                  title={t("spotify.next")}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-800 hover:text-white disabled:opacity-40 transition-colors"
                >
                  ⏭
                </button>
              </div>
              {ctrlNote && (
                <div className="mt-1 text-[10px] text-amber-400/80 leading-snug">{ctrlNote}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
