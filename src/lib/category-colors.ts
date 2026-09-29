/**
 * Category Colors, Phase 2.5. Fixed palette, not a database table, same
 * shape as place-category-icons.ts. A new color is a code change: one
 * --category-<key> token in both :root and .dark in index.css, plus one row
 * here. It must pass 4.5:1 for the glyph and the label in both themes.
 *
 * `value` is what's stored in place_categories.color and
 * business_categories.color (migration 0041). `label` is shown in the admin
 * swatch picker only (tooltip and screen reader name), never stored.
 */
export interface CategoryColorOption {
  value: string;
  label: string;
}

// Ordered by typical use in a tourism map, most common first, so the admin
// swatch picker leads with the colors most categories will want. The use
// case beside each row is a suggestion, not a rule.
export const CATEGORY_COLORS: CategoryColorOption[] = [
  { value: "orange", label: "Orange" }, // food and dining
  { value: "green", label: "Green" }, // parks and nature
  { value: "blue", label: "Blue" }, // landmarks, general (default)
  { value: "red", label: "Red" }, // health, emergency, must-see
  { value: "purple", label: "Purple" }, // arts, culture, museums
  { value: "pink", label: "Pink" }, // shopping, cafes, sweets
  { value: "teal", label: "Teal" }, // water, transport
  { value: "yellow", label: "Yellow" }, // entertainment, nightlife
  { value: "brown", label: "Brown" }, // heritage, markets
  { value: "indigo", label: "Indigo" }, // lodging
  { value: "lime", label: "Lime" }, // sports, recreation
  { value: "slate", label: "Slate" }, // services, government, utilities
];

/** Blue is the brand primary. What a null color reads as, per decision #7. */
export const DEFAULT_CATEGORY_COLOR = "blue";

const COLOR_KEYS = new Set(CATEGORY_COLORS.map((option) => option.value));

/**
 * Resolves a stored color key to a CSS color that follows the theme. A null
 * or unknown key (a legacy row, or a palette entry dropped after a category
 * already used it) falls back to blue rather than an invalid color that
 * would render the marker transparent.
 */
export function categoryColor(key: string | null | undefined): string {
  const safe = key && COLOR_KEYS.has(key) ? key : DEFAULT_CATEGORY_COLOR;
  return `hsl(var(--category-${safe}))`;
}
