"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  className?: string;
  /** ms per char flip. default 350 */
  duration?: number;
};

/**
 * Split-flap-style number animator.
 * Compares the previous string to the new one char-by-char; only changed
 * positions animate (old slides up, new slides down). Designed for ticker
 * prices like "$376.12" or "+0.51%".
 */
export default function FlipNumber({ value, className = "", duration = 350 }: Props) {
  const [prev, setPrev] = useState(value);
  const [animating, setAnimating] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      setPrev(value);
      return;
    }
    if (value === prev) return;
    setAnimating(true);
    const t = setTimeout(() => {
      setPrev(value);
      setAnimating(false);
    }, duration);
    return () => clearTimeout(t);
  }, [value, prev, duration]);

  const a = prev;
  const b = value;
  const len = Math.max(a.length, b.length);
  const chars: { from: string; to: string; changed: boolean }[] = [];
  // Align from the RIGHT so the decimal point and units stay put when the
  // integer part grows by a digit.
  for (let i = 0; i < len; i++) {
    const ai = a[a.length - len + i] ?? " ";
    const bi = b[b.length - len + i] ?? " ";
    chars.push({ from: ai, to: bi, changed: ai !== bi && animating });
  }

  return (
    <span className={`inline-flex tabular-nums ${className}`}>
      {chars.map((c, i) => (
        <span
          key={i}
          className="relative inline-block overflow-hidden"
          style={{ height: "1em", lineHeight: "1em", width: c.to === " " ? "0.25em" : undefined }}
        >
          <span
            className="block transition-transform ease-out"
            style={{
              transitionDuration: `${duration}ms`,
              transform: c.changed ? "translateY(-50%)" : "translateY(0%)",
            }}
          >
            <span className="block" style={{ height: "1em", lineHeight: "1em" }}>
              {c.from === " " ? "\u00a0" : c.from}
            </span>
            <span className="block" style={{ height: "1em", lineHeight: "1em" }}>
              {c.to === " " ? "\u00a0" : c.to}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
