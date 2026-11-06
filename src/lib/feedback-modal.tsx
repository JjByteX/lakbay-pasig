import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * The Send Feedback modal (send-feedback-plan.md). Same shape as
 * offline-modal.tsx: one context provided from App, so every menu entry and
 * the Help page open the same single modal, mounted once
 * (components/feedback-modal.tsx).
 */
interface FeedbackModalContextValue {
  open: boolean;
  openFeedback: () => void;
  closeFeedback: () => void;
}

const FeedbackModalContext = createContext<FeedbackModalContextValue | undefined>(undefined);

export function useFeedbackModal() {
  const ctx = useContext(FeedbackModalContext);
  if (!ctx) throw new Error("useFeedbackModal must be used within FeedbackModalProvider");
  return ctx;
}

export function FeedbackModalProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [open, setOpen] = useState(false);

  const value = useMemo<FeedbackModalContextValue>(
    () => ({ open, openFeedback: () => setOpen(true), closeFeedback: () => setOpen(false) }),
    [open]
  );

  return <FeedbackModalContext.Provider value={value}>{children}</FeedbackModalContext.Provider>;
}
