import { Wrench, Confetti, Footprints, ClipboardText, Megaphone, MapPin, type Icon as PhosphorIcon } from "@phosphor-icons/react";

/**
 * Category Directory, Phase 1.9. Fixed picker list for event_categories
 * (migration 0024), same reasoning as place-category-icons.ts and
 * trail-category-icons.ts: the shortlist itself changing needs a code
 * change either way, no second admin surface to manage it.
 *
 * footprints here matches Trails' Heritage Walk icon, confirmed
 * intentional reuse since the two pickers are never shown together.
 */
export interface IconOption {
  value: string;
  label: string;
  component: PhosphorIcon;
}

export const EVENT_CATEGORY_ICONS: IconOption[] = [
  { value: "wrench", label: "Workshop", component: Wrench },
  { value: "party-popper", label: "Festival", component: Confetti },
  { value: "footprints", label: "Heritage Walk", component: Footprints },
  { value: "clipboard-list", label: "Program Enrollment", component: ClipboardText },
  { value: "megaphone", label: "General Announcement", component: Megaphone },
];

const ICON_MAP: Record<string, PhosphorIcon> = Object.fromEntries(
  EVENT_CATEGORY_ICONS.map((option) => [option.value, option.component])
);

/**
 * Looks up a stored icon name (event_categories.icon) back to its Phosphor
 * component. Falls back to MapPin, same neutral default migration 0024
 * seeded every row with, if a stored value doesn't match the current
 * shortlist.
 */
export function getEventCategoryIcon(iconName: string): PhosphorIcon {
  return ICON_MAP[iconName] ?? MapPin;
}
