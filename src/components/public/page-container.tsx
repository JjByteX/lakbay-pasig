import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Desktop shell overlap: PublicShell's SidebarInset is pinned at
// --sidebar-width-icon, but an expanded rail is --sidebar-width wide and
// sits on top of it, so the left (width - icon) of every page is covered.
// `wide` reserves that amount on both sides (2x, to stay centered) so
// content never slides under the rail. Both variables come from
// SidebarProvider's wrapper div, so any page inside the shell inherits
// them. At md+ only: MobileShell has no sidebar and never defines them.
const WIDTH = {
  narrow: "max-w-md",
  wide: "max-w-md md:w-[calc(100%_-_2_*_(var(--sidebar-width)_-_var(--sidebar-width-icon)))] md:max-w-5xl",
} as const;

interface PageContainerProps {
  // narrow: forms and settings (Profile, Settings). wide: feeds and grids
  // (Home). Same 448px column below md either way.
  width?: keyof typeof WIDTH;
  className?: string;
  children: ReactNode;
}

export function PageContainer({ width = "narrow", className, children }: Readonly<PageContainerProps>) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6 px-6 py-6", WIDTH[width], className)}>
      {children}
    </div>
  );
}
