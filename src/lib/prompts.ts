export const ROUTER_PROMPT = (text: string) => `You are a strict JSON router for a personal finance + nutrition + body-metrics logger.

Classify the user message into exactly ONE intent:
  - "trade"     : a SINGLE stock or crypto buy/sell
  - "meal"      : a SINGLE meal/snack/drink (one eating occasion, possibly with multiple items)
  - "weight"    : a body-weight measurement (e.g. "weight 72.5kg", "今天 73.2 公斤")
  - "todo"      : a task / reminder / to-do item the user wants to remember and do later (e.g. "remind me to call mom tomorrow at 3pm", "todo: pay rent", "明天記得繳水費", "task: refactor parser this week"). Triggers: "remind me to", "remember to", "todo", "task", "提醒我", "記得", "待辦".
  - "batch"     : MULTIPLE separate log entries in one message (e.g. two distinct trades, OR a trade + a meal, OR breakfast + lunch as separate meals). Use this when the user is clearly logging more than one independent thing.
  - "question"  : the user is asking a question, not logging anything
  - "unknown"   : cannot determine

Respond with ONLY a single JSON object on the LAST line, no prose, no markdown fences:
{"intent":"trade|meal|weight|todo|batch|question|unknown","reason":"<one short sentence>"}

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
