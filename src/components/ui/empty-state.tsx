import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Shared empty state: icon above the text, the pair centered both ways in
 * the space it's given. Each caller passes the icon for its own concept
 * that best fits what is missing. Copy reads "X will appear here" rather
 * than "No X". Give it a height (h-full, flex-1, min-h-*) to center it in
 * a taller area.
 */
export function EmptyState({
  icon: IconComponent,
  children,
  className,
}: Readonly<{ icon: Icon; children: ReactNode; className?: string }>) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground", className)}>
      <IconComponent weight="bold" className="h-12 w-12 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
