import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Desktop shell overlap: PublicShell's SidebarInset is pinned at
// --sidebar-width-icon, but an expanded rail is --sidebar-width wide and
// sits on top of it, so the left (width - icon) of every page is covered.
// `wide` reserves that amount on both sides (2x, to stay centered) so
// content never slides under the rail. Both variables come from
// SidebarProvider's wrapper div, so any page inside the shell inherits
// them. At md+ only: MobileShell has no sidebar and never defines them.
//
// `form` is the two-state width for form pages (Profile, Vendor: list your
// business, edit listing). Mobile: the same 448px column as everywhere else.
// Desktop (md+): a wider 672px column that reserves the same rail space as
// `wide`, so every form card is one consistent width and is never covered by
// the expanded sidebar. Pages that share the `form` width always line up.
const WIDTH = {
  narrow: "max-w-md",
  form: "max-w-md md:w-[calc(100%_-_2_*_(var(--sidebar-width)_-_var(--sidebar-width-icon)))] md:max-w-2xl",
  // full: no max-width. Desktop: starts at the right edge of the expanded
  // rail and runs to the right edge of the page, the same span the admin
  // pages' cards have. Mobile: the same 448px column. Used by the desktop
  // "List your business" stepper so it matches admin-business-detail.tsx.
  full: "max-w-md md:ml-auto md:mr-0 md:w-[calc(100%_-_(var(--sidebar-width)_-_var(--sidebar-width-icon)))] md:max-w-none",
  wide: "max-w-md md:w-[calc(100%_-_2_*_(var(--sidebar-width)_-_var(--sidebar-width-icon)))] md:max-w-5xl",
} as const;

interface PageContainerProps {
  // narrow: simple single-column pages. form: form pages with a desktop
  // state (Profile, Vendor). wide: feeds and grids (Home). full: edge-to-edge
  // desktop form (List your business). Same 448px column below md in every case.
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
