import * as React from "react";

import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

// One sliding pill for every segmented control in the app (Tabs and
// SegmentedControl both use it), so they all animate the same way.
//
// The selected item's pill is a separate element under the items that slides
// and resizes to the active one. Position comes from the active item's offsets
// (offsetLeft/offsetWidth), not getBoundingClientRect: a list inside a dialog
// that is mid zoom-in would otherwise be measured scaled.
interface ThumbBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const TRANSITION_STYLE = {
  transitionDuration: `${DURATION.base}s`,
  transitionTimingFunction: `cubic-bezier(${EASE_OUT.join(",")})`,
} as const;

export function useSlidingThumb(
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
  activeSelector: string,
  itemSelector: string
) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  const [box, setBox] = React.useState<ThumbBox | null>(null);
  // Off until the pill has been placed once, and off again whenever it has no
  // place (list hidden, no active item). Otherwise the first paint, or the list
  // coming back from display: none, would show the pill sliding in from 0.
  const [animate, setAnimate] = React.useState(false);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>(activeSelector);
      // A hidden list (an inactive panel, display: none) measures as 0 wide.
      if (!active || list.offsetWidth === 0) {
        setBox(null);
        setAnimate(false);
        return;
      }
      const next = {
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      };
      setBox((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height
          ? prev
          : next
      );
    };

    // Resizing: the list (window or container changes, w-full lists), and each
    // item (a label or font changing its width).
    const resize = new ResizeObserver(measure);
    const observeAll = () => {
      resize.disconnect();
      resize.observe(list);
      list.querySelectorAll(itemSelector).forEach((item) => resize.observe(item));
    };

    // Selection changing (data-state or aria-pressed flips) and items being
    // added or removed (Categories shows only the tabs a person may use).
    const mutation = new MutationObserver(() => {
      observeAll();
      measure();
    });

    measure();
    observeAll();
    mutation.observe(list, {
      attributes: true,
      attributeFilter: ["data-state", "aria-pressed"],
      childList: true,
      subtree: true,
    });

    // Web fonts change label widths after first paint.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      resize.disconnect();
      mutation.disconnect();
    };
  }, [activeSelector, itemSelector]);

  // Turn the slide on one frame after the pill is first placed.
  React.useEffect(() => {
    if (!box || animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animate]);

  const thumb = box ? (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-0 top-0 rounded-sm bg-background shadow-sm",
        animate && "transition-[transform,width,height] motion-reduce:transition-none"
      )}
      style={{
        transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
        width: box.width,
        height: box.height,
        ...TRANSITION_STYLE,
      }}
    />
  ) : null;

  return { setRef, thumb };
}

const ITEM_SELECTOR = "[data-segment]";
const ACTIVE_SELECTOR = '[data-segment][aria-pressed="true"]';

interface SegmentedControlProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

// Filter-style segmented buttons (date range, chart metric, hours, travel
// mode). Real buttons with aria-pressed rather than tabs: they choose a value,
// they do not switch panels. For panel switching use Tabs.
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: Readonly<SegmentedControlProps<T>>) {
  const { setRef, thumb } = useSlidingThumb(null, ACTIVE_SELECTOR, ITEM_SELECTOR);

  return (
    <div
      ref={setRef}
      role="group"
      aria-label={label}
      className={cn("relative inline-flex h-8 items-center rounded-md bg-muted p-1", className)}
    >
      {thumb}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-segment=""
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative inline-flex h-6 items-center whitespace-nowrap rounded-sm px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            option.value === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
