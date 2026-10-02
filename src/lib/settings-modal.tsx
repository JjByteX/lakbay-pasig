import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Settings as a modal instead of a routed page. Same shape as
 * auth-modal.tsx: one context provided from App (so the profile page, the
 * resident account menus and the admin sidebar menu can all open the same
 * single modal), a use* hook that throws outside the provider, and the
 * modal itself (components/settings-modal.tsx) mounted once next to
 * AuthModal.
 */

export type SettingsSection = "general" | "account" | "password";

interface SettingsModalContextValue {
  open: boolean;
  section: SettingsSection;
  /** Opens the modal. No argument opens the General section. */
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setSection: (section: SettingsSection) => void;
}

const SettingsModalContext = createContext<SettingsModalContextValue | undefined>(undefined);

/** Lets any component open, close, or switch sections of the settings modal. */
export function useSettingsModal() {
  const ctx = useContext(SettingsModalContext);
  if (!ctx) throw new Error("useSettingsModal must be used within SettingsModalProvider");
  return ctx;
}

export function SettingsModalProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("general");

  const value = useMemo<SettingsModalContextValue>(
    () => ({
      open,
      section,
      openSettings: (next: SettingsSection = "general") => {
        setSection(next);
        setOpen(true);
      },
      closeSettings: () => setOpen(false),
      setSection,
    }),
    [open, section]
  );

  return <SettingsModalContext.Provider value={value}>{children}</SettingsModalContext.Provider>;
}
