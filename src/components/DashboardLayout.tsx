"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout as RGLLayout,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

export type WidgetId = string;

export type WidgetSpec = {
  id: WidgetId;
  title: string;
  /** default size+position when first added to the grid */
  defaultLayout: { x: number; y: number; w: number; h: number };
  /** Can be parked into the navbar. Defaults to true. Set false for "always on grid" widgets. */
  dockable?: boolean;
  /** If true and no persisted dock state exists yet, start docked in the navbar. */
  defaultDocked?: boolean;
  /** Minimum size in grid units */
  minW?: number;
  minH?: number;
  render: () => ReactNode;
};

type DockState = Record<WidgetId, boolean>; // true = docked (in navbar)

const COLS = 12;
const ROW_HEIGHT = 36;
const MARGIN: [number, number] = [8, 8];

const LS_LAYOUT = "lifemax.dashboard.layout.v1";
const LS_DOCK = "lifemax.dashboard.dock.v1";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota / SSR */
  }
}

// Build initial layout from specs, merged with persisted overrides
function buildLayout(
  specs: WidgetSpec[],
  saved: Record<string, { x: number; y: number; w: number; h: number }>,
  dock: DockState,
): RGLLayout {
  return specs
    .filter((s) => !dock[s.id])
    .map((s) => {
      const o = saved[s.id] ?? s.defaultLayout;
      return {
        i: s.id,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        minW: s.minW ?? 2,
        minH: s.minH ?? 2,
      };
    });
}

function WidgetHeader({
  title,
  onPark,
}: {
  title: string;
  onPark?: () => void;
}) {
  return (
    <div className="widget-drag-handle flex items-center justify-between px-2 py-0.5 border-b border-zinc-800/60 cursor-move select-none">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{title}</span>
      <div className="flex items-center gap-1">
        {onPark && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPark();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-800"
            title="Park in navbar"
          >
            ⤴ park
          </button>
        )}
      </div>
    </div>
  );
}

function DockPill({
  spec,
  onRestore,
  onOpen,
  isOpen,
}: {
  spec: WidgetSpec;
  onRestore: () => void;
  onOpen: () => void;
  isOpen: boolean;
}) {
  // draggable so user can drop it back onto grid
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/widget-id", spec.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="inline-flex items-stretch rounded-md border border-zinc-800 bg-zinc-900/60 text-[12px] text-zinc-300 hover:bg-zinc-800 overflow-hidden"
      title={`${spec.title} (drag to grid to restore)`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="px-2 py-0.5 hover:text-zinc-100"
      >
        {spec.title}
        <span className="ml-1 text-zinc-600">{isOpen ? "▴" : "▾"}</span>
      </button>
      <button
        type="button"
        onClick={onRestore}
        title="Restore to grid"
        className="px-1.5 py-0.5 border-l border-zinc-800 text-zinc-500 hover:text-emerald-300"
      >
        ↩
      </button>
    </div>
  );
}

export function DashboardLayout({ specs }: { specs: WidgetSpec[] }) {
  // hooks always run
  const [mounted, setMounted] = useState(false);
  const [dock, setDock] = useState<DockState>({});
  const [savedLayout, setSavedLayout] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});
  const [openDockId, setOpenDockId] = useState<WidgetId | null>(null);
  const { width, containerRef } = useContainerWidth();

  // Drop target: we want to support drag-from-navbar-to-grid via setting droppingItem then onDrop
  const [droppingId, setDroppingId] = useState<WidgetId | null>(null);

  useEffect(() => {
    setMounted(true);
    const persisted = readJSON<DockState | null>(LS_DOCK, null);
    if (persisted) {
      setDock(persisted);
    } else {
      // first run — honour defaultDocked
      const seed: DockState = {};
      for (const s of specs) if (s.defaultDocked) seed[s.id] = true;
      setDock(seed);
      writeJSON(LS_DOCK, seed);
    }
    setSavedLayout(
      readJSON<Record<string, { x: number; y: number; w: number; h: number }>>(LS_LAYOUT, {}),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const specMap = useMemo(() => {
    const m = new Map<WidgetId, WidgetSpec>();
    for (const s of specs) m.set(s.id, s);
    return m;
  }, [specs]);

  const layout = useMemo(
    () => buildLayout(specs, savedLayout, dock),
    [specs, savedLayout, dock],
  );

  const onLayoutChange = (next: RGLLayout) => {
    const merged = { ...savedLayout };
    for (const it of next) {
      merged[it.i] = { x: it.x, y: it.y, w: it.w, h: it.h };
    }
    setSavedLayout(merged);
    writeJSON(LS_LAYOUT, merged);
  };

  const park = (id: WidgetId) => {
    const nd = { ...dock, [id]: true };
    setDock(nd);
    writeJSON(LS_DOCK, nd);
    setOpenDockId(null);
  };
  const restore = (id: WidgetId) => {
    const nd = { ...dock };
    delete nd[id];
    setDock(nd);
    writeJSON(LS_DOCK, nd);
    setOpenDockId(null);
  };

  // ---- drag-from-navbar onto grid ----
  const onDragOverGrid = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types && Array.from(types).includes("text/widget-id")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };
  const onDropGrid = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData("text/widget-id");
    if (!id || !specMap.has(id)) return;
    e.preventDefault();
    restore(id);
    setDroppingId(null);
  };

  // Mount the dock pills into the navbar slot (#dashboard-dock-slot in page.tsx)
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!mounted) return;
    const el = document.getElementById("dashboard-dock-slot");
    setDockSlot(el);
  }, [mounted]);

  const dockedSpecs = specs.filter((s) => dock[s.id]);

  return (
    <>
      {/* Portal-ish: render pills into the navbar slot via simple DOM mutation through state */}
      {dockSlot &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (require("react-dom") as any).createPortal(
          <>
            {dockedSpecs.map((s) => (
              <DockPill
                key={s.id}
                spec={s}
                isOpen={openDockId === s.id}
                onOpen={() => setOpenDockId((cur) => (cur === s.id ? null : s.id))}
                onRestore={() => restore(s.id)}
              />
            ))}
          </>,
          dockSlot,
        )}

      {/* Floating popover panel for the currently-open docked widget */}
      {openDockId && specMap.has(openDockId) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenDockId(null)}
        >
          <div
            className="absolute right-3 top-12 w-[min(560px,90vw)] max-h-[70vh] rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
              <span className="text-[12px] uppercase tracking-widest text-zinc-400">
                {specMap.get(openDockId)!.title}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => restore(openDockId!)}
                  className="text-[11px] text-zinc-500 hover:text-emerald-300 px-1.5 py-0.5 rounded hover:bg-zinc-800"
                  title="Restore to grid"
                >
                  ↩ restore
                </button>
                <button
                  type="button"
                  onClick={() => setOpenDockId(null)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-800"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {specMap.get(openDockId)!.render()}
            </div>
          </div>
        </div>
      )}

      {/* Grid container — also accepts drag from navbar pills */}
      <div
        ref={containerRef as React.Ref<HTMLDivElement>}
        onDragOver={onDragOverGrid}
        onDrop={onDropGrid}
        className="flex-1 overflow-auto min-h-0 px-2 pt-2"
        data-droppingid={droppingId ?? ""}
      >
        {mounted && width > 0 && (
          <ResponsiveGridLayout
            className="layout"
            layouts={{ lg: layout }}
            breakpoints={{ lg: 0 }}
            cols={{ lg: COLS }}
            rowHeight={ROW_HEIGHT}
            margin={MARGIN}
            width={width}
            dragConfig={{ handle: ".widget-drag-handle" }}
            onLayoutChange={(l: RGLLayout) => onLayoutChange(l)}
          >
            {layout.map((item) => {
              const spec = specMap.get(item.i);
              if (!spec) return <div key={item.i} />;
              return (
                <div
                  key={item.i}
                  className="flex flex-col min-h-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
                >
                  <WidgetHeader
                    title={spec.title}
                    onPark={spec.dockable === false ? undefined : () => park(spec.id)}
                  />
                  <div className="flex-1 min-h-0 overflow-auto">{spec.render()}</div>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>

      {/* Tiny visual style hooks — RGL placeholders */}
      <style jsx global>{`
        .react-grid-item.react-grid-placeholder {
          background: rgba(59, 130, 246, 0.15) !important;
          border: 1px dashed rgb(59, 130, 246);
          border-radius: 12px;
        }
        .react-grid-item > .react-resizable-handle {
          opacity: 0.35;
        }
        .react-grid-item:hover > .react-resizable-handle {
          opacity: 0.9;
        }
      `}</style>
    </>
  );
}

// Silence unused imports warning when LayoutItem not directly referenced
export type _LayoutItem = LayoutItem;
