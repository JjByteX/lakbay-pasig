import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AdminFilterBar — single-row toolbar meant for AdminDataTable's `toolbar`
 * slot: a search input plus optional filter controls (Select dropdowns,
 * SegmentedControl-equivalent tabs, etc. passed as children).
 *
 * Ported from amkor-ims's Components/Shared/FilterStrip.jsx: same
 * flex-wrap row, same "search grows, other fields hold their width"
 * layout. That original wraps a controlled `<Input>` whose onChange only
 * updates local state, applying the search server-side on Enter
 * (Contacts/Index.jsx's `applySearch`, an Inertia GET request). This app
 * has no search route to hit — every admin list already loads its full
 * row set client-side (admin-places.tsx, admin-businesses.tsx, etc,
 * confirmed by inventory before writing this), so AdminSearchInput below
 * filters that in-memory array on every keystroke instead of on Enter,
 * the client-side equivalent of the same interaction.
 */
export default function AdminFilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/**
 * AdminSearchInput — the search field for AdminFilterBar. Grows to fill
 * available space, matching FilterField's `grow` variant in the original.
 * Shows a Clear button when there's a query, same as Contacts/Index.jsx's
 * conditional Clear button beside the search field.
 */
export function AdminSearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative flex-1 min-w-[180px]", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("pl-8", value && "pr-8")}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
