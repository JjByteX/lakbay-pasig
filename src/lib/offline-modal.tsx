import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * The Offline modal, opened from the account menus (offline-plan.md). Same
 * shape as settings-modal.tsx: one context provided from App, so the mobile
 * menu, the desktop sidebar dropdown and the guest footer row all open the
 * same single modal, mounted once (components/offline-modal.tsx).
 */
interface OfflineModalContextValue {
  open: boolean;
  openOffline: () => void;
  closeOffline: () => void;
}

const OfflineModalContext = createContext<OfflineModalContextValue | undefined>(undefined);

export function useOfflineModal() {
  const ctx = useContext(OfflineModalContext);
  if (!ctx) throw new Error("useOfflineModal must be used within OfflineModalProvider");
  return ctx;
}

export function OfflineModalProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [open, setOpen] = useState(false);

  const value = useMemo<OfflineModalContextValue>(
    () => ({ open, openOffline: () => setOpen(true), closeOffline: () => setOpen(false) }),
    [open]
  );

  return <OfflineModalContext.Provider value={value}>{children}</OfflineModalContext.Provider>;
}
