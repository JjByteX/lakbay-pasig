import { Outlet } from "react-router-dom";
import { createContext, useContext, useState, type ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

// Search slot: only Discover fills it (step 5), every other tab renders the
// top bar title-only or empty. Kept in the shell regardless, per
// ux-ui-guidelines.md's Layout Shell Rule, a bar that only appears on one
// tab today would need to move into the shell the moment a second tab
// needs it, so it starts there.
interface TopBarSlotContextValue {
  content: ReactNode;
  setContent: (content: ReactNode) => void;
}

const TopBarSlotContext = createContext<TopBarSlotContextValue | undefined>(undefined);

/** Lets a page (e.g. Discover) render its search bar into the shell's top bar. */
export function useTopBarSlot() {
  const ctx = useContext(TopBarSlotContext);
  if (!ctx) throw new Error("useTopBarSlot must be used within PublicShell");
  return ctx.setContent;
}

export function PublicShell() {
  const [content, setContent] = useState<ReactNode>(null);

  return (
    <TopBarSlotContext.Provider value={{ content, setContent }}>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b border-border bg-card px-4">
          <div className="mx-auto flex w-full max-w-md items-center">{content}</div>
        </header>
        <main className="fixed inset-x-0 bottom-16 top-14 overflow-y-auto">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </TopBarSlotContext.Provider>
  );
}
