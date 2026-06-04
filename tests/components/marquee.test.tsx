// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Marquee, type MarqueeItem } from "@/components/Marquee";

describe("Marquee", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders empty state when no items", () => {
    render(<Marquee items={[]} />);
    expect(screen.getByTestId("marquee-empty")).toBeDefined();
  });

  it("renders first item initially", () => {
    const items: MarqueeItem[] = [
      { key: "a", node: "Alpha" },
      { key: "b", node: "Bravo" },
    ];
    render(<Marquee items={items} />);
    expect(screen.getByTestId("marquee-item").getAttribute("data-key")).toBe("a");
  });

  it("rotates to next item after intervalMs + fade timeout", () => {
    const items: MarqueeItem[] = [
      { key: "a", node: "Alpha" },
      { key: "b", node: "Bravo" },
    ];
    render(<Marquee items={items} intervalMs={1000} />);
    expect(screen.getByTestId("marquee-item").getAttribute("data-key")).toBe("a");
    // interval fires, fade-out triggers a 220ms timeout that updates idx
    act(() => {
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByTestId("marquee-item").getAttribute("data-key")).toBe("b");
  });

  it("wraps an item in an anchor when href is provided", () => {
    const items: MarqueeItem[] = [{ key: "x", node: "Click", href: "https://example.com" }];
    const { container } = render(<Marquee items={items} />);
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("target")).toBe("_blank");
  });

  it("does not start interval when only one item", () => {
    const items: MarqueeItem[] = [{ key: "only", node: "Solo" }];
    render(<Marquee items={items} intervalMs={500} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("marquee-item").getAttribute("data-key")).toBe("only");
  });
});
