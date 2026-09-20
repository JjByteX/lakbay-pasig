import { useId, useRef } from "react";
import { Copy, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TimeSelect } from "@/components/ui/time-select";
import {
  DAYS,
  TIME_STEP_MINUTES,
  addRange,
  canAddRange,
  defaultWeeklyDays,
  minutesToTime,
  normalizeRanges,
  parseHoursValue,
  serializeHours,
  timeToMinutes,
  type DayKey,
  type HoursMode,
  type ParsedHours,
  type TimeRange,
  type WeeklyDays,
} from "@/lib/hours";

type ModeChoice = HoursMode | "none";

// The four choices from the Google Business Profile hours editor this is
// modeled on. "Open, don't show hours" is stored as an empty value (see
// lib/hours.ts), so it is also what an untouched, never-filled-in field looks
// like.
// Titles carry the whole meaning, with no subtitle under them.
const MODE_OPTIONS: { value: ModeChoice; title: string }[] = [
  { value: "main", title: "Open, show weekly hours" },
  { value: "none", title: "Open, don't show hours" },
  { value: "temp_closed", title: "Temporarily closed, will reopen" },
  { value: "perm_closed", title: "Permanently closed" },
];

// A legacy free-text value has no matching choice, so none is selected until
// staff pick one.
function modeChoiceOf(parsed: ParsedHours): ModeChoice | null {
  if (parsed.kind === "schedule") return parsed.mode;
  if (parsed.kind === "none") return "none";
  return null;
}

interface WeeklyHoursFieldProps {
  id: string;
  ariaLabel: string;
  value: string; // the stored column value, see lib/hours.ts
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Weekly opening hours: four choices (open with weekly hours, open without
 * showing hours, temporarily closed, permanently closed), and for weekly hours one row
 * per day with a Closed checkbox and opening/closing times picked from lists.
 * The plus button adds a second time range to a day (a lunch break, say) and
 * the x removes it. Modeled on the Google Business Profile editor the team
 * pointed to, except times are selectors instead of typed text.
 *
 * Controlled by the stored column string, and only ever calls onChange when
 * staff change something, so a record with an older free-text value is left
 * exactly as it was unless they choose to replace it.
 *
 * Copy Monday to all days is here because a schedule that is the same all week
 * is the common case, and it otherwise takes fourteen separate picks.
 */
export function WeeklyHoursField({
  id,
  ariaLabel,
  value,
  onChange,
  className,
}: Readonly<WeeklyHoursFieldProps>) {
  const groupName = useId();
  // Switching to "don't show hours" clears the stored value, so the schedule staff
  // had built is kept here and comes back if they switch back.
  const rememberedDays = useRef<WeeklyDays | null>(null);

  const parsed = parseHoursValue(value);
  const currentMode = modeChoiceOf(parsed);
  const schedule = parsed.kind === "schedule" && parsed.mode === "main" ? parsed : null;

  function selectMode(next: ModeChoice) {
    const days = parsed.kind === "schedule" ? parsed.days : (rememberedDays.current ?? defaultWeeklyDays());
    if (next === "none") {
      rememberedDays.current = days;
      onChange("");
      return;
    }
    onChange(serializeHours(next, days));
  }

  function setDayRanges(day: DayKey, ranges: TimeRange[]) {
    if (!schedule) return;
    onChange(serializeHours("main", { ...schedule.days, [day]: normalizeRanges(ranges) }));
  }

  function copyMondayToAllDays() {
    if (!schedule) return;
    const monday = schedule.days.mon;
    const copy = (): TimeRange[] => monday.map((range): TimeRange => [range[0], range[1]]);
    onChange(
      serializeHours("main", {
        mon: monday,
        tue: copy(),
        wed: copy(),
        thu: copy(),
        fri: copy(),
        sat: copy(),
        sun: copy(),
      })
    );
  }

  return (
    <div id={id} role="group" aria-label={ariaLabel} className={cn("flex flex-col gap-4", className)}>
      {parsed.kind === "legacy" && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-foreground">Current entry: {parsed.text}</p>
          <p className="text-xs text-muted-foreground">Pick an option below to replace it.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {MODE_OPTIONS.map((option) => (
          <label key={option.value} className="flex w-fit cursor-pointer items-center gap-3">
            <input
              type="radio"
              name={groupName}
              checked={currentMode === option.value}
              onChange={() => selectMode(option.value)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <span className="text-sm text-foreground">{option.title}</span>
          </label>
        ))}
      </div>

      {schedule && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={copyMondayToAllDays}>
              <Copy className="h-4 w-4" />
              Copy Monday to all days
            </Button>
          </div>
          <div className="flex flex-col">
            {DAYS.map((day) => (
              <DayRow
                key={day.key}
                label={day.label}
                ranges={schedule.days[day.key]}
                onChange={(ranges) => setDayRanges(day.key, ranges)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayRow({
  label,
  ranges,
  onChange,
}: Readonly<{
  label: string;
  ranges: TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
}>) {
  const closed = ranges.length === 0;

  return (
    <div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <label className="flex w-fit items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={closed}
            onChange={(e) => onChange(e.target.checked ? [] : [["09:00", "17:00"]])}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span>Closed</span>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {ranges.map((range, index) => (
          <div key={index} className="flex items-center gap-2">
            <TimeSelect
              ariaLabel={`${label} opens at`}
              value={range[0]}
              min={index > 0 ? ranges[index - 1][1] : "00:00"}
              max="23:45"
              onChange={(opens) => onChange(ranges.map((r, i): TimeRange => (i === index ? [opens, r[1]] : r)))}
            />
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              –
            </span>
            <TimeSelect
              ariaLabel={`${label} closes at`}
              value={range[1]}
              min={minutesToTime(timeToMinutes(range[0]) + TIME_STEP_MINUTES)}
              max="24:00"
              onChange={(closes) => onChange(ranges.map((r, i): TimeRange => (i === index ? [r[0], closes] : r)))}
            />
            {index === 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Add hours for ${label}`}
                disabled={!canAddRange(ranges)}
                onClick={() => onChange(addRange(ranges))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Remove hours for ${label}`}
                onClick={() => onChange(ranges.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
