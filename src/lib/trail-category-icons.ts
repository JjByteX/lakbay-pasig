import { Footprints, Utensils, Palette, MapPin, type LucideIcon } from "lucide-react";

/**
 * Category Directory, Phase 1.6. Fixed picker list for trail_categories
 * (migration 0023), same reasoning as place-category-icons.ts: the
 * shortlist itself changing needs a code change either way, so a second
 * admin surface to manage it adds a layer with no real flexibility gain.
 *
 * Confirmed directly: icons may repeat across tables (place, trail, event
 * categories are separate pickers, never shown together), so palette here
 * matching Places' Cultural Site, and footprints here matching
 * Announcements' Heritage Walk, are both intentional reuse, not a
 * collision.
 */
export interface IconOption {
  value: string;
  label: string;
  component: LucideIcon;
}

export const TRAIL_CATEGORY_ICONS: IconOption[] = [
  { value: "footprints", label: "Heritage Walk", component: Footprints },
  { value: "utensils", label: "Food Crawl", component: Utensils },
  { value: "palette", label: "Cultural Tour", component: Palette },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TRAIL_CATEGORY_ICONS.map((option) => [option.value, option.component])
);

/**
 * Looks up a stored icon name (trail_categories.icon) back to its Lucide
 * component. Falls back to MapPin, same neutral default migration 0023
 * seeded every row with, if a stored value doesn't match the current
 * shortlist.
 */
export function getTrailCategoryIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? MapPin;
}
