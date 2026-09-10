import { Home, Map, Compass, Bookmark, User } from "lucide-react";
import { NavLink } from "react-router-dom";

// Fixed left-to-right order per navigation-and-access-control.md's Bottom Nav
// Order: Home, Trails, Discover (center), Saved, Profile. Icons from
// lucide-react per ux-ui-guidelines.md's icon rules, each paired with a
// visible text label (not universally-iconic-enough to drop the label).
const TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/trails", label: "Trails", icon: Map, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/saved", label: "Saved", icon: Bookmark, end: false },
  { to: "/profile", label: "Profile", icon: User, end: false },
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
            <tab.icon className="h-5 w-5 shrink-0" />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
