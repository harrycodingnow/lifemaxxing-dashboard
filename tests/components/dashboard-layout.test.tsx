// @vitest-environment jsdom
//
// Tests for src/components/DashboardLayout.tsx
//
// The component now uses a "+ widgets" sidebar trigger (portal-mounted into
// #dashboard-widgets-slot) and a right-side panel listing every spec; the old
// dock-pill / park-to-navbar UI is gone. Hidden state persists to
// lifemax.dashboard.hidden.v1 with a one-time migration from the legacy
// lifemax.dashboard.dock.v1 key.
//
// react-grid-layout itself is mocked so we exercise our state/persistence
// without spinning up the real grid (which needs ResizeObserver + real layout).

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
const LS_HIDDEN = "lifemax.dashboard.hidden.v1";
const LS_LEGACY_DOCK = "lifemax.dashboard.dock.v1";

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
      // exercises the legacy alias on first-mount seed
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

// The component portal-mounts the sidebar trigger into a slot in the navbar.
// Tests must add the slot to the DOM before rendering.
function mountSlot() {
  const slot = document.createElement("div");
  slot.id = "dashboard-widgets-slot";
  document.body.appendChild(slot);
  return slot;
}

function openSidebar() {
  const trigger = screen.getByTestId("widget-sidebar-trigger");
  act(() => {
    fireEvent.click(trigger);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("DashboardLayout — grid + hidden state", () => {
  it("renders non-hidden widgets in the grid and shows their bodies", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();
    expect(screen.getByTestId("body-weight")).toBeInTheDocument();
    // news starts default-hidden (via legacy defaultDocked alias)
    expect(screen.queryByTestId("body-news")).not.toBeInTheDocument();
  });

  it("seeds hidden state from defaultHidden / legacy defaultDocked on first mount", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    const persisted = JSON.parse(window.localStorage.getItem(LS_HIDDEN) || "{}");
    expect(persisted).toEqual({ news: true });
  });

  it("migrates legacy dock.v1 state on first mount when hidden.v1 is absent", () => {
    mountSlot();
    window.localStorage.setItem(
      LS_LEGACY_DOCK,
      JSON.stringify({ portfolio: true }),
    );
    render(<DashboardLayout specs={makeSpecs()} />);
    expect(screen.queryByTestId("body-portfolio")).not.toBeInTheDocument();
    // News should be visible — legacy state takes precedence over defaultHidden.
    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    // The migration also writes hidden.v1 for future runs.
    const persisted = JSON.parse(window.localStorage.getItem(LS_HIDDEN) || "{}");
    expect(persisted).toEqual({ portfolio: true });
  });

  it("persisted hidden state overrides defaultHidden", () => {
    mountSlot();
    window.localStorage.setItem(LS_HIDDEN, JSON.stringify({}));
    render(<DashboardLayout specs={makeSpecs()} />);
    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();
  });
});

describe("DashboardLayout — widget header hide button", () => {
  it("hide (✕) button removes a widget from the grid and persists it", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();

    const hideButtons = screen.getAllByTitle(/^Hide widget/);
    const portfolioHideBtn = hideButtons.find(
      (b) => b.closest("div.flex-col")?.textContent?.includes("Portfolio"),
    );
    expect(portfolioHideBtn).toBeDefined();
    act(() => {
      fireEvent.click(portfolioHideBtn!);
    });

    expect(screen.queryByTestId("body-portfolio")).not.toBeInTheDocument();
    const persisted = JSON.parse(window.localStorage.getItem(LS_HIDDEN) || "{}");
    expect(persisted.portfolio).toBe(true);
  });

  it("hideable=false widget shows no hide button in its header", () => {
    mountSlot();
    const specs = makeSpecs([{ id: "weight", hideable: false }]);
    render(<DashboardLayout specs={specs} />);

    const weightBody = screen.getByTestId("body-weight");
    const widgetShell = weightBody.closest("div.flex-col");
    expect(widgetShell).not.toBeNull();
    expect(widgetShell!.querySelector('button[title^="Hide widget"]')).toBeNull();

    // Portfolio still has its hide button as a control.
    const portfolioBody = screen.getByTestId("body-portfolio");
    const portfolioShell = portfolioBody.closest("div.flex-col");
    expect(portfolioShell!.querySelector('button[title^="Hide widget"]')).not.toBeNull();
  });

  it("dockable=false (legacy alias) is honored and disables the hide button", () => {
    mountSlot();
    const specs = makeSpecs([{ id: "weight", dockable: false }]);
    render(<DashboardLayout specs={specs} />);
    const widgetShell = screen.getByTestId("body-weight").closest("div.flex-col");
    expect(widgetShell!.querySelector('button[title^="Hide widget"]')).toBeNull();
  });
});

describe("DashboardLayout — sidebar (+) panel", () => {
  it("portal-mounts a '+ widgets' trigger into #dashboard-widgets-slot", () => {
    const slot = mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    expect(slot.textContent).toContain("widgets");
    expect(slot.querySelector('[data-testid="widget-sidebar-trigger"]')).not.toBeNull();
  });

  it("trigger shows the hidden-count badge", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    // news is default-hidden → 1 hidden.
    const trigger = screen.getByTestId("widget-sidebar-trigger");
    expect(trigger.textContent).toMatch(/\(1 hidden\)/);
  });

  it("clicking the trigger opens the sidebar; ✕ closes it", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    expect(screen.queryByTestId("widget-sidebar")).not.toBeInTheDocument();
    openSidebar();
    const sidebar = screen.getByTestId("widget-sidebar");
    expect(sidebar).toBeInTheDocument();
    expect(sidebar.textContent).toContain("News");
    expect(sidebar.textContent).toContain("Portfolio");

    const closeBtn = sidebar.querySelector('button[title="Close"]')!;
    act(() => fireEvent.click(closeBtn));
    expect(screen.queryByTestId("widget-sidebar")).not.toBeInTheDocument();
  });

  it("clicking outside (the scrim) closes the sidebar", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    openSidebar();
    expect(screen.getByTestId("widget-sidebar")).toBeInTheDocument();
    act(() => fireEvent.mouseDown(screen.getByTestId("widget-sidebar-scrim")));
    expect(screen.queryByTestId("widget-sidebar")).not.toBeInTheDocument();
  });

  it("filters widgets by title via the filter input", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    openSidebar();

    const filterInput = screen.getByPlaceholderText("Filter…") as HTMLInputElement;
    act(() => fireEvent.change(filterInput, { target: { value: "port" } }));

    expect(screen.getByTestId("widget-row-portfolio")).toBeInTheDocument();
    expect(screen.queryByTestId("widget-row-news")).not.toBeInTheDocument();
    expect(screen.queryByTestId("widget-row-weight")).not.toBeInTheDocument();
  });

  it("'+ add' on a hidden widget restores it to the grid + updates persistence", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    openSidebar();

    const row = screen.getByTestId("widget-row-news");
    const addBtn = row.querySelector('button[title="Add to grid"]')!;
    expect(addBtn).not.toBeNull();
    act(() => fireEvent.click(addBtn));

    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    const persisted = JSON.parse(window.localStorage.getItem(LS_HIDDEN) || "{}");
    expect(persisted.news).toBeFalsy();
  });

  it("'hide' on a visible widget removes it from the grid + updates persistence", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    openSidebar();

    const row = screen.getByTestId("widget-row-portfolio");
    const hideBtn = row.querySelector('button[title="Hide from grid"]')!;
    expect(hideBtn).not.toBeNull();
    act(() => fireEvent.click(hideBtn));

    expect(screen.queryByTestId("body-portfolio")).not.toBeInTheDocument();
    const persisted = JSON.parse(window.localStorage.getItem(LS_HIDDEN) || "{}");
    expect(persisted.portfolio).toBe(true);
  });

  it("pinned (hideable=false) row shows a 'pinned' label, no hide button", () => {
    mountSlot();
    const specs = makeSpecs([{ id: "weight", hideable: false }]);
    render(<DashboardLayout specs={specs} />);
    openSidebar();

    const row = screen.getByTestId("widget-row-weight");
    expect(row.querySelector('button[title="Hide from grid"]')).toBeNull();
    expect(row.textContent?.toLowerCase()).toContain("pinned");
  });

  it("hidden row sets text/widget-id on drag, and dropping it on the grid restores it", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    openSidebar();

    const row = screen.getByTestId("widget-row-news");
    expect(row.getAttribute("draggable")).toBe("true");

    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith("text/widget-id", "news");

    // Drop on the grid container (parent of the rgl-mock).
    const grid = screen.getByTestId("rgl-mock").parentElement!;
    fireEvent.drop(grid, {
      dataTransfer: {
        getData: (k: string) => (k === "text/widget-id" ? "news" : ""),
        types: ["text/widget-id"],
      },
    });

    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    expect(screen.queryByTestId("widget-sidebar")).not.toBeInTheDocument();
  });

  it("drops with an unknown payload are ignored (no spurious renders)", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);
    const grid = screen.getByTestId("rgl-mock").parentElement!;
    fireEvent.drop(grid, {
      dataTransfer: {
        getData: () => "totally-bogus-id",
        types: ["text/widget-id"],
      },
    });
    // news is still hidden.
    expect(screen.queryByTestId("body-news")).not.toBeInTheDocument();
  });
});

describe("DashboardLayout — layout persistence", () => {
  it("onLayoutChange persists the new layout to localStorage", () => {
    mountSlot();
    render(<DashboardLayout specs={makeSpecs()} />);

    act(() => fireEvent.click(screen.getByTestId("rgl-simulate-layout")));

    const saved = JSON.parse(window.localStorage.getItem(LS_LAYOUT) || "{}");
    expect(saved.portfolio).toEqual({ x: 1, y: 0, w: 6, h: 8 });
    expect(saved.weight).toEqual({ x: 7, y: 0, w: 6, h: 8 });
  });

  it("persisted layout overrides defaultLayout on next mount", () => {
    mountSlot();
    window.localStorage.setItem(
      LS_LAYOUT,
      JSON.stringify({ portfolio: { x: 3, y: 4, w: 4, h: 4 } }),
    );
    window.localStorage.setItem(LS_HIDDEN, JSON.stringify({}));
    render(<DashboardLayout specs={makeSpecs()} />);

    expect(screen.getByTestId("body-news")).toBeInTheDocument();
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();
  });
});

describe("DashboardLayout — defensive", () => {
  it("survives missing #dashboard-widgets-slot (no portal target → no crash)", () => {
    expect(() => render(<DashboardLayout specs={makeSpecs()} />)).not.toThrow();
    expect(screen.getByTestId("body-portfolio")).toBeInTheDocument();
  });

  it("falls back to the legacy #dashboard-dock-slot if the new id is absent", () => {
    const legacy = document.createElement("div");
    legacy.id = "dashboard-dock-slot";
    document.body.appendChild(legacy);
    render(<DashboardLayout specs={makeSpecs()} />);
    expect(legacy.querySelector('[data-testid="widget-sidebar-trigger"]')).not.toBeNull();
  });
});
