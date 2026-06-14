export const ROUTER_PROMPT = (text: string) => `You are a strict JSON router for a personal finance + nutrition + body-metrics logger.

Classify the user message into exactly ONE intent:
  - "trade"     : a SINGLE stock or crypto buy/sell
  - "meal"      : a SINGLE meal/snack/drink (one eating occasion, possibly with multiple items)
  - "weight"    : a body-weight measurement (e.g. "weight 72.5kg", "今天 73.2 公斤")
  - "todo"      : a task / reminder / to-do item the user wants to remember and do later (e.g. "remind me to call mom tomorrow at 3pm", "todo: pay rent", "明天記得繳水費", "task: refactor parser this week"). Triggers: "remind me to", "remember to", "todo", "task", "提醒我", "記得", "待辦".
  - "subscription" : a RECURRING paid subscription the user wants to track (e.g. "netflix 390/mo", "spotify yearly 1990", "track my icloud subscription 30 twd monthly", "訂閱 youtube premium 179 每月"). Triggers: a service name + a recurring price + a cycle word (monthly/月/mo, yearly/年/yr, weekly/週). NOT a one-off purchase.
  - "habit"     : marking a daily HABIT done or skipped (e.g. "did meditation", "skipped gym", "完成 跑步", "做了冥想", "didn't do reading today"). Triggers: "did X", "done X", "skipped X", "完成", "做了", "沒做". This is about a repeatable daily routine, NOT a one-off task (todo) and NOT a meal.
  - "networth"  : logging a CASH balance or a DEBT/liability for net-worth tracking (e.g. "cathay cash 250000", "bank balance 1.2m", "student loan -50000", "credit card debt 30000", "國泰現金 250000", "車貸 -300000"). Cash = positive asset; a loan/debt/credit-card is a liability (often written with a minus sign or the words loan/debt/貸款/欠).
  - "link"      : the user is saving a URL to read or watch later — a bare URL (YouTube, blog post, article, tweet), optionally with a short note like "watch later", "save this", "稍後看", "晚點讀". If the WHOLE message is essentially just a URL (with maybe a few words of hint), it's a link save. Do NOT classify URLs embedded inside longer log entries (e.g. "bought 5 NVDA, see https://… for context") as link.
  - "batch"     : MULTIPLE separate log entries in one message (e.g. two distinct trades, OR a trade + a meal, OR breakfast + lunch as separate meals). Use this when the user is clearly logging more than one independent thing.
  - "question"  : the user is asking a question, not logging anything
  - "unknown"   : cannot determine

Respond with ONLY a single JSON object on the LAST line, no prose, no markdown fences:
{"intent":"trade|meal|weight|todo|subscription|habit|networth|link|batch|question|unknown","reason":"<one short sentence>"}

User message:
"""${text}"""`;

export const TRADE_PARSE_PROMPT = (text: string) => `Parse this trade log entry into strict JSON. The user may write in English or Chinese.

Output ONLY one JSON object on the last line of your reply, with this exact schema:
{
  "asset_type": "tw_stock" | "us_stock" | "crypto",
  "symbol": "<canonical ticker; for TW stocks use NNNN.TW like 2330.TW; for US use plain ticker like AAPL; for crypto use upper-case ticker like BTC, ETH, SOL>",
  "display_name": "<human readable name e.g. TSMC, Apple, Bitcoin>",
  "side": "buy" | "sell",
  "quantity": <number>,
  "price": <number, price per share/coin in native currency>,
  "currency": "TWD" | "USD",
  "note": "<short note or empty string>"
}

Rules:
- Taiwan tickers: 台積電/TSMC=2330.TW, 鴻海=2317.TW, 聯發科=2454.TW, 0050=0050.TW, etc.
- "NT$", "NTD", "台幣", "塊" => TWD. "$", "USD" => USD. Crypto defaults to USD unless stated.
- If the user says "bought 2 shares of TSMC at NT$945" -> asset_type tw_stock, symbol 2330.TW, qty 2, price 945, currency TWD.
- If quantity is omitted but a total cost is given, set quantity to total/price if both present, otherwise quantity=1.
- Never invent fields. Never wrap in markdown fences.

User entry:
"""${text}"""`;

export const MEAL_RESEARCH_PROMPT = (text: string) => `You are a nutrition research assistant. Estimate calories and macros for the food described below. The user may write English or Chinese.

SPEED RULES (this runs in a user-facing log flow — be FAST):
  - For each item, do AT MOST ONE web_search, and only if the item has an explicit brand (7-11/711, 全家/FamilyMart, 萊爾富, Louisa/路易莎, Starbucks/星巴克, McDonald's/麥當勞, 摩斯, etc.) or a clear packaged SKU name. Skip search entirely for generic foods (白飯, 蛋, 雞胸肉 with no brand) — use your nutrition knowledge.
  - Query format: \`<brand> <product> 熱量\` (one search, take the first credible result with a number — official brand page, 7-11/全家 product page, or blog citing the label). Don't keep searching for a "better" source.
  - Hard ceiling: total web_search calls <= number of branded items, never more.

For each distinct food item, return: portion (with units), calories (kcal), protein (g), carbs (g), fat (g). Then sum totals.

In "sources", list the actual URLs you found via web_search (or the database name for generic fallbacks). If you used web_search, the source MUST be a real URL you read, not "USDA FoodData Central" hand-waved.

Output ONLY one JSON object on the LAST line, no markdown fences, this schema:
{
  "meal_type": "breakfast|lunch|dinner|snack|unknown",
  "items": [
    {"name":"<food>","portion":"<e.g. 100g, 1 bowl, 1 cup>","calories":<num>,"protein_g":<num>,"carbs_g":<num>,"fat_g":<num>}
  ],
  "totals": {"calories":<num>,"protein_g":<num>,"carbs_g":<num>,"fat_g":<num>},
  "sources": ["<source name or URL>", "..."],
  "confidence": "low|medium|high",
  "notes": "<short caveat or empty>"
}

Be realistic. Round to whole numbers. If a portion is ambiguous, assume a typical serving and say so in notes.

User meal entry:
"""${text}"""`;

export const WEIGHT_PARSE_PROMPT = (text: string) => `Parse this body-weight log entry into strict JSON. The user may write English or Chinese, in kg or lb.

Output ONLY one JSON object on the LAST line, no markdown fences, schema:
{
  "value": <number, weight as the user wrote it>,
  "unit": "kg" | "lb",
  "note": "<short note or empty string>"
}

Rules:
- Chinese 公斤/kg/千克 -> "kg". 磅/lb/lbs/pounds -> "lb".
- If no explicit unit and value is between 30 and 200 (with optional decimals), assume "kg".
- If no explicit unit and value is between 200 and 400, assume "lb".
- Any extra context like "this morning", "after workout", "起床" goes into note.

User entry:
"""${text}"""`;

export const TODO_PARSE_PROMPT = (text: string, nowIso: string) => `Parse this todo / reminder into strict JSON. The user may write in English or Chinese.

Current local datetime (for resolving "tomorrow", "next Mon", "in 2 hours"): ${nowIso}

Output ONLY one JSON object on the LAST line, no markdown fences, schema:
{
  "title": "<short imperative task title; strip filler like 'remind me to', '提醒我' but keep the verb>",
  "notes": "<longer detail or empty string>",
  "due_iso": "<ISO 8601 local datetime like 2026-06-04T15:00 OR empty string if no due date>",
  "priority": 0
}

Rules:
- "remind me to call mom tomorrow at 3pm" -> title="call mom", due_iso="<tomorrow's date>T15:00", priority=0.
- "todo: refactor parser this week" -> title="refactor parser", notes="this week" (or empty), due_iso="".
- "明天記得繳水費" -> title="繳水費", due_iso="<tomorrow's date>T09:00" (default 09:00 for date-only).
- Priority: explicit "high"/"urgent"/"!high"/緊急/重要 -> 3. "medium"/"!med" -> 2. "low"/"!low" -> 1. Otherwise 0.
- Date-only ("tomorrow", "Friday", "next Mon") with no time -> append "T09:00".
- If absolutely no time reference, set due_iso to "".
- Never wrap output in markdown fences. Never invent fields.

User entry:
"""${text}"""`;

export const BATCH_PARSE_PROMPT = (text: string) => `The user is logging MULTIPLE separate entries in one message (some mix of stock/crypto trades, meals, and possibly a body weight). Split the message into independent entries and parse each one.

Output ONLY one JSON object on the LAST line, no markdown fences, this exact schema:
{
  "entries": [
    {
      "kind": "trade",
      "payload": {
        "asset_type": "tw_stock"|"us_stock"|"crypto",
        "symbol": "<canonical ticker; TW=NNNN.TW, US=plain ticker, crypto=upper symbol>",
        "display_name": "<human readable>",
        "side": "buy"|"sell",
        "quantity": <number>,
        "price": <number, native ccy per share/coin>,
        "currency": "TWD"|"USD",
        "note": "<short or empty>"
      }
    },
    {
      "kind": "meal",
      "raw": "<the original substring describing this meal>",
      "payload": {
        "meal_type": "breakfast|lunch|dinner|snack|unknown",
        "items": [{"name":"<food>","portion":"<e.g. 100g>","calories":<num>,"protein_g":<num>,"carbs_g":<num>,"fat_g":<num>}],
        "totals": {"calories":<num>,"protein_g":<num>,"carbs_g":<num>,"fat_g":<num>},
        "sources": ["<source>"],
        "confidence": "low|medium|high",
        "notes": "<short or empty>"
      }
    },
    {
      "kind": "weight",
      "payload": {"weight_kg": <number, normalized to kg>, "note": "<short or empty>"}
    }
  ]
}

Rules:
- TW tickers: 台積電/TSMC=2330.TW, 鴻海=2317.TW, 聯發科=2454.TW, 0050=0050.TW.
- "NT$"/"NTD"/台幣/塊 => TWD. "$"/USD => USD. Crypto defaults to USD.
- Each meal is ONE eating occasion. If the user lists two clearly separate meals (e.g. "breakfast: X. lunch: Y."), emit two meal entries.
- Each trade is ONE buy or sell. Two trades in one sentence => two entries.
- For meals: estimate kcal + macros from your nutrition knowledge. For **branded** items only (7-11/711, 全家, 萊爾富, Louisa, Starbucks, McDonald's, 摩斯, etc. — explicit brand+product like "711 - 增肌蛋白餐"), do AT MOST ONE web_search per branded item with query "<brand> <product> 熱量"; take the first credible number and move on. Skip web_search for generic unbranded foods (白飯, 蛋). Total web_search calls <= number of branded items. Put real URLs in "sources" when used. Round to whole numbers.
- Use kg for weight (convert lb*0.453592 if needed).
- Order entries in the order they appear in the message.
- Never invent fields. Never wrap output in markdown fences.

User message:
"""${text}"""`;

export const SUBSCRIPTION_PARSE_PROMPT = (text: string, nowIso: string) => `Parse this recurring subscription into strict JSON. The user may write English or Chinese.

Current local datetime (for computing the next charge date): ${nowIso}

Output ONLY one JSON object on the LAST line, no markdown fences, schema:
{
  "name": "<service name, e.g. Netflix, Spotify, iCloud, YouTube Premium>",
  "amount": <number, price per billing cycle in native currency>,
  "currency": "TWD" | "USD",
  "cycle": "weekly" | "monthly" | "yearly",
  "next_charge_iso": "<ISO 8601 local date like 2026-07-01 OR empty string if unknown>",
  "url": "<manage/cancel URL or empty string>",
  "notes": "<short note or empty string>"
}

Rules:
- "/mo", "per month", "每月", "monthly", "月費" -> cycle "monthly". "/yr", "yearly", "annually", "每年", "年費" -> "yearly". "weekly", "每週" -> "weekly".
- "NT$"/"NTD"/台幣/塊/元 with no other hint -> TWD. "$"/USD -> USD. Default to TWD if ambiguous (user is in Taiwan).
- If the user gives a renewal/billing day (e.g. "renews on the 1st", "next charge July 1") set next_charge_iso to that date; otherwise leave it "".
- Strip filler like "track my", "訂閱", "subscription" from the name.
- Never invent fields. Never wrap output in markdown fences.

User entry:
"""${text}"""`;

export const HABIT_PARSE_PROMPT = (text: string) => `Parse this habit check-in into strict JSON. The user may write English or Chinese.

Output ONLY one JSON object on the LAST line, no markdown fences, schema:
{
  "name": "<short habit name, e.g. meditation, gym, reading, 跑步>",
  "status": "done" | "skip"
}

Rules:
- "did X", "done X", "finished X", "完成 X", "做了 X" -> status "done", name = X.
- "skipped X", "didn't do X", "missed X", "沒做 X", "跳過 X" -> status "skip", name = X.
- Normalize the name to a short lowercase noun/verb phrase (strip "my", "the", "today", "今天").
- Never invent fields. Never wrap output in markdown fences.

User entry:
"""${text}"""`;

export const NETWORTH_PARSE_PROMPT = (text: string) => `Parse this net-worth balance entry into strict JSON. The user may write English or Chinese. It is EITHER a cash/asset balance OR a debt/liability.

Output ONLY one JSON object on the LAST line, no markdown fences, schema:
{
  "kind": "cash" | "liability",
  "name": "<account or debt name, e.g. Cathay, Bank of America, Student loan, Visa card>",
  "balance": <number, absolute value (positive), in native currency>,
  "currency": "TWD" | "USD",
  "account_kind": "<for cash: cash|bank|brokerage_cash|other ; for liability: loan|credit_card|mortgage|other>"
}

Rules:
- Words loan / debt / owe / credit card / mortgage / 貸款 / 欠 / 卡債 / 房貸 / 車貸, OR a negative number -> kind "liability".
- Words cash / bank / savings / balance / 現金 / 存款 / 餘額, OR a plain positive number -> kind "cash".
- "balance" must be the ABSOLUTE value (always positive) even if the user wrote a minus sign.
- "1.2m"/"1.2M" = 1200000, "250k"/"25萬" -> expand to the full number.
- "NT$"/台幣/元/塊 or no hint -> TWD (user is in Taiwan). "$"/USD -> USD.
- account_kind: 信用卡/credit card -> credit_card; 房貸/mortgage -> mortgage; 車貸/student/personal loan -> loan; 證券/brokerage -> brokerage_cash; 銀行/bank/savings -> bank; otherwise cash (for assets) or other.
- Never invent fields. Never wrap output in markdown fences.

User entry:
"""${text}"""`;

export const WEEKLY_REVIEW_PROMPT = (digestJson: string) => `You are a concise personal-life-review assistant. Below is a JSON digest of the user's last week (trades, nutrition, weight, todos, habits) from their lifemaxxing dashboard.

Write a short, motivating weekly review in PLAIN TEXT (no markdown headers, no code fences). Structure:
1. One opening line summarizing the week's vibe.
2. 3-5 bullet lines (use "•") highlighting concrete wins and numbers (e.g. "• Logged meals 6/7 days, avg 2,100 kcal / 165g protein", "• Completed 4 todos", "• Weight down 0.4kg").
3. One honest "watch out" line if something slipped (missed habit days, no weigh-ins, lots of open todos).
4. One forward-looking line for next week.

Rules:
- Use ONLY the numbers in the digest. Do not invent data. If a section is empty (zero entries), either omit it or gently note the gap.
- Keep it under 140 words. Warm but not cheesy. The user is a busy CS student building startups.
- Output the review text directly — no preamble like "Here is your review".

Weekly digest JSON:
"""
${digestJson}
"""`;

export const NEWS_SUMMARY_PROMPT = (headlinesJson: string) => `You are a sharp, neutral news editor. Below is a JSON array of current headlines (each with title, source, and category) pulled from the user's dashboard news feed.

Write a TIGHT briefing in PLAIN TEXT (no markdown headers, no code fences). Structure:
1. One opening line capturing the day's overall theme (what's dominating the news).
2. 3-5 bullet lines (use "•"), each grouping related headlines into a single insight. Lead the bullet with the category in brackets, e.g. "• [Markets] ...", "• [Taiwan] ...". Synthesize across sources — don't just restate one headline.

Rules:
- Use ONLY information present in the headlines. Do NOT invent facts, numbers, outcomes, or details not in the titles. Headlines are terse, so stay high-level and attribute uncertainty ("reportedly", "amid") rather than fabricating specifics.
- Prioritize the most consequential stories; it's fine to ignore minor ones.
- Keep it under 130 words. Crisp and informative, no editorializing or hot takes.
- Output the briefing text directly — no preamble like "Here is your summary".

Headlines JSON:
"""
${headlinesJson}
"""`;

export const WIDGET_GEN_PROMPT = (request: string) => `You are a front-end engineer generating a SINGLE self-contained dashboard widget as one HTML document. The user described what they want in plain language. Build it.

User request:
"""
${request}
"""

Output requirements — return ONE fenced \`\`\`html code block containing a COMPLETE document:
- Start with <!doctype html>, include <html><head><meta charset> + <style> and <body> with inline <script> as needed. Everything inline — NO external CSS/JS files, NO frameworks, NO CDN <script src> (it runs in a locked-down sandbox with no allow-same-origin, so external scripts and storage are blocked).
- It renders inside a small dark dashboard tile (assume ~320x360px, but make it responsive to any size). Match this dark theme: transparent/near-black background (use \`background: transparent\` on body so the tile shows through), text color #e4e4e7 (zinc-200), muted #a1a1aa, accents are fine. Use system-ui font, 13-14px base. Compact padding (~10px).
- Make it genuinely functional and self-contained. Pure HTML/CSS/JS only. Examples: a pomodoro timer, a countdown to a date, a unit/currency converter with hardcoded rates, a calculator, a markdown scratchpad, a habit dots grid, a breathing-exercise animation, a dice/coin randomizer, a tip splitter, a world-clock for fixed cities computed from the browser clock.
- DATA/NETWORK: You generally have NO network (sandbox blocks it). Do NOT fetch external APIs unless the user explicitly names a known keyless one; default to computing everything client-side from Date.now() and hardcoded constants. If the user asks for live data you can't get, build the UI and use clearly-labeled sample/placeholder values rather than failing.
- Do NOT use localStorage/sessionStorage/cookies (blocked by the sandbox — they throw). Keep state in JS variables only.
- Keep it lightweight and instant. No build step. Must work offline in an <iframe srcdoc> with sandbox="allow-scripts".

Also pick a SHORT title (2-3 words) for the tile header.

Return EXACTLY this shape — a fenced json block with the title, then a fenced html block with the document:
\`\`\`json
{"title": "Pomodoro"}
\`\`\`
\`\`\`html
<!doctype html>
<html>...full document...</html>
\`\`\``;


// ─────────────────────────────────────────────────────────────────────────────
// ASK_PROMPT — natural-language → safe read-only SQL over the lifemaxx DB.
// Hermes returns either an executable SELECT (with optional bound params),
// or a narrative reply when no query fits. The route validates SELECT-only
// before execution; the prompt also tells Hermes the validation rules so it
// doesn't waste a turn generating something that will be rejected.
// `nowIso` is a local-time hint so Hermes can resolve "this week" / "today"
// without seeing the server clock drift.
// ─────────────────────────────────────────────────────────────────────────────
export const ASK_PROMPT = (question: string, nowIso: string) => `You are a strict JSON SQL-generator for a personal life dashboard backed by a single SQLite database.

The user asked a question about their own data. Your job is to translate it into ONE read-only SQL SELECT query that answers it, or — if the question can't be answered from the schema — return a brief narrative reply.

CURRENT LOCAL TIME: ${nowIso}

DATABASE SCHEMA (SQLite — column names are exact):

trades(id INTEGER, ts INTEGER /*epoch ms*/, asset_type TEXT 'tw_stock'|'us_stock'|'crypto', symbol TEXT, display_name TEXT, side TEXT 'buy'|'sell', quantity REAL, price REAL, currency TEXT 'TWD'|'USD', note TEXT, deleted_at INTEGER)
meals(id INTEGER, ts INTEGER, description TEXT, meal_type TEXT 'breakfast'|'lunch'|'dinner'|'snack', calories REAL, protein_g REAL, carbs_g REAL, fat_g REAL, items_json TEXT, sources_json TEXT, deleted_at INTEGER)
weights(id INTEGER, ts INTEGER, weight_kg REAL, note TEXT, deleted_at INTEGER)
todos(id INTEGER, created_ts INTEGER, updated_ts INTEGER, title TEXT, notes TEXT, due_ts INTEGER, priority INTEGER 0..3, done INTEGER 0|1, done_ts INTEGER, sort_order INTEGER, deleted_at INTEGER)
projects(id INTEGER, created_ts INTEGER, updated_ts INTEGER, name TEXT, description TEXT, phase TEXT 'idea'|'planning'|'building'|'shipping'|'maintaining'|'paused'|'done', status TEXT 'on_track'|'at_risk'|'blocked'|'done', current_problem TEXT, next_step TEXT, priority INTEGER 1..3, url TEXT, sort_order INTEGER, archived_at INTEGER)
subscriptions(id INTEGER, created_ts INTEGER, updated_ts INTEGER, name TEXT, amount REAL, currency TEXT, cycle TEXT 'weekly'|'monthly'|'yearly', next_charge_ts INTEGER, url TEXT, notes TEXT, sort_order INTEGER, archived_at INTEGER)
habits(id INTEGER, created_ts INTEGER, updated_ts INTEGER, name TEXT, emoji TEXT, sort_order INTEGER, archived_at INTEGER)
habit_logs(id INTEGER, habit_id INTEGER FK->habits.id, day TEXT 'YYYY-MM-DD' local, status TEXT 'done'|'skip', ts INTEGER)
cash_accounts(id INTEGER, created_ts INTEGER, updated_ts INTEGER, name TEXT, balance REAL, currency TEXT, kind TEXT 'cash'|'bank'|'brokerage_cash'|'other', sort_order INTEGER, archived_at INTEGER)
liabilities(id INTEGER, created_ts INTEGER, updated_ts INTEGER, name TEXT, balance REAL, currency TEXT, kind TEXT 'loan'|'credit_card'|'mortgage'|'other', sort_order INTEGER, archived_at INTEGER)
custom_widgets(id INTEGER, created_ts INTEGER, updated_ts INTEGER, title TEXT, prompt TEXT, html TEXT, w INTEGER, h INTEGER, archived_at INTEGER)

CRITICAL RULES — your SQL is REJECTED if it breaks any:
1. EXACTLY ONE statement. No semicolons except optionally a trailing one.
2. The statement MUST begin with the word SELECT (or WITH ... SELECT). No INSERT, UPDATE, DELETE, REPLACE, DROP, CREATE, ALTER, ATTACH, DETACH, PRAGMA, VACUUM.
3. Use only the tables above. Do NOT touch sqlite_master, sqlite_schema, sqlite_temp_master, pragma_*.
4. ALWAYS exclude soft-deleted rows when the column exists: append "AND deleted_at IS NULL" to the WHERE (trades, meals, weights, todos), or "AND archived_at IS NULL" for projects/subscriptions/habits/cash_accounts/liabilities/custom_widgets.
5. ALWAYS include an explicit LIMIT (≤500). If the user asked a scalar aggregate (count/sum/avg/min/max), LIMIT 1 is fine.
6. Time columns are EPOCH MILLISECONDS (INTEGER). Convert with: ts >= strftime('%s','now','-7 days')*1000 etc. For "today" prefer: date(ts/1000,'unixepoch','localtime') = date('now','localtime'). For "this month": strftime('%Y-%m', ts/1000,'unixepoch','localtime') = strftime('%Y-%m','now','localtime').
7. Use parameter placeholders ? and supply values in params[] only when the user named a SPECIFIC literal (e.g. a symbol like "BTC" or a project name). Otherwise inline numeric/temporal constants. Never inject user text directly into the SQL — bind it.
8. The result set must be HUMAN-READABLE. Use clear AS aliases (e.g. SUM(calories) AS total_kcal). Round floats sensibly (ROUND(..,1)).
9. Don't return enormous text columns (items_json, sources_json, notes, html). Project only the columns the user needs.

OUTPUT — return ONE JSON object on the LAST line, no markdown fences, no prose:

If you can answer with SQL:
{"kind":"sql","sql":"SELECT ...","params":[],"explanation":"<one-sentence English description of what the query returns>","display":"table|scalar|list"}

If the question CAN'T be answered from the schema (out of scope, no relevant data, asking for an opinion):
{"kind":"narrative","narrative":"<short reply explaining what you can or can't answer>"}

Pick "display":"scalar" for single-value aggregates (one row, one column). "list" for a small set of named items. "table" for general row sets. Default to "table" when unsure.

Examples:

Q: "how much did i spend on coffee this month"
{"kind":"sql","sql":"SELECT ROUND(SUM(calories),0) AS total_kcal_coffee, COUNT(*) AS occurrences FROM meals WHERE deleted_at IS NULL AND lower(description) LIKE '%coffee%' AND strftime('%Y-%m', ts/1000,'unixepoch','localtime') = strftime('%Y-%m','now','localtime') LIMIT 1","params":[],"explanation":"Total kcal logged for meals containing 'coffee' this month.","display":"scalar"}

Q: "all my BTC trades"
{"kind":"sql","sql":"SELECT date(ts/1000,'unixepoch','localtime') AS day, side, quantity, price, currency FROM trades WHERE deleted_at IS NULL AND symbol = ? ORDER BY ts DESC LIMIT 100","params":["BTC"],"explanation":"All BTC trades, newest first.","display":"table"}

Q: "what's my longest gym streak this year"
{"kind":"sql","sql":"WITH days AS (SELECT day FROM habit_logs WHERE status='done' AND habit_id IN (SELECT id FROM habits WHERE archived_at IS NULL AND lower(name) = 'gym') AND day >= strftime('%Y','now','localtime') || '-01-01') SELECT COUNT(*) AS streak_days FROM days LIMIT 1","params":[],"explanation":"Number of gym-done days this calendar year (rough proxy for streak).","display":"scalar"}

Q: "what's the meaning of life"
{"kind":"narrative","narrative":"That's outside this dashboard's data — can't answer from your logs."}

User question:
"""${question}"""`;


