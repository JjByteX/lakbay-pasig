import type { ReactNode } from "react";
import type { Icon, IconWeight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Row actions shown as icon buttons with a hover label, replacing the
 * three-dot menu on every admin table (direct instruction). The label is the
 * tooltip text and the aria-label, so it is also what a screen reader says.
 *
 * AdminIconActions wraps a row's buttons in their own TooltipProvider (the
 * sidebar's provider only wraps the sidebar, same reason business-fields.tsx
 * carries its own) and lays them out in a row.
 *
 * An action with several choices (Announcements' Set status) is not built
 * from this alone: it keeps one icon and a dropdown behind it, composing the
 * same Tooltip pieces around DropdownMenuTrigger.
 */
export function AdminIconActions({ children }: Readonly<{ children: ReactNode }>) {
  return <TooltipProvider delayDuration={200}>{children}</TooltipProvider>;
}

export function AdminIconAction({
  icon: IconComponent,
  label,
  onClick,
  disabled,
  weight,
  destructive,
}: Readonly<{
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  weight?: IconWeight;
  destructive?: boolean;
}>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", destructive && "text-destructive hover:text-destructive")}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          <IconComponent className="h-4 w-4" weight={weight} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
