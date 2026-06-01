// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// recharts uses ResizeObserver which jsdom doesn't ship.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = RO;

// Stub recharts to avoid SVG/layout in jsdom.
vi.mock("recharts", () => {
  const Stub = ({ children }: any) => <div data-recharts>{children}</div>;
  return new Proxy(
    {},
    { get: () => Stub },
  );
});

import Home from "@/app/page";

const portfolio = {
  positions: [],
  totals: { market_value_usd: 1000, cost_usd: 800, pnl_usd: 200, pnl_pct: 25 },
  fx: { usd_twd: 32 },
  trade_count: 0,
};
const nutrition = {
  day: "2026-06-01",
  meals: [],
  totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  goals: { calories: 2500, protein_g: 180, carbs_g: 250, fat_g: 80 },
};
const weights = {
  range_days: 30,
  rows: [],
  moving_avg_7d: [],
  stats: { count: 0, latest_kg: null, latest_ts: null, earliest_kg: null, delta_kg: null, min_kg: null, max_kg: null },
};
const recurring = {
  job: { name: "x", schedule: "24h", action: "x", source: "USDC", target: "BTC", amountPerRun: 8 },
  runs: 0, last_run_ts: null, next_run_ts: null, totalBtc: 0, totalUsdSpent: 0,
  avgCost: null, currentPrice: null, marketValue: null, pnl: null, pnlPct: null, history: [],
};
const stats = { cashflow: { in: 0, out: 0, net: 0 }, streaks: { meals: 0, weights: 0 }, today_ymd: "2026-06-01" };

beforeEach(() => {
  localStorage.clear();
  const fakeFetch = vi.fn(async (url: string, _init?: any) => {
    const body = url.startsWith("/api/portfolio") ? portfolio
      : url.startsWith("/api/nutrition") ? nutrition
      : url.startsWith("/api/weights") ? weights
      : url.startsWith("/api/recurring") ? recurring
      : url.startsWith("/api/stats") ? stats
      : url.startsWith("/api/log/commit") ? { ok: true, ids: [1] }
      : url.startsWith("/api/log") ? { ok: true, pending: { type: "trade", parsed: {} } }
      : url.startsWith("/api/goals") ? { ok: true }
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  (globalThis as any).fetch = fakeFetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("<Home /> page", () => {
  it("loads portfolio + renders USD/TWD toggle", async () => {
    await act(async () => { render(<Home />); });
    await waitFor(() => {
      expect((globalThis as any).fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/portfolio$/));
    });
    // toggle buttons
    expect(screen.getByText("TWD")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
  });

  it("toggling currency persists to localStorage", async () => {
    await act(async () => { render(<Home />); });
    await waitFor(() => screen.getByText("USD"));
    await act(async () => { screen.getByText("USD").click(); });
    expect(localStorage.getItem("displayCcy")).toBe("USD");
  });

  it("renders the four-card portfolio header (Market Value / P&L etc.)", async () => {
    await act(async () => { render(<Home />); });
    await waitFor(() => {
      // FlipNumber breaks chars into nested spans, so we test via container.textContent
      const t = document.body.textContent || "";
      expect(t).toMatch(/Market Value|Total|P&L|Portfolio/i);
    });
  });
});
