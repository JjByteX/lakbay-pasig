import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { useSlidingThumb } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

// The sliding pill lives in segmented-control.tsx, shared with SegmentedControl.
const TABS_ITEM_SELECTOR = '[role="tab"]';
const TABS_ACTIVE_SELECTOR = '[role="tab"][data-state="active"]';

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, forwardedRef) => {
  const { setRef, thumb } = useSlidingThumb(forwardedRef, TABS_ACTIVE_SELECTOR, TABS_ITEM_SELECTOR);

  return (
    <TabsPrimitive.List
      ref={setRef}
      className={cn(
        "relative inline-flex h-9 items-center justify-center rounded-nest-sm-1 bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {thumb}
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

// relative: puts each trigger above the sliding pill (a positioned element
// paints over a non-positioned one, whatever the order in the page). The
// active trigger no longer paints its own background or shadow, the pill does.
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

// Radix keeps an inactive tab's panel in the page as an empty element with the
// hidden attribute. Any display class a caller puts on it (flex, grid) beats
// the browser's own [hidden] rule, so the empty panel would stay laid out and,
// with grow, take a share of the free space next to the active one.
// data-[state=inactive]:hidden is more specific than those classes, so an
// inactive panel is always display: none, whatever the caller styles it as.
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=inactive]:hidden",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
