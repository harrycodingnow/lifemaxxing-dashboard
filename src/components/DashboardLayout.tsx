"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout as RGLLayout,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useT } from "@/lib/i18n";

export type WidgetId = string;

export type WidgetSpec = {
  id: WidgetId;
  title: string;
  /** default size+position when first added to the grid */
  defaultLayout: { x: number; y: number; w: number; h: number };
  /**
   * Whether the user is allowed to hide this widget from the grid via the
   * sidebar / widget header. Defaults to true. Set false for "always on grid"
   * widgets that should never disappear (e.g. the chat input row).
   */
  hideable?: boolean;
  /**
   * If true and no persisted state exists yet, the widget starts HIDDEN. The
   * user can show it again from the + sidebar.
   */
  defaultHidden?: boolean;
  /** Minimum size in grid units */
  minW?: number;
  minH?: number;
  render: () => ReactNode;

  /**
   * @deprecated legacy alias of `hideable`. Older specs still pass
   * `dockable`; we treat it the same as `hideable` for now so existing
   * widget declarations keep compiling.
   */
  dockable?: boolean;
  /**
   * @deprecated legacy alias of `defaultHidden`. Pre-sidebar specs used
   * `defaultDocked` to mean "start parked in the navbar". With the sidebar
   * model the equivalent is "start hidden from the grid".
   */
  defaultDocked?: boolean;
};

type HiddenState = Record<WidgetId, boolean>; // true = hidden from grid

const COLS = 12;
const ROW_HEIGHT = 36;
const MARGIN: [number, number] = [8, 8];

const LS_LAYOUT = "lifemax.dashboard.layout.v1";
const LS_HIDDEN = "lifemax.dashboard.hidden.v1";
// Legacy key from the old "park in navbar / dock pill" model. We read it once
// on first mount so users don't lose their parked-widget choices when they
// upgrade, then write to LS_HIDDEN going forward.
const LS_LEGACY_DOCK = "lifemax.dashboard.dock.v1";

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

// Per-spec resolution of which legacy alias to honor.
function isHideable(s: WidgetSpec): boolean {
  if (typeof s.hideable === "boolean") return s.hideable;
  if (typeof s.dockable === "boolean") return s.dockable;
  return true;
}
function isDefaultHidden(s: WidgetSpec): boolean {
  if (typeof s.defaultHidden === "boolean") return s.defaultHidden;
  if (typeof s.defaultDocked === "boolean") return s.defaultDocked;
  return false;
}

// Build initial layout from specs, merged with persisted overrides.
function buildLayout(
  specs: WidgetSpec[],
  saved: Record<string, { x: number; y: number; w: number; h: number }>,
  hidden: HiddenState,
): RGLLayout {
  return specs
    .filter((s) => !hidden[s.id])
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
  onHide,
}: {
  title: string;
  onHide?: () => void;
}) {
  const { t } = useT();
  return (
    <div className="widget-drag-handle flex items-center justify-between px-2 py-0.5 border-b border-zinc-800/60 cursor-move select-none">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{title}</span>
      <div className="flex items-center gap-1">
        {onHide && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onHide();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-[11px] text-zinc-500 hover:text-rose-300 px-1.5 py-0.5 rounded hover:bg-zinc-800"
            title={t("widgetHeader.hide")}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right-side sidebar. Lists every spec; user can add/remove a widget with a
// click, or drag a hidden row onto the grid to restore it.
// ─────────────────────────────────────────────────────────────────────────────
function WidgetSidebar({
  specs,
  hidden,
  open,
  onClose,
  onAdd,
  onRemove,
}: {
  specs: WidgetSpec[];
  hidden: HiddenState;
  open: boolean;
  onClose: () => void;
  onAdd: (id: WidgetId) => void;
  onRemove: (id: WidgetId) => void;
}) {
  const { t } = useT();
  const [filter, setFilter] = useState("");
  // Clear the filter every time the panel reopens so it starts clean.
  useEffect(() => {
    if (open) setFilter("");
  }, [open]);

  if (!open) return null;
  const q = filter.trim().toLowerCase();
  const filtered = q ? specs.filter((s) => s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) : specs;
  const onGrid = filtered.filter((s) => !hidden[s.id]);
  const offGrid = filtered.filter((s) => hidden[s.id]);

  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose} data-testid="widget-sidebar-scrim">
      <aside
        data-testid="widget-sidebar"
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 w-[min(360px,92vw)] bg-zinc-950 border-l border-zinc-800 shadow-2xl shadow-black/60 flex flex-col animate-[slideIn_180ms_ease-out]"
      >
        <header className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-500">{t("sidebar.title")}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">
              {t("sidebar.hint")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 px-2"
            title={t("sidebar.close")}
          >
            ✕
          </button>
        </header>

        <div className="shrink-0 px-3 pt-2 pb-1">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("sidebar.filter")}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 pt-1 flex flex-col gap-3">
          {offGrid.length > 0 && (
            <Section title={t("sidebar.hidden", { n: offGrid.length })}>
              {offGrid.map((s) => (
                <WidgetRow
                  key={s.id}
                  spec={s}
                  state="hidden"
                  onAdd={() => onAdd(s.id)}
                />
              ))}
            </Section>
          )}
          {onGrid.length > 0 && (
            <Section title={t("sidebar.onGrid", { n: onGrid.length })}>
              {onGrid.map((s) => (
                <WidgetRow
                  key={s.id}
                  spec={s}
                  state="visible"
                  onRemove={() => onRemove(s.id)}
                />
              ))}
            </Section>
          )}
          {filtered.length === 0 && (
            <div className="text-[12px] text-zinc-600 text-center py-6">{t("sidebar.empty", { q: filter })}</div>
          )}
        </div>
      </aside>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 px-1 mb-1">{title}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function WidgetRow({
  spec,
  state,
  onAdd,
  onRemove,
}: {
  spec: WidgetSpec;
  state: "hidden" | "visible";
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useT();
  const hideable = isHideable(spec);
  return (
    <div
      data-testid={`widget-row-${spec.id}`}
      draggable={state === "hidden"}
      onDragStart={(e) => {
        if (state !== "hidden") return;
        e.dataTransfer.setData("text/widget-id", spec.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[12px] ${
        state === "hidden"
          ? "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 cursor-grab active:cursor-grabbing"
          : "border-zinc-800/60 bg-zinc-900/20"
      }`}
    >
      <div className="min-w-0 flex items-center gap-2">
        <span className={`shrink-0 text-[10px] ${state === "hidden" ? "text-zinc-600" : "text-emerald-500"}`}>
          {state === "hidden" ? "○" : "●"}
        </span>
        <span className="truncate text-zinc-200" title={spec.title}>{spec.title}</span>
      </div>
      <div className="shrink-0">
        {state === "hidden" ? (
          <button
            type="button"
            onClick={onAdd}
            className="text-[11px] text-emerald-300 hover:text-emerald-200 border border-zinc-800 hover:border-emerald-700 rounded px-1.5 py-0.5"
            title={t("sidebar.addToGrid")}
          >
            {t("sidebar.add")}
          </button>
        ) : hideable ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] text-zinc-500 hover:text-rose-300 border border-zinc-800 hover:border-rose-800 rounded px-1.5 py-0.5"
            title={t("sidebar.hideFromGrid")}
          >
            {t("sidebar.hide")}
          </button>
        ) : (
          <span className="text-[10px] text-zinc-700 uppercase tracking-wider">{t("sidebar.pinned")}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar trigger button — gets portal-mounted into the navbar slot
// (#dashboard-widgets-slot in page.tsx).
// ─────────────────────────────────────────────────────────────────────────────
function SidebarTrigger({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      data-testid="widget-sidebar-trigger"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 px-2 py-0.5 text-[12px] text-zinc-300"
      title={t("sidebar.trigger.title")}
    >
      <span>{t("nav.widgets.add")}</span>
      {count > 0 && (
        <span className="text-[10px] text-zinc-600 ml-0.5">{t("nav.widgets.hidden", { n: count })}</span>
      )}
    </button>
  );
}

export function DashboardLayout({ specs }: { specs: WidgetSpec[] }) {
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState<HiddenState>({});
  const [savedLayout, setSavedLayout] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { width, containerRef } = useContainerWidth();

  useEffect(() => {
    setMounted(true);
    // Persisted hidden state takes precedence. Otherwise migrate from the
    // legacy LS_LEGACY_DOCK key, and finally fall back to defaultHidden seeds.
    const persistedHidden = readJSON<HiddenState | null>(LS_HIDDEN, null);
    if (persistedHidden) {
      setHidden(persistedHidden);
    } else {
      const legacy = readJSON<HiddenState | null>(LS_LEGACY_DOCK, null);
      if (legacy) {
        setHidden(legacy);
        writeJSON(LS_HIDDEN, legacy);
      } else {
        const seed: HiddenState = {};
        for (const s of specs) if (isDefaultHidden(s)) seed[s.id] = true;
        setHidden(seed);
        writeJSON(LS_HIDDEN, seed);
      }
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
    () => buildLayout(specs, savedLayout, hidden),
    [specs, savedLayout, hidden],
  );

  const onLayoutChange = (next: RGLLayout) => {
    const merged = { ...savedLayout };
    for (const it of next) {
      merged[it.i] = { x: it.x, y: it.y, w: it.w, h: it.h };
    }
    setSavedLayout(merged);
    writeJSON(LS_LAYOUT, merged);
  };

  const hide = (id: WidgetId) => {
    const spec = specMap.get(id);
    if (spec && !isHideable(spec)) return; // never hide a pinned widget
    const nh = { ...hidden, [id]: true };
    setHidden(nh);
    writeJSON(LS_HIDDEN, nh);
  };
  const show = (id: WidgetId) => {
    const nh = { ...hidden };
    delete nh[id];
    setHidden(nh);
    writeJSON(LS_HIDDEN, nh);
  };

  // ---- drag-from-sidebar onto grid ----
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
    show(id);
    setSidebarOpen(false);
  };

  // Portal the sidebar trigger into the navbar slot. Keeps the trigger styled
  // and positioned alongside the rest of the navbar without forcing page.tsx
  // to know about sidebar internals.
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!mounted) return;
    // Prefer the new slot; fall back to the legacy id so older pages that
    // haven't been updated still surface the trigger somewhere visible.
    const el =
      document.getElementById("dashboard-widgets-slot") ||
      document.getElementById("dashboard-dock-slot");
    setNavSlot(el);
  }, [mounted]);

  const hiddenCount = useMemo(() => Object.values(hidden).filter(Boolean).length, [hidden]);

  return (
    <>
      {navSlot &&
        createPortal(
          <SidebarTrigger count={hiddenCount} onClick={() => setSidebarOpen(true)} />,
          navSlot,
        )}

      <WidgetSidebar
        specs={specs}
        hidden={hidden}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAdd={(id) => show(id)}
        onRemove={(id) => hide(id)}
      />

      {/* Grid container — accepts drag from sidebar rows */}
      <div
        ref={containerRef as React.Ref<HTMLDivElement>}
        onDragOver={onDragOverGrid}
        onDrop={onDropGrid}
        className="flex-1 overflow-auto min-h-0 px-2 pt-2"
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
              const showHide = isHideable(spec);
              return (
                <div
                  key={item.i}
                  className="flex flex-col min-h-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
                >
                  <WidgetHeader
                    title={spec.title}
                    onHide={showHide ? () => hide(spec.id) : undefined}
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
