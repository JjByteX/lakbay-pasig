import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnline } from "@/lib/offline/status";
import { PAGE_NOT_DOWNLOADED } from "@/lib/offline/messages";

/**
 * Shared load-error block: says what failed and what to do next, with a retry,
 * instead of a bare red line. Callers pass fixed, human copy ("Couldn't load X.
 * Check your connection and try again."), never a raw database message.
 *
 * Offline, every caller shows the same line instead: a read that is not in the
 * download fails the same way on every screen (offline-phases.md, 6.7).
 */
export function ErrorState({
  children,
  onRetry,
  className,
}: Readonly<{ children: ReactNode; onRetry: () => void; className?: string }>) {
  const online = useOnline();
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 py-10 text-center", className)}>
      <p className="text-sm text-destructive">{online ? children : PAGE_NOT_DOWNLOADED}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
