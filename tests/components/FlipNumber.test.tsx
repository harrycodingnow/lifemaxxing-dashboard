// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import FlipNumber from "@/components/FlipNumber";

// Each char produces two stacked spans (from + to), so textContent doubles
// each glyph. We assert via .includes on extracted digits.
const digits = (s: string | null) => (s ?? "").replace(/[^0-9$.+%-]/g, "");

describe("<FlipNumber />", () => {
  it("renders initial value characters", () => {
    const { container } = render(<FlipNumber value="$1.23" />);
    const text = digits(container.textContent);
    for (const ch of "$1.23") expect(text).toContain(ch);
  });

  it("non-numeric value renders without crash", () => {
    const { container } = render(<FlipNumber value="N/A" />);
    expect(container.textContent).toBeTruthy();
  });

  it("after update the new value appears in DOM", async () => {
    vi.useFakeTimers();
    const { rerender, container } = render(<FlipNumber value="$1.00" duration={100} />);
    rerender(<FlipNumber value="$2.00" duration={100} />);
    expect(digits(container.textContent)).toContain("2");
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(digits(container.textContent)).toContain("2");
    vi.useRealTimers();
  });

  it("custom className passes through to wrapper", () => {
    const { container } = render(<FlipNumber value="1" className="text-red-500" />);
    expect(container.querySelector(".text-red-500")).toBeTruthy();
  });

  it("toggles animating state on update (transform changes)", async () => {
    vi.useFakeTimers();
    const { rerender, container } = render(<FlipNumber value="1" duration={100} />);
    rerender(<FlipNumber value="2" duration={100} />);
    // mid-animation, the inner block carries a non-zero translateY
    const inner = container.querySelector("span > span > span") as HTMLElement | null;
    expect(inner?.getAttribute("style") || "").toMatch(/translateY/);
    await act(async () => { vi.advanceTimersByTime(200); });
    vi.useRealTimers();
  });
});
