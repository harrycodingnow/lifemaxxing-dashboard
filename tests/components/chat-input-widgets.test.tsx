// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

// jsdom shims for recharts
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div data-recharts>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});

import Home from "@/app/page";

const portfolio = { positions: [], totals: { market_value_usd: 0, cost_usd: 0, pnl_usd: 0, pnl_pct: 0 }, fx: { usd_twd: 32 }, trade_count: 0 };
const nutrition = { day: "2026-06-01", meals: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, goals: { calories: 2500, protein_g: 180, carbs_g: 250, fat_g: 80 } };
const weights = { range_days: 30, rows: [], moving_avg_7d: [], stats: { count: 0, latest_kg: null, latest_ts: null, earliest_kg: null, delta_kg: null, min_kg: null, max_kg: null } };
const stats = { cashflow: { in: 0, out: 0, net: 0 }, streaks: { meals: 0, weights: 0 }, today_ymd: "2026-06-01" };

function installFetch(opts: { logDelayMs?: number; commitResp?: unknown } = {}) {
  const commit = opts.commitResp ?? { ok: true, kind: "trade", id: 42 };
  const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/portfolio")) return new Response(JSON.stringify(portfolio));
    if (url.startsWith("/api/nutrition")) return new Response(JSON.stringify(nutrition));
    if (url.startsWith("/api/weights")) return new Response(JSON.stringify(weights));
    if (url.startsWith("/api/recurring")) return new Response(JSON.stringify(null));
    if (url.startsWith("/api/stats")) return new Response(JSON.stringify(stats));
    if (url.startsWith("/api/log/commit")) return new Response(JSON.stringify(commit));
    if (url.startsWith("/api/log")) {
      if (opts.logDelayMs) await new Promise((r) => setTimeout(r, opts.logDelayMs));
      // Return non-pending so it goes straight to save path
      return new Response(JSON.stringify({ ok: true, kind: "trade", id: 42 }));
    }
    if (init?.method === "DELETE") return new Response(JSON.stringify({ ok: true }));
    return new Response("{}");
  });
  (globalThis as unknown as { fetch: typeof fakeFetch }).fetch = fakeFetch;
  return fakeFetch;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("chat input — rotating placeholder", () => {
  it("rotates the placeholder text after 4s when empty", async () => {
    installFetch();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<Home />); });
    const input = await waitFor(() => screen.getByPlaceholderText(/Log a trade, meal, or weight/i) as HTMLInputElement);
    expect(input.placeholder).toMatch(/Log a trade/);
    await act(async () => { vi.advanceTimersByTime(4100); });
    // Placeholder should have changed to one of the examples
    expect(input.placeholder).not.toMatch(/Log a trade, meal, or weight/);
    expect(input.placeholder.length).toBeGreaterThan(0);
  });
});

describe("chat input — send button shows Parsing… spinner while busy", () => {
  it("renders Parsing… text on the send button during /api/log", async () => {
    installFetch({ logDelayMs: 200 });
    await act(async () => { render(<Home />); });
    const input = await waitFor(() => screen.getByPlaceholderText(/Log a trade/i) as HTMLInputElement);
    await act(async () => { fireEvent.change(input, { target: { value: "bought 1 NVDA @ 880" } }); });
    const sendBtn = screen.getByRole("button", { name: /^send$/i });
    await act(async () => { sendBtn.click(); });
    // While the fetch is in-flight, button should say Parsing…
    expect(screen.getByText(/Parsing…/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Parsing…/)).toBeNull(), { timeout: 2000 });
  });
});

describe("chat input — pinned last-entry pill + undo", () => {
  it("renders the pinned pill after a save and calls DELETE on undo", async () => {
    const fetchMock = installFetch();
    await act(async () => { render(<Home />); });
    const input = await waitFor(() => screen.getByPlaceholderText(/Log a trade/i) as HTMLInputElement);
    await act(async () => { fireEvent.change(input, { target: { value: "bought 2 NVDA @ 880" } }); });
    const sendBtn = screen.getByRole("button", { name: /^send$/i });
    await act(async () => { sendBtn.click(); });
    // Note: /api/log returns final (non-pending) so lastEntry only gets set in confirmPending path.
    // For coverage of the pinned-pill code path we drive setLastEntry via a manual commit path:
    // simulate the confirm pipeline by posting to /api/log/commit directly is overkill — instead
    // assert undoLast wiring renders nothing here, and verify the pill markup is present after
    // we manually trigger it via a needsConfirm response.
    // Simpler: re-install fetch so /api/log returns needsConfirm:
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/portfolio")) return new Response(JSON.stringify(portfolio));
      if (url.startsWith("/api/nutrition")) return new Response(JSON.stringify(nutrition));
      if (url.startsWith("/api/weights")) return new Response(JSON.stringify(weights));
      if (url.startsWith("/api/recurring")) return new Response(JSON.stringify(null));
      if (url.startsWith("/api/stats")) return new Response(JSON.stringify(stats));
      if (url.startsWith("/api/log/commit")) return new Response(JSON.stringify({ ok: true, kind: "trade", id: 42 }));
      if (url.startsWith("/api/log")) return new Response(JSON.stringify({ needsConfirm: true, kind: "trade", preview: "BUY 2 NVDA @ 880", payload: { side: "BUY", symbol: "NVDA", qty: 2, price: 880 } }));
      if (init?.method === "DELETE") return new Response(JSON.stringify({ ok: true }));
      return new Response("{}");
    });
    await act(async () => { fireEvent.change(input, { target: { value: "bought 2 NVDA @ 880" } }); });
    await act(async () => { sendBtn.click(); });
    // Click Confirm in modal
    const confirmBtn = await waitFor(() => screen.getByRole("button", { name: /confirm/i }));
    await act(async () => { confirmBtn.click(); });
    const pill = await waitFor(() => screen.getByTestId("pinned-last-entry"));
    expect(pill.textContent).toMatch(/Last:/);
    expect(pill.textContent).toMatch(/BUY NVDA/);
    // Click undo
    const undoBtn = pill.querySelector("button")!;
    await act(async () => { undoBtn.click(); });
    // Verify DELETE was called
    const calls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((u) => u.startsWith("/api/trades/42"))).toBe(true);
  });
});

describe("chat input — voice dictation", () => {
  it("renders the mic button when SpeechRecognition is available and fills text on result", async () => {
    installFetch();
    type SpeechRec = {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null;
      start: () => void; stop: () => void;
    };
    let inst: SpeechRec | null = null;
    const Ctor = function (this: SpeechRec) {
      this.lang = ""; this.interimResults = false; this.continuous = false;
      this.onresult = null; this.onend = null; this.onerror = null;
      this.start = () => {};
      this.stop = () => {};
      inst = this;
    } as unknown as new () => SpeechRec;
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Ctor;

    await act(async () => { render(<Home />); });
    const mic = await waitFor(() => screen.getByRole("button", { name: /dictate/i }));
    await act(async () => { mic.click(); });
    expect(inst).not.toBeNull();
    // Simulate a transcript result
    await act(async () => { inst!.onresult!({ results: [[{ transcript: "had a louisa shake" }]] }); });
    const input = screen.getByPlaceholderText(/Log a trade|louisa|NVDA|kg|BTC/i) as HTMLInputElement;
    expect(input.value).toBe("had a louisa shake");

    // cleanup
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("hides the mic button when SpeechRecognition is unavailable", async () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    installFetch();
    await act(async () => { render(<Home />); });
    await waitFor(() => screen.getByRole("button", { name: /^send$/i }));
    expect(screen.queryByRole("button", { name: /dictate/i })).toBeNull();
  });
});
