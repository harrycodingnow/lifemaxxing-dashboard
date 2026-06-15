"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Hand-gesture control for the dashboard grid.
//
// A round toolbar button (sits beside the chat input) toggles webcam hand
// tracking. While active we:
//   1. capture the laptop camera with getUserMedia,
//   2. run MediaPipe's HandLandmarker (WASM, loaded lazily on first activate),
//   3. map the index-fingertip to a virtual on-screen cursor, and
//   4. treat a thumb↔index "pinch" as a left-mouse button.
//
// react-grid-layout drags through react-draggable's DraggableCore, which listens
// for a native `mousedown` on the `.widget-drag-handle` element and then
// `mousemove` / `mouseup` on `document` (left button only). So a pinch over a
// widget header dispatches a synthetic `mousedown` on that handle, each frame
// while held dispatches `mousemove` on `document`, and releasing dispatches
// `mouseup` — i.e. we drive the exact same drag path a real mouse would, and the
// grid's existing persistence (onLayoutChange) saves the new position for free.
//
// Everything heavy (the MediaPipe module + WASM + model) is loaded only when the
// user first turns the feature on, so the initial bundle is untouched.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import type {
  HandLandmarker,
  HandLandmarkerResult,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// Pin the WASM runtime CDN to the installed package version so the loader and
// the binary never drift apart.
const MP_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// MediaPipe hand-landmark indices we use.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

// Tuning knobs.
const SMOOTHING = 0.4; // EMA factor for the cursor (higher = snappier, lower = calmer)
const GAIN = 1.5; // expand the hand's range around centre so screen edges are reachable
const PINCH_ON = 0.45; // pinch ratio below this → grab
const PINCH_OFF = 0.62; // pinch ratio above this → release (hysteresis kills flicker)
const PREVIEW_W = 200;
const PREVIEW_H = 150; // 4:3 to match the 640×480 capture (no objectFit cropping)

// Dwell-to-resize + resize tuning.
const DWELL_MS = 5000; // hover this long (no pinch) over one widget → resize mode
const RESIZE_GAIN = 1.6; // px of widget size change per px of finger-spread change
const RESIZE_MIN_DELTA = -600; // clamp how far a single gesture can shrink…
const RESIZE_MAX_DELTA = 900; // …or grow a widget
const RESIZE_STABLE_EPS = 8; // spread (px) wiggle under this counts as "holding still"
const RESIZE_HOLD_MS = 1200; // hold still this long in resize mode → commit + exit
const NO_HAND_GRACE = 6; // frames the hand may vanish before we end an interaction

type Phase = "off" | "loading" | "tracking" | "error";
type Mode = "idle" | "drag" | "resize";

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const dist2d = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

// Dispatch a synthetic left-button mouse event in viewport coordinates.
function fireMouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  x: number,
  y: number,
) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
    }),
  );
}

export default function GestureControl() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("off");
  const [errorKind, setErrorKind] = useState<"camera" | "model" | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>("idle"); // drives the on-screen hint only

  // Long-lived objects kept in refs so the rAF loop never sees stale state and
  // we don't re-render on every frame.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  const posRef = useRef<{ x: number; y: number } | null>(null); // smoothed cursor (viewport px)
  const pinchingRef = useRef(false);
  const dragHandleRef = useRef<HTMLElement | null>(null);
  const lastVideoTimeRef = useRef(-1);

  // Interaction state machine (read inside the rAF loop, never triggers renders).
  const modeRef = useRef<Mode>("idle");
  const noHandRef = useRef(0); // consecutive frames with no hand (debounce)
  const spreadPxRef = useRef(0); // current thumb↔index distance in viewport px
  // dwell-to-resize
  const dwellItemRef = useRef<HTMLElement | null>(null);
  const dwellStartRef = useRef(0);
  // active resize
  const resizeHandleRef = useRef<HTMLElement | null>(null);
  const resizeAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const resizeLastRef = useRef<{ x: number; y: number } | null>(null);
  const resizeBaseSpreadRef = useRef(0);
  const resizePrevSpreadRef = useRef(0);
  const resizeStableSinceRef = useRef(0);

  useEffect(() => setMounted(true), []);

  // ── cursor visuals ────────────────────────────────────────────────────────
  // state: idle (white) · dwell (blue ring fills over 5s) · drag (green) · resize (blue)
  const applyCursor = useCallback(
    (state: "idle" | "dwell" | "drag" | "resize", progress = 0) => {
      const c = cursorRef.current;
      const ring = ringRef.current;
      if (c) {
        if (state === "drag") {
          c.style.borderColor = "rgba(16,185,129,0.95)";
          c.style.backgroundColor = "rgba(16,185,129,0.30)";
        } else if (state === "resize") {
          c.style.borderColor = "rgba(59,130,246,0.95)";
          c.style.backgroundColor = "rgba(59,130,246,0.30)";
        } else if (state === "dwell") {
          c.style.borderColor = "rgba(96,165,250,0.95)";
          c.style.backgroundColor = "rgba(59,130,246,0.15)";
        } else {
          c.style.borderColor = "rgba(255,255,255,0.9)";
          c.style.backgroundColor = "rgba(255,255,255,0.12)";
        }
      }
      if (ring) {
        if (state === "dwell") {
          const deg = Math.round(clamp01(progress) * 360);
          ring.style.background = `conic-gradient(rgb(59,130,246) ${deg}deg, rgba(255,255,255,0.18) ${deg}deg)`;
          ring.style.opacity = "1";
        } else if (state === "resize") {
          ring.style.background = "conic-gradient(rgb(59,130,246) 360deg, rgb(59,130,246) 0deg)";
          ring.style.opacity = "1";
        } else {
          ring.style.opacity = "0";
        }
      }
    },
    [],
  );

  // ── per-frame: draw the preview skeleton for feedback ─────────────────────
  const drawPreview = useCallback((hand: NormalizedLandmark[] | null, m: Mode) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!hand) return;
    // The displayed video is mirrored (scaleX(-1)); mirror the overlay too.
    const px = (p: NormalizedLandmark) => (1 - p.x) * canvas.width;
    const py = (p: NormalizedLandmark) => p.y * canvas.height;
    ctx.fillStyle = "rgba(16,185,129,0.85)";
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(px(p), py(p), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const tip = hand[INDEX_TIP];
    const thumb = hand[THUMB_TIP];
    // The thumb↔index line doubles as the live grab / zoom indicator.
    const line =
      m === "resize"
        ? "rgba(59,130,246,0.95)"
        : m === "drag"
          ? "rgba(244,63,94,0.95)"
          : "rgba(250,204,21,0.9)";
    const dot = m === "resize" ? "#3b82f6" : m === "drag" ? "#f43f5e" : "#facc15";
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(thumb), py(thumb));
    ctx.lineTo(px(tip), py(tip));
    ctx.stroke();
    ctx.fillStyle = dot;
    for (const p of [tip, thumb]) {
      ctx.beginPath();
      ctx.arc(px(p), py(p), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  // ── per-frame: hand → cursor + the idle / drag / dwell / resize machine ───
  const onFrame = useCallback(
    (res: HandLandmarkerResult) => {
      const cursor = cursorRef.current;
      const hand = res?.landmarks?.[0] ?? null;
      drawPreview(hand, modeRef.current);

      // ----- small helpers (closures over refs) -----
      const gridItemAt = (x: number, y: number) =>
        (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(
          ".react-grid-item",
        ) ?? null;

      const endDrag = (x: number, y: number) => {
        if (dragHandleRef.current) fireMouse(document, "mouseup", x, y);
        dragHandleRef.current = null;
      };
      const endResize = () => {
        const p = resizeLastRef.current;
        if (resizeHandleRef.current && p) fireMouse(document, "mouseup", p.x, p.y);
        resizeHandleRef.current = null;
        resizeAnchorRef.current = null;
        resizeLastRef.current = null;
      };
      const goIdle = () => {
        if (modeRef.current === "drag") endDrag(posRef.current?.x ?? 0, posRef.current?.y ?? 0);
        else if (modeRef.current === "resize") endResize();
        modeRef.current = "idle";
        setMode("idle");
        pinchingRef.current = false;
        dwellItemRef.current = null;
        dwellStartRef.current = 0;
      };

      // ----- hand lost (debounced so a 1-frame flicker doesn't drop a drag) -----
      if (!hand) {
        noHandRef.current += 1;
        if (noHandRef.current >= NO_HAND_GRACE) {
          if (modeRef.current !== "idle" || pinchingRef.current || dwellItemRef.current) {
            goIdle();
            applyCursor("idle");
          }
          if (cursor) cursor.style.opacity = "0.25";
        }
        return;
      }
      noHandRef.current = 0;
      if (cursor) cursor.style.opacity = "1";

      // ----- map index fingertip → smoothed viewport cursor -----
      const tip = hand[INDEX_TIP];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const nx = clamp01((1 - tip.x - 0.5) * GAIN + 0.5);
      const ny = clamp01((tip.y - 0.5) * GAIN + 0.5);
      const prev = posRef.current ?? { x: nx * vw, y: ny * vh };
      const x = prev.x + (nx * vw - prev.x) * SMOOTHING;
      const y = prev.y + (ny * vh - prev.y) * SMOOTHING;
      posRef.current = { x, y };

      // ----- thumb↔index spread (powers both pinch and resize) -----
      const palm = dist2d(hand[WRIST], hand[MIDDLE_MCP]) || 1e-4;
      const pinchRatio = dist2d(tip, hand[THUMB_TIP]) / palm;
      spreadPxRef.current = dist2d(tip, hand[THUMB_TIP]) * vw;

      // ── RESIZE MODE ──────────────────────────────────────────────────────
      // Cursor is anchored to the widget's SE handle; finger spread drives size.
      if (modeRef.current === "resize") {
        const anchor = resizeAnchorRef.current;
        if (anchor) {
          const nowMs = performance.now();
          if (Math.abs(spreadPxRef.current - resizePrevSpreadRef.current) > RESIZE_STABLE_EPS) {
            resizeStableSinceRef.current = nowMs; // hand still moving → reset the hold timer
          }
          resizePrevSpreadRef.current = spreadPxRef.current;

          let d = (spreadPxRef.current - resizeBaseSpreadRef.current) * RESIZE_GAIN;
          d = Math.max(RESIZE_MIN_DELTA, Math.min(RESIZE_MAX_DELTA, d));
          const rx = anchor.x + d;
          const ry = anchor.y + d;
          resizeLastRef.current = { x: rx, y: ry };
          fireMouse(document, "mousemove", rx, ry);
          if (cursor)
            cursor.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;

          // Held still long enough → commit this size and exit resize mode.
          if (nowMs - resizeStableSinceRef.current > RESIZE_HOLD_MS) {
            endResize();
            modeRef.current = "idle";
            setMode("idle");
            dwellItemRef.current = null;
            dwellStartRef.current = 0;
            applyCursor("idle");
          }
        }
        return;
      }

      // move the virtual cursor (idle / dwell / drag)
      if (cursor)
        cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

      // ── PINCH → grab / drag ──────────────────────────────────────────────
      const was = pinchingRef.current;
      let now = was;
      if (!was && pinchRatio < PINCH_ON) now = true;
      else if (was && pinchRatio > PINCH_OFF) now = false;

      if (now && !was) {
        // a fresh pinch cancels any dwell-to-resize progress
        dwellItemRef.current = null;
        dwellStartRef.current = 0;
        // Grab the WHOLE widget under the cursor, not just the thin header:
        // find its drag handle even when the cursor is over the body.
        const item = gridItemAt(x, y);
        const handle =
          (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(
            ".widget-drag-handle",
          ) ??
          item?.querySelector<HTMLElement>(".widget-drag-handle") ??
          null;
        if (handle) {
          dragHandleRef.current = handle;
          modeRef.current = "drag";
          setMode("drag");
          fireMouse(handle, "mousedown", x, y);
          fireMouse(document, "mousemove", x, y); // kick react-draggable into drag mode
        }
        applyCursor("drag");
      } else if (!now && was) {
        endDrag(x, y);
        if (modeRef.current === "drag") {
          modeRef.current = "idle";
          setMode("idle");
        }
        applyCursor("idle");
      } else if (now) {
        if (modeRef.current === "drag" && dragHandleRef.current)
          fireMouse(document, "mousemove", x, y);
      } else {
        // ── DWELL (no pinch, hover one widget 5s) → enter RESIZE ───────────
        const item = gridItemAt(x, y);
        if (!item) {
          if (dwellItemRef.current) applyCursor("idle");
          dwellItemRef.current = null;
          dwellStartRef.current = 0;
        } else if (dwellItemRef.current !== item) {
          dwellItemRef.current = item;
          dwellStartRef.current = performance.now();
          applyCursor("dwell", 0);
        } else {
          const progress = Math.min(1, (performance.now() - dwellStartRef.current) / DWELL_MS);
          if (progress >= 1) {
            const handle =
              item.querySelector<HTMLElement>(".react-resizable-handle-se") ??
              item.querySelector<HTMLElement>(".react-resizable-handle");
            if (handle) {
              const r = handle.getBoundingClientRect();
              const anchor = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
              resizeHandleRef.current = handle;
              resizeAnchorRef.current = anchor;
              resizeLastRef.current = anchor;
              resizeBaseSpreadRef.current = spreadPxRef.current;
              resizePrevSpreadRef.current = spreadPxRef.current;
              resizeStableSinceRef.current = performance.now();
              modeRef.current = "resize";
              setMode("resize");
              pinchingRef.current = false;
              dwellItemRef.current = null;
              dwellStartRef.current = 0;
              fireMouse(handle, "mousedown", anchor.x, anchor.y);
              fireMouse(document, "mousemove", anchor.x, anchor.y);
              applyCursor("resize");
              if (cursor)
                cursor.style.transform = `translate(${anchor.x}px, ${anchor.y}px) translate(-50%, -50%)`;
              return;
            }
            // widget isn't resizable — restart the timer instead of spinning
            dwellStartRef.current = performance.now();
          } else {
            applyCursor("dwell", progress);
          }
        }
      }
      pinchingRef.current = now;
    },
    [drawPreview, applyCursor],
  );

  // ── teardown: stop camera, model, rAF, and any in-flight drag ─────────────
  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (dragHandleRef.current) {
      fireMouse(
        document,
        "mouseup",
        posRef.current?.x ?? 0,
        posRef.current?.y ?? 0,
      );
      dragHandleRef.current = null;
    }
    if (resizeHandleRef.current) {
      const p = resizeLastRef.current ?? resizeAnchorRef.current;
      fireMouse(document, "mouseup", p?.x ?? 0, p?.y ?? 0);
      resizeHandleRef.current = null;
      resizeAnchorRef.current = null;
      resizeLastRef.current = null;
    }
    modeRef.current = "idle";
    setMode("idle");
    dwellItemRef.current = null;
    dwellStartRef.current = 0;
    noHandRef.current = 0;
    pinchingRef.current = false;
    posRef.current = null;
    lastVideoTimeRef.current = -1;

    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
      v.srcObject = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    try {
      landmarkerRef.current?.close();
    } catch {
      /* ignore */
    }
    landmarkerRef.current = null;
  }, []);

  // Start the camera + model when we enter "loading".
  useEffect(() => {
    if (phase !== "loading") return;
    let cancelled = false;

    (async () => {
      // 1. Camera.
      let stream: MediaStream;
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("no getUserMedia");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        if (!cancelled) {
          setErrorKind("camera");
          setPhase("error");
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* autoplay rejection is non-fatal — the element keeps decoding */
        }
      }

      // 2. Model (lazy import keeps MediaPipe out of the initial bundle).
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        let lm: HandLandmarker;
        try {
          lm = await vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 1,
          });
        } catch {
          // Some machines/browsers lack a usable WebGL delegate — fall back to CPU.
          lm = await vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numHands: 1,
          });
        }
        if (cancelled) {
          lm.close();
          return;
        }
        landmarkerRef.current = lm;
        setPhase("tracking");
      } catch {
        if (!cancelled) {
          setErrorKind("model");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Run the detection loop while tracking.
  useEffect(() => {
    if (phase !== "tracking") return;
    let raf = 0;
    const loop = () => {
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (
        video &&
        lm &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          onFrame(lm.detectForVideo(video, performance.now()));
        } catch {
          /* a single dropped frame is fine */
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    rafRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [phase, onFrame]);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  const toggle = () => {
    if (phase === "off" || phase === "error") {
      setErrorKind(null);
      setPhase("loading");
    } else {
      stop();
      setPhase("off");
    }
  };

  const active = phase === "tracking";
  const errorMsg =
    errorKind === "camera"
      ? t("chat.gesture.error.camera")
      : t("chat.gesture.error.model");
  const buttonTitle = active
    ? t("chat.gesture.on")
    : phase === "loading"
      ? t("chat.gesture.loading")
      : phase === "error"
        ? errorMsg
        : t("chat.gesture.off");

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={phase === "loading"}
        aria-label={
          active ? t("chat.gesture.disable") : t("chat.gesture.enable")
        }
        aria-pressed={active}
        title={buttonTitle}
        className={`rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors disabled:opacity-70 ${
          active
            ? "bg-emerald-500/20 text-emerald-300"
            : phase === "error"
              ? "bg-rose-500/15 text-rose-300"
              : "text-zinc-500 hover:text-emerald-300 hover:bg-zinc-800"
        }`}
      >
        {phase === "loading" ? (
          <span
            className="inline-block w-3.5 h-3.5 border-2 border-emerald-300/40 border-t-emerald-300 rounded-full animate-spin"
            aria-hidden
          />
        ) : (
          "✋"
        )}
      </button>

      {mounted &&
        (phase === "loading" || phase === "tracking") &&
        createPortal(
          <div aria-hidden>
            {/* Virtual cursor */}
            <div
              ref={cursorRef}
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                width: 28,
                height: 28,
                borderRadius: "9999px",
                border: "2px solid rgba(255,255,255,0.9)",
                backgroundColor: "rgba(255,255,255,0.12)",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.5)",
                transform: "translate(-100px, -100px)",
                transition:
                  "border-color 80ms linear, background-color 80ms linear",
                pointerEvents: "none",
                zIndex: 2147483000,
                willChange: "transform",
              }}
            >
              {/* Dwell-to-resize progress ring (conic-gradient fills over 5s) */}
              <div
                ref={ringRef}
                style={{
                  position: "absolute",
                  left: -5,
                  top: -5,
                  right: -5,
                  bottom: -5,
                  borderRadius: "9999px",
                  opacity: 0,
                  transition: "opacity 120ms linear",
                  WebkitMask:
                    "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 4,
                  height: 4,
                  borderRadius: "9999px",
                  backgroundColor: "rgba(255,255,255,0.95)",
                  transform: "translate(-50%, -50%)",
                }}
              />
            </div>

            {/* Camera preview + landmark overlay */}
            <div
              style={{
                position: "fixed",
                left: 16,
                bottom: 16,
                width: PREVIEW_W,
                height: PREVIEW_H,
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid rgba(63,63,70,0.9)",
                backgroundColor: "rgba(9,9,11,0.85)",
                boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
                pointerEvents: "none",
                zIndex: 2147482000,
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                }}
              />
              <canvas
                ref={canvasRef}
                width={PREVIEW_W}
                height={PREVIEW_H}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  top: 6,
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(16,185,129,0.95)",
                  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                }}
              >
                {t("chat.gesture.label")}
              </div>
              {phase === "loading" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    color: "rgba(228,228,231,0.95)",
                    backgroundColor: "rgba(9,9,11,0.55)",
                  }}
                >
                  {t("chat.gesture.loading")}
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: "3px 8px",
                  fontSize: 10,
                  color:
                    mode === "drag"
                      ? "rgba(110,231,183,0.98)"
                      : mode === "resize"
                        ? "rgba(147,197,253,0.98)"
                        : "rgba(212,212,216,0.95)",
                  backgroundColor: "rgba(0,0,0,0.45)",
                  textAlign: "center",
                }}
              >
                {mode === "drag"
                  ? t("chat.gesture.dragging")
                  : mode === "resize"
                    ? t("chat.gesture.resizing")
                    : t("chat.gesture.hint")}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
