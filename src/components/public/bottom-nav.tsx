import { House, MapTrifold, Compass, Bookmark } from "@phosphor-icons/react";
import { NavLink, useLocation } from "react-router-dom";
import { discoverResumeTarget } from "@/lib/discover-memory";

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
  const { pathname } = useLocation();
  const onDiscover = pathname === "/discover" || pathname.startsWith("/discover/");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 h-16 border-t border-border bg-card">
      <div className="mx-auto flex h-full max-w-md items-center justify-around px-2">
        {TABS.map((tab) => {
          // From another tab, Discover reopens the place or business page
          // that was left open (mobile swipe pager keeps it). Tapping it
          // while already in Discover goes to the map, like any tab bar.
          const resume = tab.to === "/discover" && !onDiscover ? discoverResumeTarget() : null;
          return (
          <NavLink
            key={tab.to}
            to={resume ? resume.to : tab.to}
            state={resume?.state}
            end={tab.end}
            className={({ isActive }) =>
              `flex h-full flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* Bold at rest (global default), filled when the tab
                    is active, per direct request (reverses the earlier
                    outline-only rule, decision-log.md #24). */}
                <tab.icon weight={isActive ? "fill" : "bold"} className="h-5 w-5 shrink-0" />
                <span>{tab.label}</span>
              </>
            )}
          </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
