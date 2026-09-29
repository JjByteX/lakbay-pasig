import { House, MapTrifold, Compass, Bookmark } from "@phosphor-icons/react";
import { NavLink } from "react-router-dom";

// Fixed left-to-right order per navigation-and-access-control.md's Bottom Nav
// Order, minus Profile: Home, Trails, Discover (center), Saved. Profile
// moved to the shell header's top-right account menu (public-shell.tsx),
// per direct instruction -- confirmed to remove it from here rather than
// keep it in both places, so there's exactly one way to reach Profile, not
// two competing entry points for the same destination (ux-ui-guidelines.md's
// "one action, one trigger, one place"). Icons from Phosphor per
// ux-ui-guidelines.md's icon rules, each paired with a visible text label
// (not universally-iconic-enough to drop the label).
const TABS = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/trails", label: "Trails", icon: MapTrifold, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/saved", label: "Saved", icon: Bookmark, end: false },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 h-16 border-t border-border bg-card">
      <div className="mx-auto flex h-full max-w-md items-center justify-around px-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex h-full flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            {() => (
              <>
                {/* Outline icon always, active vs. inactive communicated
                    solely by the text-primary/text-muted-foreground color
                    change above -- the earlier active-tab fill (an SVG `fill` set to currentColor; Phosphor's
                    fill weight stays unused here too) has been removed
                    per direct request, so no tab icon ever renders filled
                    when switching between them. */}
                <tab.icon className="h-5 w-5 shrink-0" />
                <span>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
