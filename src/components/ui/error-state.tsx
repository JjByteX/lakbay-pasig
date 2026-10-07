import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared load-error block: says what failed and what to do next, with a retry,
 * instead of a bare red line. Callers pass fixed, human copy ("Couldn't load X.
 * Check your connection and try again."), never a raw database message.
 */
export function ErrorState({
  children,
  onRetry,
  className,
}: Readonly<{ children: ReactNode; onRetry: () => void; className?: string }>) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 py-10 text-center", className)}>
      <p className="text-sm text-destructive">{children}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
