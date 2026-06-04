// Local known-foods table for branded SKUs Harry eats often.
// Hits return instantly with the correct label numbers; misses fall through to the LLM.
//
// To add a new item: drop in below with a few aliases (lowercased substrings to match).
// Numbers should come from the official brand label / nutrition panel.

export type KnownFood = {
  id: string;
  display_name: string;
  portion: string;
  // per the portion above
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // any of these substrings (lowercased) appearing in the user's text => match
  aliases: string[];
  source: string;
};

export const KNOWN_FOODS: KnownFood[] = [
  {
    id: "711-muscle-protein-meal",
    display_name: "7-11 增肌蛋白餐",
    portion: "1 份",
    calories: 595,
    protein_g: 45,
    carbs_g: 60,
    fat_g: 18,
    aliases: [
      "711 - 增肌蛋白餐",
      "711-增肌蛋白餐",
      "711 增肌蛋白餐",
      "7-11 增肌蛋白餐",
      "7-11增肌蛋白餐",
      "增肌蛋白餐",
    ],
    source: "7-11 商品標示 (Harry-verified)",
  },
  {
    id: "711-black-truffle-chicken-breast",
    display_name: "7-11 黑金松露雞胸肉",
    portion: "1 個 (約 110g)",
    calories: 146,
    protein_g: 26,
    carbs_g: 2,
    fat_g: 3,
    aliases: [
      "711 - 黑金松露雞胸肉",
      "711-黑金松露雞胸肉",
      "711 黑金松露雞胸肉",
      "7-11 黑金松露雞胸肉",
      "7-11黑金松露雞胸肉",
      "黑金松露雞胸肉",
    ],
    source: "7-11 商品標示 (Harry-verified)",
  },
];

export type KnownFoodHit = {
  item: KnownFood;
  matched_alias: string;
  // multiplier from user-stated quantity, e.g. "2 份" -> 2. Defaults to 1.
  quantity: number;
};

// Try to match each comma/、separated chunk against the known table.
// Returns { hits, leftover } — leftover is the residual text the LLM should still parse.
export function matchKnownFoods(text: string): { hits: KnownFoodHit[]; leftover: string } {
  const hits: KnownFoodHit[] = [];
  // Split on commas (both ASCII and CJK) so we can match each item independently and
  // pass un-matched items through to the LLM.
  const chunks = text.split(/[,，、]+/g).map((s) => s.trim()).filter(Boolean);
  const leftoverChunks: string[] = [];

  for (const chunk of chunks) {
    const lower = chunk.toLowerCase();
    let matched: { item: KnownFood; alias: string } | null = null;
    for (const food of KNOWN_FOODS) {
      for (const alias of food.aliases) {
        if (lower.includes(alias.toLowerCase())) {
          matched = { item: food, alias };
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      leftoverChunks.push(chunk);
      continue;
    }
    // pull a quantity multiplier like "2 份" / "x2" / "*3" out of the chunk
    let qty = 1;
    const qm =
      chunk.match(/(\d+(?:\.\d+)?)\s*(份|個|盒|碗|杯|包)/) ||
      chunk.match(/[x*×](\d+(?:\.\d+)?)/i);
    if (qm) qty = parseFloat(qm[1]) || 1;
    hits.push({ item: matched.item, matched_alias: matched.alias, quantity: qty });
  }

  return { hits, leftover: leftoverChunks.join(", ") };
}

export function hitToMealItem(hit: KnownFoodHit) {
  const q = hit.quantity;
  return {
    name: hit.item.display_name,
    portion: q === 1 ? hit.item.portion : `${q} × ${hit.item.portion}`,
    calories: Math.round(hit.item.calories * q),
    protein_g: Math.round(hit.item.protein_g * q),
    carbs_g: Math.round(hit.item.carbs_g * q),
    fat_g: Math.round(hit.item.fat_g * q),
  };
}
