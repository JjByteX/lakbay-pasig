import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Fit-to-viewport behavior for admin/staff sub pages, ported from Amkor IMS
// (AppShell's non-scrolling <main> + FormLayout's `stretch`): the page never
// scrolls, and the card stretches downward to fill all the space left under
// the heading, ending at the bottom edge with the action buttons pinned
// beneath it. If the fields are taller than that space, the card scrolls its
// own content instead of pushing the whole page down.
//
// Two halves have to agree for this to work:
//   1. admin.tsx bounds the outlet for these routes (overflow-hidden), and
//      each page's root is flex min-h-0 grow flex-col, so a real height
//      reaches the card.
//   2. the card opts in with the classes below. grow is the stretch: it
//      grows the card to take the remaining height. It is deliberately
//      grow (flex-basis auto) and not flex-1 (flex-basis 0%): a 0% basis
//      only resolves when every ancestor has a definite height, and when
//      one does not the card collapses to nothing instead of falling back
//      to its content height. min-h-0 lets the card shrink below its
//      content height, overflow-y-auto makes the shrunk card scroll.
//      [&>*]:shrink-0 keeps the card's own children (a map, a photo
//      grid) at their natural size: a child that clips its own overflow
//      would otherwise be squeezed to fit instead of the card scrolling.
//
// The scrollbar's look (thin, rounded thumb, transparent track) is global,
// in index.css, so nothing here styles it.
//
// ADMIN_SCROLL_CLASS is exported for containers that are not this component
// (a list's <ul>, and BusinessFields, which is shared with the vendor side
// and only gets it when admin passes it in).
export const ADMIN_SCROLL_CLASS = "min-h-0 grow overflow-y-auto [&>*]:shrink-0";

export function AdminFormCard({ className, ...props }: Readonly<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-4",
        ADMIN_SCROLL_CLASS,
        className
      )}
      {...props}
    />
  );
}
