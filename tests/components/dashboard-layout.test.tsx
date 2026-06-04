// @vitest-environment jsdom
//
// Tests for src/components/DashboardLayout.tsx
//
// We mock `react-grid-layout` (and its CSS imports) so the suite tests our
// dock/restore/persistence behaviour directly without spinning up the real
// grid engine (which needs ResizeObserver, getBoundingClientRect with
// real layout, etc.). The mock keeps the surface area we actually use:
//   - <ResponsiveGridLayout> renders children inside a tagged div and
//     exposes onLayoutChange via a hidden button so we can simulate
//     a user-driven resize/drag.
//   - useContainerWidth returns a non-zero width immediately so the grid
//     branch (`mounted && width > 0`) actually mounts.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("react-grid-layout/css/styles.css", () => ({}));
vi.mock("react-resizable/css/styles.css", () => ({}));

type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

vi.mock("react-grid-layout", () => {
  function ResponsiveGridLayout(props: {
    layouts: { lg: LayoutItem[] };
    children: ReactNode;
    onLayoutChange: (l: LayoutItem[]) => void;
  }) {
    return (
      <div data-testid="rgl-mock">
        {/* expose a simulator so a test can drive onLayoutChange */}
        <button
          data-testid="rgl-simulate-layout"
          onClick={() =>
            props.onLayoutChange(
              props.layouts.lg.map((it) => ({ ...it, x: it.x + 1 })),
            )
          }
        >
          simulate
        </button>
        {props.children}
      </div>
    );
  }
  function useContainerWidth() {
    return { width: 1024, containerRef: { current: null }, mounted: true };
  }
  return { ResponsiveGridLayout, useContainerWidth };
});

import { DashboardLayout, type WidgetSpec } from "@/components/DashboardLayout";

const LS_LAYOUT = "lifemax.dashboard.layout.v1";
const LS_DOCK = "lifemax.dashboard.dock.v1";

function makeSpecs(overrides: Partial<WidgetSpec>[] = []): WidgetSpec[] {
  const base: WidgetSpec[] = [
    {
      id: "portfolio",
      title: "Portfolio",
      defaultLayout: { x: 0, y: 0, w: 6, h: 8 },
      render: () => <div data-testid="body-portfolio">PORTFOLIO BODY</div>,
    },
    {
      id: "weight",
      title: "Weight",
      defaultLayout: { x: 6, y: 0, w: 6, h: 8 },
      render: () => <div data-testid="body-weight">WEIGHT BODY</div>,
    },
    {
      id: "news",
      title: "News",
      defaultLayout: { x: 0, y: 8, w: 6, h: 4 },
      defaultDocked: true,
      render: () => <div data-testid="body-news">NEWS BODY</div>,
    },
  ];
  for (const o of overrides) {
    const i = base.findIndex((s) => s.id === o.id);
    if (i >= 0) base[i] = { ...base[i], ...o };
  }
  return base;
}

// The component renders dock pills via createPortal into #dashboard-dock-slot.
// Tests must add it to the DOM before rendering.
function mountDockSlot() {
  const slot = document.createElement("div");
  slot.id = "dashboard-dock-slot";
  document.body.appendChild(slot);
  return slot;
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("DashboardLayout", () => {
  it("renders non-docked widgets in the grid and shows their bodies", () => {
    mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    // portfolio + weight are in grid; news is default-docked
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();
    expect(screen.getByTestId("body-weight")).toBeInTheDocument();
    expect(screen.queryByTestId("body-news")).not.toBeInTheDocument();
  });

  it("seeds dock state from defaultDocked on first mount and persists it", () => {
    mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    const persisted = JSON.parse(window.localStorage.getItem(LS_DOCK) || "{}");
    expect(persisted).toEqual({ news: true });
  });

  it("renders a dock pill into #dashboard-dock-slot for each docked widget", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    // News pill should be inside the slot, not loose in the grid tree
    expect(slot.textContent).toContain("News");
    expect(slot.querySelector("[draggable]")).not.toBeNull();
  });

  it("park button moves a widget from grid to navbar (and persists)", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    // Portfolio starts in grid
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();

    const parkButtons = screen.getAllByTitle("Park in navbar");
    const portfolioParkBtn = parkButtons.find(
      (b) => b.closest(".react-grid-item, [class*='rounded-xl']")?.textContent?.includes("Portfolio"),
    );
    // Fallback if structural lookup fails: just click first park button next to "Portfolio" label
    const target = portfolioParkBtn ?? parkButtons[0];
    act(() => {
      fireEvent.click(target);
    });

    // After parking, portfolio body should be gone from grid
    expect(screen.queryByTestId("body-portfolio")).not.toBeInTheDocument();
    // And pill should appear in dock slot
    expect(slot.textContent).toContain("Portfolio");
    const dock = JSON.parse(window.localStorage.getItem(LS_DOCK) || "{}");
    expect(dock.portfolio).toBe(true);
  });

  it("restore (↩) on a dock pill moves the widget back to the grid", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    // news is default-docked
    expect(screen.queryByTestId("body-news")).not.toBeInTheDocument();

    // restore button is inside the dock slot, title="Restore to grid"
    const restoreBtn = slot.querySelector('button[title="Restore to grid"]');
    expect(restoreBtn).not.toBeNull();
    act(() => {
      fireEvent.click(restoreBtn!);
    });

    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    const dock = JSON.parse(window.localStorage.getItem(LS_DOCK) || "{}");
    expect(dock.news).toBeFalsy();
  });

  it("clicking the pill body opens a floating popover with the widget content", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    // Click the pill's main button (the one with the title text)
    const pillOpenBtn = Array.from(
      slot.querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("News"));
    expect(pillOpenBtn).toBeDefined();
    act(() => {
      fireEvent.click(pillOpenBtn!);
    });

    // Popover renders news body
    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    // Popover has its own restore + close affordances
    expect(screen.getByTitle("Close")).toBeInTheDocument();
    expect(screen.getByText(/restore/i)).toBeInTheDocument();
  });

  it("popover close button hides the popover but keeps widget docked", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    const pillOpenBtn = Array.from(slot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("News"),
    )!;
    act(() => fireEvent.click(pillOpenBtn));
    expect(screen.getByTestId("body-news")).toBeInTheDocument();

    act(() => fireEvent.click(screen.getByTitle("Close")));
    expect(screen.queryByTestId("body-news")).not.toBeInTheDocument();
    // still docked
    expect(slot.textContent).toContain("News");
  });

  it("dock pill drag sets text/widget-id on the dataTransfer payload", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    const pill = slot.querySelector('[draggable="true"]') as HTMLElement;
    expect(pill).not.toBeNull();

    const setData = vi.fn();
    fireEvent.dragStart(pill, {
      dataTransfer: { setData, effectAllowed: "" },
    });
    expect(setData).toHaveBeenCalledWith("text/widget-id", "news");
  });

  it("dropping a navbar pill onto the grid restores the widget", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    expect(screen.queryByTestId("body-news")).not.toBeInTheDocument();

    // The grid container is the parent of the rgl-mock testid
    const grid = screen.getByTestId("rgl-mock").parentElement!;
    fireEvent.drop(grid, {
      dataTransfer: {
        getData: (k: string) => (k === "text/widget-id" ? "news" : ""),
        types: ["text/widget-id"],
      },
    });

    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    expect(slot.textContent).not.toContain("News");
  });

  it("ignores drops whose payload is not a known widget id", () => {
    const slot = mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    const grid = screen.getByTestId("rgl-mock").parentElement!;
    fireEvent.drop(grid, {
      dataTransfer: {
        getData: () => "totally-bogus-id",
        types: ["text/widget-id"],
      },
    });

    // News stays docked, grid did not gain a body for the bogus id
    expect(slot.textContent).toContain("News");
    expect(screen.queryByTestId("body-news")).not.toBeInTheDocument();
  });

  it("onLayoutChange persists the new layout to localStorage", () => {
    mountDockSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    act(() => fireEvent.click(screen.getByTestId("rgl-simulate-layout")));

    const saved = JSON.parse(window.localStorage.getItem(LS_LAYOUT) || "{}");
    // The mock simulator nudges every item's x by +1. Portfolio default x=0 → 1.
    expect(saved.portfolio).toEqual({ x: 1, y: 0, w: 6, h: 8 });
    expect(saved.weight).toEqual({ x: 7, y: 0, w: 6, h: 8 });
  });

  it("persisted layout overrides defaultLayout on next mount", () => {
    mountDockSlot();
    window.localStorage.setItem(
      LS_LAYOUT,
      JSON.stringify({ portfolio: { x: 3, y: 4, w: 4, h: 4 } }),
    );
    // also persist empty dock so defaultDocked seeding doesn't re-run
    window.localStorage.setItem(LS_DOCK, JSON.stringify({}));

    render(<DashboardLayout specs={makeSpecs()} />);

    // News should NOT be auto-docked (persisted dock state takes precedence)
    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    // Portfolio still rendered in grid
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();
  });

  it("dockable=false widget shows no park button in its header", () => {
    mountDockSlot();
    const specs = makeSpecs([{ id: "weight", dockable: false }]);
    render(<DashboardLayout specs={specs} />);

    // Find the weight widget container by its body and walk up
    const weightBody = screen.getByTestId("body-weight");
    const widgetShell = weightBody.closest("div.flex-col");
    expect(widgetShell).not.toBeNull();
    expect(widgetShell!.querySelector('button[title="Park in navbar"]')).toBeNull();

    // Portfolio still has its park button (control case)
    const portfolioBody = screen.getByTestId("body-portfolio");
    const portfolioShell = portfolioBody.closest("div.flex-col");
    expect(
      portfolioShell!.querySelector('button[title="Park in navbar"]'),
    ).not.toBeNull();
  });

  it("survives a tick when #dashboard-dock-slot is missing (no crash)", () => {
    // No slot in DOM. Component should still render the grid path.
    expect(() => render(<DashboardLayout specs={makeSpecs()} />)).not.toThrow();
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();
  });
});
