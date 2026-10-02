import { Gear, Lock, UserCircle, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SettingsSections } from "@/components/settings-sections";
import { useSettingsModal, type SettingsSection } from "@/lib/settings-modal";
import { cn } from "@/lib/utils";

/**
 * Settings modal, shared by the resident view and the admin/staff view:
 * a left nav of sections and the selected section on the right. Mounted
 * once from App.tsx and opened through useSettingsModal(), so both shells
 * show exactly the same settings. The only shell-specific difference is
 * the compact (text-sm) type scale on /admin routes.
 *
 * DialogContent is the one card here (its own close button sits top-right),
 * so nothing inside is boxed again. Below md the nav becomes a row of tabs
 * above the content.
 */
const NAV: { id: SettingsSection; label: string; icon: PhosphorIcon }[] = [
  { id: "general", label: "General", icon: Gear },
  { id: "account", label: "Account", icon: UserCircle },
  { id: "password", label: "Password", icon: Lock },
];

export function SettingsModal() {
  const { open, section, closeSettings, setSection } = useSettingsModal();
  const { pathname } = useLocation();
  const compact = pathname.startsWith("/admin");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeSettings()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[min(40rem,calc(100svh-2rem))] max-w-3xl flex-col gap-0 overflow-hidden p-0 md:flex-row"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Change your preferences and account details.</DialogDescription>

        <nav
          aria-label="Settings sections"
          className="flex shrink-0 flex-col gap-1 border-b border-border bg-muted/40 p-3 pr-12 md:w-56 md:border-b-0 md:border-r md:pr-3"
        >
          <p className="hidden px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground md:block">Settings</p>
          <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={section === id ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  section === id && "bg-muted"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-8">
          <SettingsSections section={section} compact={compact} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
