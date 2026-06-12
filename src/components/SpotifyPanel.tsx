"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DEMO_EVENT } from "@/lib/demo-data";

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

  const now = status?.now ?? null;
  const playing = !!now?.is_playing;
  const duration = now?.duration_ms ?? null;
  const pct = duration && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  // ── Disc (always rendered; art when available, vinyl otherwise) ──
  const disc = (
    <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
      <div
        className={`cd-vinyl absolute inset-0 rounded-full shadow-2xl shadow-black/60 ${playing ? "cd-spin" : "cd-spin paused"}`}
        style={{ willChange: "transform" }}
      >
        {/* album art ring */}
        {now?.album_art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={now.album_art}
            alt={now.album ?? "album art"}
            className="absolute rounded-full object-cover"
            style={{ inset: "18%" }}
            draggable={false}
          />
        ) : (
          <div className="absolute rounded-full bg-zinc-800 flex items-center justify-center" style={{ inset: "18%" }}>
            <span className="text-2xl">🎵</span>
          </div>
        )}
        {/* sheen overlay */}
        <div className="cd-sheen absolute inset-0 rounded-full pointer-events-none" />
        {/* center spindle hole */}
        <div className="absolute rounded-full bg-zinc-950 border border-zinc-700" style={{ width: 14, height: 14, left: "calc(50% - 7px)", top: "calc(50% - 7px)" }} />
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-[11px] uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <span className="text-emerald-500">●</span> Spotify
        </h2>
        {status?.connected && (
          <button
            onClick={disconnect}
            disabled={loading}
            className="text-[10px] text-zinc-600 hover:text-rose-400 disabled:opacity-40"
            title="Disconnect Spotify"
          >
            disconnect
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
        {!status ? (
          <div className="text-zinc-600 text-[12px]">Loading…</div>
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
              <span>●</span> Connect Spotify
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
                <div className="text-[12px] text-zinc-500">Nothing playing right now.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
