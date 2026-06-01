export const ROUTER_TRADE = `Some prose. {"intent":"trade","reason":"buy AAPL"}`;
export const ROUTER_MEAL = `OK\n{"intent":"meal","reason":"food"}`;
export const ROUTER_WEIGHT = `\`\`\`json
{"intent":"weight","reason":"weight value"}
\`\`\``;
export const ROUTER_BATCH = `{"intent":"batch","reason":"two trades"}`;
export const ROUTER_QUESTION = `{"intent":"question","reason":"asking"}`;
export const ROUTER_UNKNOWN = `{"intent":"unknown","reason":"idk"}`;

export const TRADE_PARSED = JSON.stringify({
  asset_type: "us_stock",
  symbol: "AAPL",
  display_name: "Apple",
  side: "buy",
  quantity: 2,
  price: 200,
  currency: "USD",
  note: "",
});

export const MEAL_PARSED = JSON.stringify({
  meal_type: "lunch",
  items: [
    { name: "rice", portion: "1 bowl", calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1 },
    { name: "chicken", portion: "150g", calories: 250, protein_g: 45, carbs_g: 0, fat_g: 6 },
  ],
  totals: { calories: 450, protein_g: 49, carbs_g: 44, fat_g: 7 },
  sources: ["USDA"],
  confidence: "medium",
  notes: "",
});

export const WEIGHT_PARSED = JSON.stringify({
  value: 72.5,
  unit: "kg",
  note: "morning",
});

export const BATCH_PARSED = JSON.stringify({
  entries: [
    {
      kind: "trade",
      payload: {
        asset_type: "crypto", symbol: "BTC", display_name: "Bitcoin",
        side: "buy", quantity: 0.01, price: 70000, currency: "USD", note: "",
      },
    },
    {
      kind: "weight",
      payload: { weight_kg: 72.5, note: "" },
    },
  ],
});
