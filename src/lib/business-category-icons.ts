import {
  Utensils,
  Coffee,
  ShoppingBag,
  Bed,
  Gift,
  Briefcase,
  Scissors,
  Croissant,
  Martini,
  ShoppingCart,
  Car,
  Wrench,
  Cross,
  Landmark,
  Store,
  MapPin,
  type LucideIcon,
} from "lucide-react";

/**
 * Category Directory Expansion, Phase 1.6. Fixed picker list, not a
 * database table, same reasoning place-category-icons.ts's own file
 * comment gives. Matches the expansion plan doc's 15-entry table, drawn
 * from general storefront and commercial types, the same commercial POI
 * territory Places' own shortlist deliberately excluded, narrowed the
 * same way.
 *
 * Three intentional repeats against the other four shortlists, all
 * justified by the same rule Trails' and Announcements' own repeated
 * Heritage Walk icon (footprints) and Trails' own repeated Cultural Site
 * icon (palette) already established: no two of these five pickers are
 * ever shown together, so a shared icon value is never seen side by side
 * and is not a real collision. `landmark` repeats Places' own Heritage
 * Site icon (place-category-icons.ts) -- this is the one the expansion
 * plan doc calls out by name. `utensils` (Food and Beverage here) also
 * repeats Trails' own Food Crawl icon, and `wrench` (Repair/Trade here)
 * also repeats Announcements' own Workshop icon (trail-category-icons.ts,
 * event-category-icons.ts) -- both are real repeats the plan doc's "the
 * only repeat" line does not mention, caught on this feature's own Phase
 * 5.5 confirmation pass rather than assumed from the doc. Swapping either
 * for an unused icon would trade a strictly worse semantic fit (nothing
 * else on the shortlist reads as clearly as "wrench" for Repair/Trade or
 * "utensils" for Food and Beverage) for a redundancy no user or staff
 * member ever actually perceives, so both stay as the best fit for their
 * own category rather than being changed to avoid an invisible overlap.
 */
export interface IconOption {
  value: string;
  label: string;
  component: LucideIcon;
}

export const BUSINESS_CATEGORY_ICONS: IconOption[] = [
  { value: "utensils", label: "Food and Beverage", component: Utensils },
  { value: "coffee", label: "Cafe / Coffee Shop", component: Coffee },
  { value: "shopping-bag", label: "Retail / Shop", component: ShoppingBag },
  { value: "bed", label: "Accommodation", component: Bed },
  { value: "gift", label: "Souvenir / Craft", component: Gift },
  { value: "briefcase", label: "Service", component: Briefcase },
  { value: "scissors", label: "Salon / Wellness", component: Scissors },
  { value: "croissant", label: "Bakery", component: Croissant },
  { value: "martini", label: "Bar / Nightlife", component: Martini },
  { value: "shopping-cart", label: "Grocery / Market", component: ShoppingCart },
  { value: "car", label: "Transport / Rental", component: Car },
  { value: "wrench", label: "Repair / Trade", component: Wrench },
  { value: "cross", label: "Health / Pharmacy", component: Cross },
  { value: "landmark", label: "Bank / Finance", component: Landmark },
  { value: "store", label: "Other", component: Store },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  BUSINESS_CATEGORY_ICONS.map((option) => [option.value, option.component])
);

/**
 * Looks up a stored icon name (business_categories.icon) back to its
 * Lucide component. Falls back to MapPin, a neutral generic marker, if a
 * stored value ever doesn't match the current shortlist, rather than
 * throwing and breaking whichever card or badge it renders inside.
 */
export function getBusinessCategoryIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? MapPin;
}
