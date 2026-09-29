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

export const CATEGORY_COLORS: CategoryColorOption[] = [
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "green", label: "Green" },
  { value: "teal", label: "Teal" },
  { value: "blue", label: "Blue" },
  { value: "indigo", label: "Indigo" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
  { value: "brown", label: "Brown" },
  { value: "slate", label: "Slate" },
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
