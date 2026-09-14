import {
  Landmark,
  Scroll,
  Building2,
  Image,
  Flag,
  Shapes,
  Church,
  Flame,
  Palette,
  Users,
  Home,
  Castle,
  BookOpen,
  Trees,
  Flower2,
  Building,
  Waves,
  Mountain,
  MapPin,
  type LucideIcon,
} from "lucide-react";

/**
 * Place Category Directory, Phase 1.2. Fixed picker list, not a database
 * table: the shortlist itself changing needs a code change and redeploy
 * either way, so a second admin surface to manage it would add a layer
 * with no real flexibility gain. Matches the plan doc's 19-entry table,
 * drawn from Google Maps' own Culture/religious/nature place types
 * narrowed to what fits a heritage/tourism Place per ux-ui-guidelines.md's
 * Principle 2 (use the cognitive map users already have), cross-checked
 * against Pasig's actual sites.
 *
 * `value` is what's stored in place_categories.icon (migration 0022).
 * `label` is shown next to the icon in the admin picker only, never
 * stored, never rendered on the public surface (Discover shows the
 * category's own name, not the icon's label).
 */
export interface IconOption {
  value: string;
  label: string;
  component: LucideIcon;
}

export const CATEGORY_ICONS: IconOption[] = [
  { value: "landmark", label: "Heritage Site", component: Landmark },
  { value: "scroll", label: "Historical Place", component: Scroll },
  { value: "building-2", label: "Museum", component: Building2 },
  { value: "image", label: "Art Gallery", component: Image },
  { value: "flag", label: "Monument", component: Flag },
  { value: "shapes", label: "Sculpture / Public Art", component: Shapes },
  { value: "church", label: "Church", component: Church },
  { value: "flame", label: "Shrine / Temple", component: Flame },
  { value: "palette", label: "Cultural Site", component: Palette },
  { value: "users", label: "Cultural Center", component: Users },
  { value: "home", label: "Ancestral House", component: Home },
  { value: "castle", label: "Castle / Fort", component: Castle },
  { value: "book-open", label: "Library", component: BookOpen },
  { value: "trees", label: "Plaza / Park", component: Trees },
  { value: "flower-2", label: "Garden", component: Flower2 },
  { value: "building", label: "Government / Civic", component: Building },
  { value: "waves", label: "Bridge", component: Waves },
  { value: "mountain", label: "Scenic Spot", component: Mountain },
  { value: "map-pin", label: "Historical Marker", component: MapPin },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICONS.map((option) => [option.value, option.component])
);

/**
 * Looks up a stored icon name (place_categories.icon) back to its Lucide
 * component. Falls back to MapPin, a neutral generic marker, if a stored
 * value ever doesn't match the current shortlist (e.g. the shortlist
 * dropped an entry after a category already used it), rather than
 * throwing and breaking the whole card it renders inside.
 */
export function getCategoryIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? MapPin;
}
