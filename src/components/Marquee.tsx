"use client";

import { useEffect, useState } from "react";

export type MarqueeItem = {
  key: string;
  node: React.ReactNode;
  href?: string;
};

export function Marquee({
  items,
  intervalMs = 6000,
  className = "",
}: {
  items: MarqueeItem[];
  intervalMs?: number;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (items.length <= 1) return;
    const tick = setInterval(() => {
      // fade out, swap, fade in
      setVisible(false);
      const t = setTimeout(() => {
        setIdx((i) => (i + 1) % items.length);
        setVisible(true);
      }, 220);
      return () => clearTimeout(t);
    }, intervalMs);
    return () => clearInterval(tick);
  }, [items.length, intervalMs]);

  // Clamp idx if items shrink
  useEffect(() => {
    if (idx >= items.length && items.length > 0) setIdx(0);
  }, [items.length, idx]);

  if (items.length === 0) {
    return (
      <div className={`text-[12px] text-zinc-600 ${className}`} data-testid="marquee-empty">
        —
      </div>
    );
  }

  const item = items[Math.min(idx, items.length - 1)];
  const content = (
    <span
      className={`inline-block transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      data-testid="marquee-item"
      data-key={item.key}
    >
      {item.node}
    </span>
  );

  return (
    <div
      className={`overflow-hidden whitespace-nowrap text-[12px] ${className}`}
      data-testid="marquee"
      title={typeof item.node === "string" ? item.node : undefined}
    >
      {item.href ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-200">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}
