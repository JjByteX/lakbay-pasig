import { NavLink } from "react-router-dom";
import { SidebarSimple } from "@phosphor-icons/react";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { useSidebar } from "@/components/ui/sidebar";

// Header row shared by public-sidebar.tsx and admin-sidebar.tsx, so both
// rails collapse and expand the same way (one component, not two copies).
//
// Expanded: logo + "Lakbay Pasig" wordmark as a link to `to`, plus a
// collapse button on the right (SidebarSimple, mirrored so it points in).
// Collapsed: one button fills the logo's slot and is the expand control,
// since an icon-only rail has no room for a second target. Hovering it
// swaps the logo for the expand icon via Tailwind's group-hover: variant
// (no component state for the hover, only the click calls toggleSidebar).
//
// Both states are h-8 rows and the expanded link has pl-1, so the logo sits
// at the same x (header p-2 + 4px) and y in both. Keep them equal, or the
// logo jumps when the rail toggles.
export function SidebarLogoRow({ to }: Readonly<{ to: string }>) {
  const { state, toggleSidebar } = useSidebar();

  if (state === "collapsed") {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Expand sidebar"
        className="group/logo-toggle flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center group-hover/logo-toggle:hidden">
          <img src={logo} alt="Lakbay Pasig" className="h-6 w-6 shrink-0" />
        </span>
        <span className="hidden h-8 w-8 items-center justify-center group-hover/logo-toggle:flex">
          <SidebarSimple className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div className="flex h-8 w-full items-center gap-2">
      <NavLink to={to} className="flex h-8 min-w-0 flex-1 items-center gap-2 pl-1">
        <img src={logo} alt="Lakbay Pasig" className="h-6 w-6 shrink-0" />
        <span className="truncate text-base font-semibold text-foreground">Lakbay Pasig</span>
      </NavLink>
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Collapse sidebar"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SidebarSimple className="h-4 w-4 -scale-x-100" />
      </button>
    </div>
  );
}
