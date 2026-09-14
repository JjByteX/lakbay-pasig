import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

interface CalendarProps {
  selected: Date | null;
  onSelect: (date: Date) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
}

/**
 * Phase 5 (Custom Calendar Component). Month grid, day selection, prior/
 * next month navigation, today indicator -- 5.3. Default/focus/selected/
 * disabled day states -- 5.6. 8px grid spacing, rounded-md cells (the same
 * radius token every other dropdown-style panel in this codebase already
 * uses -- select.tsx's SelectContent, dropdown-menu.tsx's Content, not the
 * rounded-2xl reserved for actual modals per dialog.tsx) -- 5.8.
 *
 * No shadcn Calendar or Popover primitive exists in src/components/ui
 * (checked first, per 5.2 and constraints.md's Inventory Before Suggesting
 * rule), and this session runs no npm install, so this is hand-built
 * against the native Date object -- no new dependency, per ponytail's
 * ladder. Date-only, no time concept here: reusable anywhere a future date
 * field needs the same grid (5.9), independent of time-field.tsx.
 */
export function Calendar({ selected, onSelect, disabled, className }: Readonly<CalendarProps>) {
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = React.useState(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  // Keep the visible month in sync if `selected` changes from outside
  // this component (e.g. the field is cleared, or a different date is
  // set elsewhere while this panel stays open).
  React.useEffect(() => {
    if (selected) setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [selected]);

  const firstWeekday = viewMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();

  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, daysInPrevMonth - i),
      inMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d), inMonth: true });
  }
  // Always six full weeks (42 cells), so the grid never resizes between
  // months, matching ux-ui-guidelines.md's Consistency Rules (a persistent
  // element's dimensions shouldn't shift depending on content).
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }

  function goToMonth(offset: number) {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  return (
    <div className={cn("flex flex-col gap-2 p-2", className)}>
      <div className="flex items-center justify-between px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">{MONTH_LABEL_FORMAT.format(viewMonth)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => goToMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 px-1">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            className="flex h-8 items-center justify-center text-xs font-semibold text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 px-1">
        {cells.map(({ date, inMonth }) => {
          const isSelected = selected !== null && isSameDay(date, selected);
          const isToday = isSameDay(date, today);
          const isDisabled = disabled?.(date) ?? false;
          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(date)}
              aria-current={isToday ? "date" : undefined}
              aria-selected={isSelected}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                inMonth ? "text-foreground" : "text-muted-foreground/50",
                !isSelected && !isDisabled && "hover:bg-muted",
                isToday && !isSelected && "border border-primary font-semibold text-primary",
                isSelected && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                isDisabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
