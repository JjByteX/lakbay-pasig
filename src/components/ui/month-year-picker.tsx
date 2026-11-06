import * as React from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SHORT_MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short" });
const YEARS_PER_PAGE = 12;

interface MonthYearPickerProps {
  /** The month being viewed; the picker opens on this month's year. */
  month: Date;
  /** Fills this date's month and year, when there is a selected date. Today is always outlined. */
  selected?: Date | null;
  /** Called with the first day of the month the person picked. */
  onPick: (month: Date) => void;
  className?: string;
}

/**
 * Month and year chooser, shared by calendar.tsx (the date popup) and the
 * Announcements calendar, so both pick a far-off month the same way. Opens on
 * a 3x4 grid of months; the year label opens a 3x4 grid of years, and picking
 * a year returns to the months. Arrows step a year, or a page of years.
 *
 * Fixed 284px wide and 316px tall (the size of calendar.tsx's day view), so
 * swapping it in for the days never resizes the popup. It owns no popup
 * chrome: the caller supplies the border, padding and dismissal.
 */
export function MonthYearPicker({ month, selected = null, onPick, className }: Readonly<MonthYearPickerProps>) {
  const [view, setView] = React.useState<"months" | "years">("months");
  const [year, setYear] = React.useState(month.getFullYear());
  const [yearsStart, setYearsStart] = React.useState(0);

  function step(direction: -1 | 1) {
    if (view === "months") setYear((y) => y + direction);
    else setYearsStart((start) => start + direction * YEARS_PER_PAGE);
  }

  function openYears() {
    setYearsStart(Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE);
    setView("years");
  }

  const stepLabel = view === "months" ? "year" : "years";
  const cellClass =
    "flex items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  // Same marks as the day grid: a solid fill for the selected date, an outline
  // for today's month or year.
  const cellState = (current: boolean, isToday: boolean) =>
    current
      ? "bg-primary font-semibold text-primary-foreground"
      : cn("hover:bg-muted", isToday ? "border border-primary font-semibold text-primary" : "text-foreground");
  const now = new Date();

  return (
    <div className={cn("flex w-[284px] shrink-0 flex-col gap-2", className)}>
      <div className="flex items-center justify-between px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => step(-1)}
          aria-label={`Previous ${stepLabel}`}
        >
          <CaretLeft className="h-4 w-4" />
        </Button>
        {view === "months" ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-sm font-semibold text-foreground"
            onClick={openYears}
            aria-label="Choose year"
          >
            {year}
          </Button>
        ) : (
          <span className="text-sm font-semibold text-foreground">
            {yearsStart} – {yearsStart + YEARS_PER_PAGE - 1}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => step(1)}
          aria-label={`Next ${stepLabel}`}
        >
          <CaretRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid h-[276px] grid-cols-3 grid-rows-4 gap-2 px-1">
        {view === "months"
          ? Array.from({ length: 12 }, (_, m) => {
              const current = selected !== null && selected.getFullYear() === year && selected.getMonth() === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPick(new Date(year, m, 1))}
                  aria-selected={current}
                  className={cn(cellClass, cellState(current, now.getFullYear() === year && now.getMonth() === m))}
                >
                  {SHORT_MONTH_FORMAT.format(new Date(year, m, 1))}
                </button>
              );
            })
          : Array.from({ length: YEARS_PER_PAGE }, (_, i) => {
              const y = yearsStart + i;
              const current = selected !== null && selected.getFullYear() === y;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setYear(y);
                    setView("months");
                  }}
                  aria-selected={current}
                  className={cn(cellClass, cellState(current, now.getFullYear() === y))}
                >
                  {y}
                </button>
              );
            })}
      </div>
    </div>
  );
}
