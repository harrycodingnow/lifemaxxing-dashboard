# Lifemaxxing Dashboard

Personal all-in-one dashboard for tracking investments (TW stocks, US stocks, crypto) and daily nutrition + body weight — all from a single natural-language chat input parsed by a local Hermes Agent.

Instead of forms, just type:

- `bought 2 shares TSMC at NT$945`
- `lunch: 100g chicken breast, one bowl of rice`
- `weight 77.4kg`
- `bought 0.1 ETH at $3200 and breakfast: 3 eggs and oatmeal` (batch)

Hermes routes the intent, looks up tickers / nutrition data, and shows a confirm modal before writing.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- SQLite via `better-sqlite3` (`data/lifemaxx.db`)
- Local Hermes CLI invoked from API routes (`hermes -z "..." --yolo`)
- Recharts for the weight chart
- DCA cron via Hermes cronjob → script at `~/.hermes/scripts/lifemaxx_dca_usdc_btc.sh`

## Run

```bash
npm install
npm run dev
```

Opens at <http://localhost:3000>. Requires `hermes` CLI on PATH.

## Layout

Single-viewport, no scroll:

- Row 1: Portfolio totals + TW / US / Crypto / DCA KPIs
- Row 2: TW Stocks · US Stocks · Crypto holdings
- Row 3: Nutrition (kcal / P / C / F vs goals) · Weight chart
- Row 4: Pill input bar

## API

- `POST /api/log` — parse a message (returns `{kind, payload, needsConfirm}`)
- `POST /api/log/commit` — write the parsed entry (handles single + batch)
- `GET  /api/portfolio` — positions with live prices
- `GET  /api/nutrition` — today's meals + totals
- `GET  /api/weights?days=N` — weigh-ins + 7d moving avg
- `GET  /api/recurring` — DCA job summary
