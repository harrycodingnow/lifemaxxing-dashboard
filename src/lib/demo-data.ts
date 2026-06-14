"use client";

// Demo / mock-data mode for screenshots.
//
// When enabled, a fetch interceptor short-circuits GET /api/* requests and
// returns rich, realistic mock data — WITHOUT touching the real SQLite DB.
// Mutations (POST/PATCH/DELETE) are swallowed (return a fake-ok) so clicking
// around in demo mode never writes anything. Toggle off to restore real data.
//
// State lives in localStorage("demoMode") and a custom "demomodechange" event
// lets the page re-fetch when it flips.

export const DEMO_LS_KEY = "demoMode";
export const DEMO_EVENT = "demomodechange";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEMO_LS_KEY) === "1";
}

export function setDemoMode(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_LS_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail: on }));
}

// ── helpers ───────────────────────────────────────────────────────────────
const DAY = 86400_000;
const now = () => Date.now();
const daysAgo = (n: number) => now() - n * DAY;
const ymd = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const todayYmd = () => ymd(now());

// ── mock builders ───────────────────────────────────────────────────────────

function mockPortfolio() {
  const positions = [
    { asset_type: "tw_stock", symbol: "2330.TW", display_name: "TSMC", currency: "TWD", quantity: 50, avg_cost: 880, current_price: 1045, change_pct_today: 1.8, market_value_native: 52250, pnl_native: 8250, pnl_pct: 18.75, market_value_usd: 1632, cost_usd: 1375 },
    { asset_type: "tw_stock", symbol: "0050.TW", display_name: "元大台灣50", currency: "TWD", quantity: 200, avg_cost: 142, current_price: 188, change_pct_today: 0.6, market_value_native: 37600, pnl_native: 9200, pnl_pct: 32.4, market_value_usd: 1175, cost_usd: 887 },
    { asset_type: "us_stock", symbol: "NVDA", display_name: "NVIDIA", currency: "USD", quantity: 8, avg_cost: 720, current_price: 1180, change_pct_today: 2.4, market_value_native: 9440, pnl_native: 3680, pnl_pct: 63.9, market_value_usd: 9440, cost_usd: 5760 },
    { asset_type: "us_stock", symbol: "AAPL", display_name: "Apple", currency: "USD", quantity: 15, avg_cost: 178, current_price: 228, change_pct_today: -0.7, market_value_native: 3420, pnl_native: 750, pnl_pct: 28.1, market_value_usd: 3420, cost_usd: 2670 },
    { asset_type: "crypto", symbol: "BTC", display_name: "Bitcoin", currency: "USD", quantity: 0.18, avg_cost: 61000, current_price: 94500, change_pct_today: 3.1, market_value_native: 17010, pnl_native: 6030, pnl_pct: 54.9, market_value_usd: 17010, cost_usd: 10980 },
    { asset_type: "crypto", symbol: "ETH", display_name: "Ethereum", currency: "USD", quantity: 2.5, avg_cost: 2800, current_price: 3450, change_pct_today: 1.2, market_value_native: 8625, pnl_native: 1625, pnl_pct: 23.2, market_value_usd: 8625, cost_usd: 7000 },
  ];
  const market = positions.reduce((s, p) => s + (p.market_value_usd || 0), 0);
  const cost = positions.reduce((s, p) => s + p.cost_usd, 0);
  return {
    positions,
    totals: { market_value_usd: market, cost_usd: cost, pnl_usd: market - cost, pnl_pct: ((market - cost) / cost) * 100 },
    fx: { usd_twd: 32 },
    trade_count: 42,
  };
}

function mockNutrition(day: string) {
  const meals = [
    { id: 1, ts: daysAgo(0) + 8 * 3600_000, description: "蛋餅 + 無糖豆漿", meal_type: "breakfast", calories: 420, protein_g: 22, carbs_g: 48, fat_g: 14, items: [{ name: "蛋餅", portion: "1 份", calories: 300, protein_g: 12, carbs_g: 32, fat_g: 11 }, { name: "無糖豆漿", portion: "1 杯", calories: 120, protein_g: 10, carbs_g: 16, fat_g: 3 }], sources: ["known-foods"] },
    { id: 2, ts: daysAgo(0) + 13 * 3600_000, description: "7-11 增肌蛋白餐", meal_type: "lunch", calories: 595, protein_g: 45, carbs_g: 60, fat_g: 18, items: [{ name: "增肌蛋白餐", portion: "1 盒", calories: 595, protein_g: 45, carbs_g: 60, fat_g: 18 }], sources: ["7-11"] },
    { id: 3, ts: daysAgo(0) + 16 * 3600_000, description: "Louisa 乳清 + 香蕉", meal_type: "snack", calories: 360, protein_g: 30, carbs_g: 42, fat_g: 6, items: [{ name: "乳清蛋白", portion: "1 杯", calories: 200, protein_g: 28, carbs_g: 12, fat_g: 3 }, { name: "香蕉", portion: "1 根", calories: 160, protein_g: 2, carbs_g: 30, fat_g: 3 }], sources: ["estimate"] },
    { id: 4, ts: daysAgo(0) + 20 * 3600_000, description: "雞胸肉 + 糙米 + 花椰菜", meal_type: "dinner", calories: 620, protein_g: 58, carbs_g: 55, fat_g: 16, items: [{ name: "雞胸肉", portion: "200g", calories: 330, protein_g: 50, carbs_g: 0, fat_g: 8 }, { name: "糙米飯", portion: "1 碗", calories: 220, protein_g: 5, carbs_g: 46, fat_g: 2 }, { name: "花椰菜", portion: "1 份", calories: 70, protein_g: 3, carbs_g: 9, fat_g: 6 }], sources: ["estimate"] },
  ];
  const totals = meals.reduce((a, m) => ({ calories: a.calories + m.calories, protein_g: a.protein_g + m.protein_g, carbs_g: a.carbs_g + m.carbs_g, fat_g: a.fat_g + m.fat_g }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  return { day, meals, totals, goals: { calories: 2200, protein_g: 160, carbs_g: 240, fat_g: 70 } };
}

function mockWeights(rangeDays: number) {
  // Gentle downward trend 74.8 → 72.6 over the window with daily-ish readings.
  const rows: Array<{ id: number; ts: number; weight_kg: number; note: string | null }> = [];
  const points = Math.min(rangeDays, 60);
  for (let i = points; i >= 0; i -= 2) {
    const t = daysAgo(i);
    const base = 72.6 + (i / points) * 2.2;
    const jitter = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 0.18;
    rows.push({ id: points - i + 1, ts: t, weight_kg: +(base + jitter).toFixed(1), note: null });
  }
  const ma = rows.map((r, idx) => {
    const slice = rows.slice(Math.max(0, idx - 3), idx + 1);
    return { ts: r.ts, weight_kg: +(slice.reduce((s, x) => s + x.weight_kg, 0) / slice.length).toFixed(2) };
  });
  const w = rows.map((r) => r.weight_kg);
  const latest = rows[rows.length - 1], earliest = rows[0];
  return {
    range_days: rangeDays,
    rows,
    moving_avg_7d: ma,
    stats: { count: rows.length, latest_kg: latest.weight_kg, latest_ts: latest.ts, earliest_kg: earliest.weight_kg, delta_kg: +(latest.weight_kg - earliest.weight_kg).toFixed(1), min_kg: Math.min(...w), max_kg: Math.max(...w) },
  };
}

function mockRecurring() {
  const history = Array.from({ length: 7 }, (_, i) => ({ ts: Math.floor(daysAgo(6 - i) / 1000), btc: 0.0001, price: 90000 + i * 800, usd: 8 }));
  const totalBtc = 0.0218, spent = 1240, price = 94500;
  const mv = totalBtc * price;
  return {
    job: { name: "lifemaxx-dca-usdc-btc", schedule: "every 24h", action: "Convert 8 USDC → BTC daily", source: "USDC", target: "BTC", amountPerRun: 8 },
    runs: 155, last_run_ts: daysAgo(0), next_run_ts: now() + 9 * 3600_000,
    totalBtc, totalUsdSpent: spent, avgCost: spent / totalBtc, currentPrice: price,
    marketValue: mv, pnl: mv - spent, pnlPct: ((mv - spent) / spent) * 100, history,
  };
}

function mockStats() {
  return {
    window_days: 1,
    cashflow: { buys_usd: 320, sells_usd: 0, net_usd: 320, trade_count: 3, fx_used: 32 },
    streaks: { meal_log: 12, protein_goal: 5, protein_hit_last_7: 6, dca: 22, weigh_in: 8 },
    today_ymd: todayYmd(),
  };
}

function mockNetworth() {
  // portfolio≈41k USD, cash, debts → all in USD then ×32 for TWD
  const portfolioUsd = 41302;
  const cashUsd = 18750; // 500k TWD + 3000 USD
  const liabUsd = 9375;  // 300k TWD
  const netUsd = portfolioUsd + cashUsd - liabUsd;
  const x = (u: number) => ({ usd: u, twd: u * 32 });
  return {
    fx: { usd_twd: 32 },
    portfolio_ok: true,
    components: { portfolio: x(portfolioUsd), cash: x(cashUsd), liabilities: x(liabUsd) },
    net_worth: x(netUsd),
    counts: { cash: 3, liabilities: 2 },
  };
}

function mockSubscriptions() {
  const rows = [
    { id: 1, name: "Netflix", amount: 390, currency: "TWD", cycle: "monthly", next_charge_ts: now() + 2 * DAY, url: "https://netflix.com/account", notes: null, archived_at: null },
    { id: 2, name: "Spotify", amount: 149, currency: "TWD", cycle: "monthly", next_charge_ts: now() + 11 * DAY, url: null, notes: null, archived_at: null },
    { id: 3, name: "iCloud+ 200GB", amount: 90, currency: "TWD", cycle: "monthly", next_charge_ts: now() + 18 * DAY, url: null, notes: null, archived_at: null },
    { id: 4, name: "ChatGPT Plus", amount: 20, currency: "USD", cycle: "monthly", next_charge_ts: now() + 6 * DAY, url: null, notes: null, archived_at: null },
    { id: 5, name: "GitHub Copilot", amount: 100, currency: "USD", cycle: "yearly", next_charge_ts: now() + 120 * DAY, url: null, notes: null, archived_at: null },
    { id: 6, name: "Notion", amount: 96, currency: "USD", cycle: "yearly", next_charge_ts: now() + 60 * DAY, url: null, notes: null, archived_at: null },
  ];
  let twd = 0, usd = 0;
  const mult: Record<string, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
  for (const s of rows) { const m = s.amount * mult[s.cycle]; if (s.currency === "USD") usd += m; else twd += m; }
  return { rows, monthly: { twd, usd }, yearly: { twd: twd * 12, usd: usd * 12 } };
}

function mockHabits() {
  const today = todayYmd();
  const defs = [
    { id: 1, name: "meditate", emoji: "🧘", streak: 12, longest: 28, done_last_7: 7, done_last_30: 26, today_status: "done", total_done: 84 },
    { id: 2, name: "gym", emoji: "🏋️", streak: 3, longest: 14, done_last_7: 4, done_last_30: 18, today_status: "done", total_done: 52 },
    { id: 3, name: "reading", emoji: "📚", streak: 0, longest: 9, done_last_7: 3, done_last_30: 12, today_status: null, total_done: 31 },
    { id: 4, name: "no late-night snack", emoji: "🌙", streak: 5, longest: 11, done_last_7: 5, done_last_30: 20, today_status: "skip", total_done: 40 },
  ];
  return { rows: defs.map((d) => ({ created_ts: daysAgo(90), updated_ts: now(), archived_at: null, sort_order: d.id, ...d })), today_ymd: today };
}

function mockCash() {
  return { rows: [
    { id: 1, name: "Cathay 國泰", balance: 420000, currency: "TWD", kind: "bank", archived_at: null, created_ts: daysAgo(200), updated_ts: now(), sort_order: 1 },
    { id: 2, name: "Cash 現金", balance: 80000, currency: "TWD", kind: "cash", archived_at: null, created_ts: daysAgo(200), updated_ts: now(), sort_order: 2 },
    { id: 3, name: "Wise USD", balance: 3000, currency: "USD", kind: "bank", archived_at: null, created_ts: daysAgo(200), updated_ts: now(), sort_order: 3 },
  ]};
}

function mockLiabilities() {
  return { rows: [
    { id: 1, name: "Student loan 學貸", balance: 240000, currency: "TWD", kind: "loan", archived_at: null, created_ts: daysAgo(400), updated_ts: now(), sort_order: 1 },
    { id: 2, name: "Visa card", balance: 60000, currency: "TWD", kind: "credit_card", archived_at: null, created_ts: daysAgo(30), updated_ts: now(), sort_order: 2 },
  ]};
}

function mockTodos() {
  const t = (id: number, title: string, dueOffsetDays: number | null, priority: number, done = 0) => ({
    id, created_ts: daysAgo(3), updated_ts: now(), title, notes: null,
    due_ts: dueOffsetDays == null ? null : now() + dueOffsetDays * DAY,
    priority, done, done_ts: done ? daysAgo(0) : null, sort_order: id,
  });
  return { rows: [
    t(1, "Ship lifemaxxing demo to GitHub", 1, 3),
    t(2, "Review CrossView PR", 0, 2),
    t(3, "Renew gym membership", 4, 1),
    t(4, "Call mom", -1, 2),
    t(5, "Finish DSP problem set", 2, 2),
    t(6, "Refactor parse pipeline", null, 1, 1),
  ]};
}

function mockHeadlines() {
  const headlines = [
    { title: "NVIDIA tops $1,180 as AI demand stays red-hot", link: "#", source: "Bloomberg", category: "Markets" },
    { title: "Bitcoin reclaims $94K amid record ETF inflows", link: "#", source: "CoinDesk", category: "Markets" },
    { title: "TSMC 2nm yield ahead of schedule, analysts say", link: "#", source: "Reuters", category: "Tech" },
    { title: "Apple unveils on-device LLM for next iOS", link: "#", source: "The Verge", category: "Tech" },
    { title: "OpenAI ships agentic coding model, devs react", link: "#", source: "TechCrunch", category: "Tech" },
    { title: "Inside the new ARM datacenter chip war", link: "#", source: "Ars Technica", category: "Tech" },
    { title: "UN Security Council meets over escalating conflict", link: "#", source: "Al Jazeera", category: "World" },
    { title: "EU agrees landmark AI safety framework", link: "#", source: "BBC", category: "World" },
    { title: "Senate passes spending bill after late-night vote", link: "#", source: "AP", category: "Politics" },
    { title: "Fed signals one more cut before year-end", link: "#", source: "WSJ", category: "Politics" },
    { title: "台積電法說會釋出樂觀展望，股價創高", link: "#", source: "經濟日報", category: "Taiwan" },
    { title: "央行理事會維持利率不變", link: "#", source: "中央社", category: "Taiwan" },
    { title: "台北捷運環狀線南北環段動工", link: "#", source: "UDN", category: "Taiwan" },
    { title: "Startup funding rebounds in Q2, led by AI", link: "#", source: "TechCrunch", category: "Business" },
  ];
  return { headlines, categories: ["Markets", "Tech", "World", "Politics", "Taiwan", "Business"] };
}

function mockNewsSummary(category: string | null) {
  const cat = (category || "").toLowerCase();
  const all = `Markets and AI dominate today, with risk assets broadly higher and SpaceX's debut the marquee event.
• [Markets] Stocks grind higher as a SpaceX IPO and renewed ETF inflows lift sentiment; crypto firms with Bitcoin reclaiming $94K.
• [Tech] AI is the throughline — TSMC's 2nm progress, Apple's on-device LLM, and a fresh OpenAI agentic coding model keep chips and models in focus.
• [World] Diplomacy in the spotlight as the UN Security Council convenes and the EU advances a landmark AI-safety framework.
• [Politics] Washington stays busy — a late-night spending-bill vote and continued Fed easing signals.
• [Taiwan] Local politics heat up around the 監察院 debate while the central bank holds rates steady.`;
  const byCat: Record<string, string> = {
    taiwan: `Taiwan's day skews political with a steady macro backdrop.
• [Taiwan] The 監察院 (Control Yuan) reform debate draws sharp cross-party reactions and dominates domestic coverage.
• [Taiwan] The central bank held interest rates unchanged, signaling a wait-and-see stance.
• [Taiwan] Infrastructure moves forward as the Taipei MRT circular-line segment breaks ground.`,
    markets: `Risk-on tone across markets, led by tech and crypto.
• [Markets] A high-profile SpaceX listing anchors the session amid broad equity gains.
• [Markets] Bitcoin reclaims $94K on record ETF inflows, pulling the wider crypto complex up.`,
    tech: `AI is the clear throughline across today's tech headlines.
• [Tech] Hardware: TSMC's 2nm yields reportedly run ahead of schedule.
• [Tech] Models: Apple debuts an on-device LLM and OpenAI ships an agentic coding model.`,
  };
  return { summary: byCat[cat] || all, cached: false, category: category || null, count: 12 };
}


function mockCalendar() {
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const events = [
    { calendar: "HARRY 🤓", title: "Microsoft Meeting", start_ts: at(0, 8, 30), end_ts: at(0, 9, 30), all_day: false, multi_day: false, location: null },
    { calendar: "HARRY 🤓", title: "Shark Tank Taiwan 錄製", start_ts: at(1, 11, 0), end_ts: at(1, 12, 0), all_day: false, multi_day: false, location: "Taipei" },
    { calendar: "HARRY 🤓", title: "Gym — leg day", start_ts: at(1, 18, 0), end_ts: at(1, 19, 30), all_day: false, multi_day: false, location: null },
    { calendar: "ANNY 🥸", title: "Malta trip", start_ts: at(2, 0, 0), end_ts: at(5, 23, 59), all_day: true, multi_day: true, location: null },
    { calendar: "HARRY 🤓", title: "Dentist", start_ts: at(4, 14, 0), end_ts: at(4, 15, 0), all_day: false, multi_day: false, location: "信義區" },
    { calendar: "ANNY 🥸", title: "Harry Styles concert 🎤", start_ts: at(12, 19, 30), end_ts: at(12, 23, 0), all_day: false, multi_day: false, location: "Kaohsiung Arena" },
  ].map((e) => ({ ...e, start: new Date(e.start_ts).toString(), end: new Date(e.end_ts).toString() }));
  return { available: true, calendars: ["HARRY 🤓", "ANNY 🥸"], days: 14, events, count: events.length };
}

function mockSpotify() {
  // Realistic now-playing for screenshots. Uses a stable Cover Art Archive image
  // (Daft Punk — Random Access Memories) so the CD shows real album art.
  const duration = 337_000; // "Instant Crush" ~5:37
  const progress = Math.floor((Date.now() / 1000) % (duration / 1000)) * 1000; // creeps forward
  return {
    configured: true,
    connected: true,
    now: {
      is_playing: true,
      track: "Instant Crush (feat. Julian Casablancas)",
      artists: "Daft Punk, Julian Casablancas",
      album: "Random Access Memories",
      album_art: "https://coverartarchive.org/release/f6758afb-ecff-410e-8979-b131cfa3c6d3/front-500",
      progress_ms: progress,
      duration_ms: duration,
      track_url: "https://open.spotify.com/track/2cGxRwrMyEAp8dEbuZaVv6",
    },
  };
}

function mockWeather() {
  const day = (date: string, emoji: string, label: string, mx: number, mn: number, pop: number, code = 2) => ({
    date, code, label, emoji, t_max: mx, t_min: mn, precip_prob: pop,
  });
  const d = (offset: number) => {
    const x = new Date();
    x.setDate(x.getDate() + offset);
    return x.toISOString().slice(0, 10);
  };
  // Plausible-looking precip arc over 24h: dry overnight, ramping up to a
  // 60% peak around 15:00, easing back down.
  const today = d(0);
  const popCurve = [10, 10, 5, 5, 5, 5, 10, 15, 20, 25, 30, 35, 45, 55, 60, 60, 55, 45, 35, 25, 20, 15, 10, 10];
  const tempCurve = [25, 24, 24, 23, 23, 24, 25, 26, 27, 28, 29, 29, 30, 30, 30, 29, 29, 28, 27, 26, 26, 25, 25, 24];
  const hourly = popCurve.map((pop, h) => ({
    iso: `${today}T${String(h).padStart(2, "0")}:00`,
    hour: h,
    temp: tempCurve[h],
    precip_prob: pop,
  }));
  return {
    available: true,
    location: "Taipei, Taiwan",
    latitude: 25.05,
    longitude: 121.53,
    timezone: "Asia/Taipei",
    current: { temp: 28, feels_like: 31, code: 2, label: "Partly cloudy", emoji: "⛅", humidity: 74, wind: 12, is_day: true },
    today: { date: today, t_max: 30, t_min: 24, max_precip_prob: 60, hourly },
    daily: [
      day(d(0), "⛅", "Partly cloudy", 30, 24, 20),
      day(d(1), "🌦️", "Light showers", 28, 23, 60, 80),
      day(d(2), "🌧️", "Rain", 26, 23, 90, 65),
      day(d(3), "🌤️", "Mainly clear", 31, 24, 10, 1),
      day(d(4), "☀️", "Clear", 32, 25, 5, 0),
    ],
  };
}

function mockReviewDigest() {
  return {
    window_days: 7,
    trades: { count: 5, buys: 4, sells: 1, items: [] },
    nutrition: { meals_logged: 24, days_logged: 7, avg_calories_per_logged_day: 2080, avg_protein_per_logged_day: 158 },
    weight: { readings: 4, first_kg: 73.4, last_kg: 72.6, delta_kg: -0.8 },
    todos: { completed: 9, added: 12, still_open: 5, completed_titles: ["Ship v2 parser", "Review CrossView PR", "Gym 3x"] },
    habits: { tracked: 4, done_counts: { meditate: 7, gym: 4, reading: 3, "no late-night snack": 5 } },
  };
}

const DEMO_SUMMARY = `Strong, consistent week — you showed up across the board. 💪
• Logged meals all 7 days, averaging 2,080 kcal / 158g protein — right on your bulk target.
• Meditation streak hit 12 days; gym 4/7.
• Weight down 0.8kg (73.4 → 72.6) — lean recomposition trending well.
• Closed 9 todos and kept DCA running 7/7.
Watch out: reading slipped to 3/7 and you have 5 open todos heading into the weekend.
Next week: protect the morning routine and knock out the demo ship-list early.`;

// Route the request to the right mock payload. Returns undefined if not handled.
function routeMock(pathname: string, search: URLSearchParams): unknown | undefined {
  if (pathname === "/api/portfolio") return mockPortfolio();
  if (pathname === "/api/nutrition") return mockNutrition(search.get("day") || todayYmd());
  if (pathname === "/api/weights") return mockWeights(parseInt(search.get("days") || "90", 10));
  if (pathname === "/api/recurring") return mockRecurring();
  if (pathname === "/api/stats") return mockStats();
  if (pathname === "/api/networth") return mockNetworth();
  if (pathname === "/api/subscriptions") return mockSubscriptions();
  if (pathname === "/api/habits") return mockHabits();
  if (pathname === "/api/cash") return mockCash();
  if (pathname === "/api/liabilities") return mockLiabilities();
  if (pathname === "/api/todos") return mockTodos();
  if (pathname === "/api/headlines") return mockHeadlines();
  if (pathname === "/api/headlines/summary") return mockNewsSummary(search.get("category"));
  if (pathname === "/api/calendar") return mockCalendar();
  if (pathname === "/api/goals") return { goals: { calories: 2200, protein_g: 160, carbs_g: 240, fat_g: 70 }, defaults: {} };
  if (pathname === "/api/spotify/now-playing") return mockSpotify();
  if (pathname === "/api/weather") return mockWeather();
  if (pathname === "/api/review/weekly") {
    return { digest: mockReviewDigest(), summary: search.get("summary") === "0" ? null : DEMO_SUMMARY, summary_error: null };
  }
  return undefined;
}

let installed = false;

// Install a one-time fetch wrapper. It only intervenes when demo mode is ON.
export function installDemoFetch() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      if (isDemoMode()) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const method = (init?.method || (typeof input === "object" && "method" in input ? (input as Request).method : "GET") || "GET").toUpperCase();
        const u = new URL(url, window.location.origin);
        if (u.pathname.startsWith("/api/")) {
          // Swallow writes so demo clicks never hit the real DB.
          if (method !== "GET") {
            return new Response(JSON.stringify({ ok: true, demo: true }), { status: 200, headers: { "content-type": "application/json" } });
          }
          const payload = routeMock(u.pathname, u.searchParams);
          if (payload !== undefined) {
            return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
          }
        }
      }
    } catch {
      /* fall through to real fetch on any interceptor error */
    }
    return realFetch(input as RequestInfo, init);
  };
}
