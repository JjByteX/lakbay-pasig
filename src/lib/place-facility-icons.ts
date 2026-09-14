import { Bath, SquareParking, Info, Armchair, MapPin, type LucideIcon } from "lucide-react";

/**
 * Category Directory Expansion, Phase 1.2. Fixed picker list, not a
 * database table, same reasoning place-category-icons.ts's own file
 * comment gives: the shortlist changing needs a code change and redeploy
 * either way, so a second admin surface to manage it adds a layer with no
 * real flexibility gain. Matches the expansion plan doc's 4-entry table,
 * one icon per facility already seeded in migration 0026.
 *
 * `value` is what's stored in place_facilities.icon. `label` is shown next
 * to the icon in the admin picker only, never stored, never rendered on
 * the public surface (the place detail page shows the facility's own
 * name, not the icon's label, same convention place-category-icons.ts
 * already established).
 */
export interface IconOption {
  value: string;
  label: string;
  component: LucideIcon;
}

export const FACILITY_ICONS: IconOption[] = [
  { value: "bath", label: "Restrooms", component: Bath },
  { value: "square-parking", label: "Parking", component: SquareParking },
  { value: "info", label: "Info Desk", component: Info },
  { value: "armchair", label: "Waiting Area", component: Armchair },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  FACILITY_ICONS.map((option) => [option.value, option.component])
);

/**
 * Looks up a stored icon name (place_facilities.icon) back to its Lucide
 * component. Falls back to MapPin, a neutral generic marker, if a stored
 * value ever doesn't match the current shortlist, rather than throwing
 * and breaking whichever card or chip it renders inside.
 */
export function getFacilityIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? MapPin;
}
