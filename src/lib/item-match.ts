import type { DiscoverBusiness } from "./discover-types";

// Item search Phase 1 (item-search-phases.md): the one place the item-name
// match rule and the price text live. Relative import and `import type` only,
// so this runs under plain `tsx` with no Vite env, same as directions.ts.

type Item = DiscoverBusiness["items"][number];

// Same text the business page prints. `!= null`, not truthiness, so 0 prints.
export function formatItemPrice(price: number | null): string {
  return price != null ? `₱${price}` : "No price listed";
}

// Lowest priced item whose name contains the query. Unpriced wins only when
// nothing else matches. Strict `<` keeps the first item on a tie.
export function matchingItem(business: Pick<DiscoverBusiness, "items">, query: string): Item | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let best: Item | null = null;
  for (const item of business.items) {
    if (!item.name.toLowerCase().includes(q)) continue;
    if (!best || (item.price != null && (best.price == null || item.price < best.price))) best = item;
  }
  return best;
}

// Same Node-only guard and assert-check pattern as directions.ts.
// Run with: npx tsx src/lib/item-match.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  const biz = (...items: Item[]) => ({ items });

  assertEqual(matchingItem(biz({ name: "Adobo", price: 50 }), ""), null, "empty query");
  assertEqual(matchingItem(biz({ name: "Adobo", price: 50 }), "   "), null, "blank query");
  assertEqual(matchingItem(biz({ name: "Adobo", price: 50 }), "sinigang"), null, "no match");
  assertEqual(matchingItem(biz({ name: "Chicken Adobo", price: 50 }), "  ADOBO ")?.name, "Chicken Adobo", "case and trim");

  const cheapest = matchingItem(
    biz({ name: "Adobo A", price: 80 }, { name: "Adobo B", price: 0 }, { name: "Adobo C", price: 20 }),
    "adobo",
  );
  assertEqual(cheapest?.name, "Adobo B", "lowest price wins, 0 counts");

  const pricedOverUnpriced = matchingItem(biz({ name: "Adobo A", price: null }, { name: "Adobo B", price: 90 }), "adobo");
  assertEqual(pricedOverUnpriced?.name, "Adobo B", "priced beats earlier unpriced");

  const soleUnpriced = matchingItem(biz({ name: "Adobo A", price: null }, { name: "Rice", price: 10 }), "adobo");
  assertEqual(soleUnpriced?.name, "Adobo A", "unpriced returned when sole match");

  const tie = matchingItem(biz({ name: "Adobo A", price: 40 }, { name: "Adobo B", price: 40 }), "adobo");
  assertEqual(tie?.name, "Adobo A", "tie keeps first");

  assertEqual(formatItemPrice(null), "No price listed", "null price");
  assertEqual(formatItemPrice(0), "₱0", "zero price");
  assertEqual(formatItemPrice(12.5), "₱12.5", "decimal price");

  console.log("item-match.ts demo: all checks passed");
}

// Same Node-only guard as directions.ts: `process` doesn't exist in the Vite
// browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
