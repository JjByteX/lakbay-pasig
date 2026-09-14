import * as React from "react";
import { cn } from "@/lib/utils";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0-59
const PERIODS = ["AM", "PM"] as const;
type Period = (typeof PERIODS)[number];

function to12Hour(hour24: number): { hour12: number; period: Period } {
  const period: Period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, period };
}

function to24Hour(hour12: number, period: Period): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

interface TimeColumnProps<T extends number | Period> {
  label: string;
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  format: (value: T) => string;
}

function TimeColumn<T extends number | Period>({
  label,
  values,
  selected,
  onSelect,
  format,
}: Readonly<TimeColumnProps<T>>) {
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  // Scroll the current value into view whenever the panel opens or the
  // selection changes from outside this column (e.g. the paired hour
  // column flips AM/PM here).
  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex h-40 w-16 flex-col gap-1 overflow-y-auto rounded-md border border-input p-1">
        {values.map((v) => (
          <button
            key={v}
            ref={v === selected ? selectedRef : undefined}
            type="button"
            onClick={() => onSelect(v)}
            className={cn(
              "flex h-9 shrink-0 items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              v === selected
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-foreground hover:bg-muted"
            )}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TimeFieldProps {
  hour24: number; // 0-23, -1 means unset
  minute: number; // 0-59, -1 means unset
  onChange: (hour24: number, minute: number) => void;
  className?: string;
}

/**
 * Phase 5.4: the paired time control (the "time thingy"), a separate but
 * connected control next to the calendar, matching how most calendar and
 * time pickers pair a grid with a scrollable/stepped time input rather
 * than one combined native control. 12-hour with AM/PM per ux-ui-
 * guidelines.md's Familiarity principle (the convention users already
 * know), converted to/from 24-hour on the way in and out so the caller
 * (datetime-field.tsx) only ever deals in real Date hours.
 *
 * An unset value (-1/-1) still renders a usable picker defaulted to 12:00
 * AM rather than a blank one, since a scroll column has no empty state of
 * its own to show -- the first tap always produces a concrete time.
 */
export function TimeField({ hour24, minute, onChange, className }: Readonly<TimeFieldProps>) {
  const hasValue = hour24 >= 0 && minute >= 0;
  const { hour12, period } = hasValue ? to12Hour(hour24) : { hour12: 12, period: "AM" as Period };
  const effectiveMinute = hasValue ? minute : 0;

  function selectHour(h: number) {
    onChange(to24Hour(h, period), effectiveMinute);
  }
  function selectMinute(m: number) {
    onChange(hasValue ? hour24 : to24Hour(hour12, period), m);
  }
  function selectPeriod(p: Period) {
    onChange(to24Hour(hour12, p), effectiveMinute);
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <TimeColumn label="Hour" values={HOURS_12} selected={hour12} onSelect={selectHour} format={(v) => String(v)} />
      <TimeColumn
        label="Minute"
        values={MINUTES}
        selected={effectiveMinute}
        onSelect={selectMinute}
        format={(v) => String(v).padStart(2, "0")}
      />
      <TimeColumn label="Period" values={PERIODS} selected={period} onSelect={selectPeriod} format={(v) => v} />
    </div>
  );
}
