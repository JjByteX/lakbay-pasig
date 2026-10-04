import { useEffect, useState } from "react";
import { Check, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { fetchActiveCategories as fetchPlaceCategories } from "@/lib/place-categories";
import { fetchActiveCategories as fetchBusinessCategories } from "@/lib/business-categories";
import { getCategoryIcon } from "@/lib/place-category-icons";
import { getBusinessCategoryIcon } from "@/lib/business-category-icons";
import { categoryColor } from "@/lib/category-colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// The Preferred Categories picker, shared by the Profile page and the
// onboarding screen (auth/categories-onboarding.tsx) so the two cannot drift
// apart. It was page-local to profile.tsx before onboarding needed it.
//
// The lists read the live place_categories and business_categories tables
// (recommendation-plan.md, Gaps), not a hardcoded list, so a category CATO
// adds or renames shows up here. Both tables are public read.
//
// Two looks, one component: "chip" (the default, what Profile has always
// shown) and "tile" (onboarding: the category's own icon and color, the same
// pair the Discover map legend shows for it, in a larger tap target).
export interface CategoryItem {
  name: string;
  Icon: PhosphorIcon;
  color: string;
}

export type CategoryNames =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; names: string[]; items: CategoryItem[] };

function CategoryTile({
  item,
  selected,
  index,
  onToggle,
}: Readonly<{ item: CategoryItem; selected: boolean; index: number; onToggle: (name: string) => void }>) {
  const reduceMotion = useReducedMotion();
  const { Icon } = item;
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(item.name)}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 12) * 0.03 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Check weight="bold" className="h-3 w-3" />
        </span>
      )}
      <span
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${item.color} 14%, transparent)` }}
      >
        <Icon className="h-6 w-6" style={{ color: item.color }} />
      </span>
      <span className="text-sm font-semibold text-foreground">{item.name}</span>
    </motion.button>
  );
}

export function CategoryChipGroup({
  label,
  list,
  selected,
  onToggle,
  variant = "chip",
}: Readonly<{
  label: string;
  list: CategoryNames;
  selected: string[];
  onToggle: (name: string) => void;
  variant?: "chip" | "tile";
}>) {
  const tiles = variant === "tile";
  let body;
  if (list.status === "loading") {
    body = tiles ? (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    ) : (
      <div className="flex gap-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-16" />
      </div>
    );
  } else if (list.status === "error") {
    body = <p className="text-sm text-destructive">Couldn&apos;t load {label.toLowerCase()} categories.</p>;
  } else if (list.names.length === 0) {
    body = <p className="text-sm text-muted-foreground">No {label.toLowerCase()} categories yet.</p>;
  } else if (tiles) {
    body = (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {list.items.map((item, index) => (
          <CategoryTile
            key={item.name}
            item={item}
            index={index}
            selected={selected.includes(item.name)}
            onToggle={onToggle}
          />
        ))}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap gap-2">
        {list.names.map((name) => (
          <Button
            key={name}
            type="button"
            variant={selected.includes(name) ? "default" : "outline"}
            size="sm"
            onClick={() => onToggle(name)}
          >
            {name}
          </Button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      {body}
    </div>
  );
}

interface CategoryRow {
  name: string;
  icon: string;
  color: string | null;
}

function toReady(rows: CategoryRow[], iconFor: (icon: string) => PhosphorIcon): CategoryNames {
  return {
    status: "ready",
    names: rows.map((r) => r.name),
    items: rows.map((r) => ({ name: r.name, Icon: iconFor(r.icon), color: categoryColor(r.color) })),
  };
}

/**
 * Loads both category lists. They load independently, so one failing never
 * hides the other. `enabled` holds the fetch back until the picker is about to
 * show.
 */
export function useCategoryNames(enabled: boolean, attempt = 0) {
  const [placeList, setPlaceList] = useState<CategoryNames>({ status: "loading" });
  const [businessList, setBusinessList] = useState<CategoryNames>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    setPlaceList({ status: "loading" });
    setBusinessList({ status: "loading" });
    let cancelled = false;
    fetchPlaceCategories()
      .then((rows) => !cancelled && setPlaceList(toReady(rows, getCategoryIcon)))
      .catch(() => !cancelled && setPlaceList({ status: "error" }));
    fetchBusinessCategories()
      .then((rows) => !cancelled && setBusinessList(toReady(rows, getBusinessCategoryIcon)))
      .catch(() => !cancelled && setBusinessList({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  return { placeList, businessList };
}
