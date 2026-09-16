import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * landing-hero-phases.md Phase 5.1-5.3. Sign in / sign up as a short
 * popup, fully separate from landing page content -- see
 * landing-hero-plan.md's Auth Popup section for why this shares no file
 * with hero-carousel.tsx.
 *
 * Provided from App, not from PublicShell, per landing-hero-plan.md's
 * Flagged Conflicts #3: the modal is needed by the Landing page and by
 * protected-route.tsx, both outside PublicShell, so one level up is where
 * a single provider covers both. Everything else about the shape follows
 * decision-log #16's standing rule exactly: a context, a use* hook
 * matching useGlobalSearchQuery's naming and its error-if-outside-
 * provider check (public-shell.tsx).
 */

export type AuthModalMode = "login" | "signup";

interface AuthModalContextValue {
  open: boolean;
  mode: AuthModalMode;
  /** Opens the modal. No argument defaults to login, per 5.1. */
  openAuth: (mode?: AuthModalMode) => void;
  closeAuth: () => void;
  /** Switches mode without closing the modal, for the in-form cross links. */
  setMode: (mode: AuthModalMode) => void;
}

const AuthModalContext = createContext<AuthModalContextValue | undefined>(undefined);

/** Lets any component open, close, or switch the shared auth popup. */
export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used within AuthModalProvider");
  return ctx;
}

export function AuthModalProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const [mode, setModeState] = useState<AuthModalMode>("login");

  const value = useMemo<AuthModalContextValue>(
    () => ({
      open,
      mode,
      openAuth: (nextMode: AuthModalMode = "login") => {
        setModeState(nextMode);
        setOpen(true);
      },
      closeAuth: () => setOpen(false),
      setMode: (nextMode: AuthModalMode) => setModeState(nextMode),
    }),
    [open, mode]
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}
