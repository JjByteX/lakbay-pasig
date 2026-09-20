import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TimeSelect } from "@/components/ui/time-select";
import {
  DAYS,
  MINUTES_PER_DAY,
  TIME_STEP_MINUTES,
  minutesToTime,
  parseRecommendedTime,
  serializeRecommendedTime,
  timeToMinutes,
  type DayKey,
  type RecommendedTime,
} from "@/lib/hours";

interface RecommendedTimeFieldProps {
  id: string;
  ariaLabel: string;
  value: string; // the stored column value, see lib/hours.ts
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A trail's Recommended Time: which days of the week (toggle chips, the same
 * pattern the place form's facilities use) and, optionally, what part of the
 * day (a from and to time). Either half can be left empty, and leaving both
 * empty stores nothing.
 *
 * Controlled by the stored column string and only ever calls onChange when
 * staff change something, so an older typed value ("Weekend mornings") is left
 * exactly as it was until they choose to replace it.
 */
export function RecommendedTimeField({
  id,
  ariaLabel,
  value,
  onChange,
  className,
}: Readonly<RecommendedTimeFieldProps>) {
  const parsed = parseRecommendedTime(value);
  const current: RecommendedTime = parsed.kind === "structured" ? parsed.value : { days: [], from: "", to: "" };

  function commit(next: RecommendedTime) {
    onChange(serializeRecommendedTime(next));
  }

  function toggleDay(key: DayKey) {
    const selected = current.days.includes(key) ? current.days.filter((d) => d !== key) : [...current.days, key];
    // Keep the days in week order however they were picked.
    commit({ ...current, days: DAYS.map((day) => day.key).filter((d) => selected.includes(d)) });
  }

  function changeFrom(from: string) {
    if (from === "") {
      commit({ ...current, from: "", to: "" });
      return;
    }
    // A time range needs both ends. Keep the current end if it is still after
    // the new start, otherwise set it two hours later.
    const keepsEnd = current.to !== "" && timeToMinutes(current.to) > timeToMinutes(from);
    const to = keepsEnd ? current.to : minutesToTime(Math.min(timeToMinutes(from) + 120, MINUTES_PER_DAY));
    commit({ ...current, from, to });
  }

  return (
    <div id={id} role="group" aria-label={ariaLabel} className={cn("flex flex-col gap-3", className)}>
      {parsed.kind === "legacy" && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-foreground">Current entry: {parsed.text}</p>
          <p className="text-xs text-muted-foreground">Pick days or a time below to replace it.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => {
          const active = current.days.includes(day.key);
          return (
            <Button
              key={day.key}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              aria-pressed={active}
              aria-label={day.label}
              onClick={() => toggleDay(day.key)}
            >
              {day.short}
            </Button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 sm:max-w-sm">
        <TimeSelect
          ariaLabel="Recommended from"
          value={current.from}
          min="00:00"
          max="23:45"
          emptyLabel="Any time"
          onChange={changeFrom}
        />
        {current.from !== "" && (
          <>
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              –
            </span>
            <TimeSelect
              ariaLabel="Recommended until"
              value={current.to}
              min={minutesToTime(timeToMinutes(current.from) + TIME_STEP_MINUTES)}
              max="24:00"
              onChange={(to) => commit({ ...current, to })}
            />
          </>
        )}
      </div>
    </div>
  );
}
