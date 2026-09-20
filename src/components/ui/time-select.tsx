import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { END_OF_DAY, buildTimeOptions, formatTime12, timeToMinutes } from "@/lib/hours";

// SelectItem can't carry an empty value, so "no time" travels as this
// sentinel and is translated back to "" on the way out.
const EMPTY_VALUE = "__empty__";

interface TimeSelectProps {
  value: string; // "HH:mm", "24:00" for end of day, "" when unset
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  min?: string; // earliest selectable time, inclusive
  max?: string; // latest selectable time, inclusive
  emptyLabel?: string; // adds a choice that clears the value, e.g. "Any time"
  disabled?: boolean;
  className?: string;
}

function optionLabel(time: string): string {
  return time === END_OF_DAY ? "12:00 AM (midnight)" : formatTime12(time);
}

/**
 * A time chosen from a list in 15 minute steps, built on select.tsx like every
 * other dropdown in the admin. Used by weekly-hours-field.tsx for opening and
 * closing times and by recommended-time-field.tsx.
 *
 * time-field.tsx (the hour/minute/period scroll columns behind datetime-field)
 * is a popup built to sit next to a calendar. A weekly schedule needs fourteen
 * or more of these at once, where one pick from a list is much faster than
 * three, so this is a separate, lighter control rather than a variant of it.
 *
 * min and max keep the list valid (a closing time can't be before its opening
 * time). A value outside that range, say one edited by hand in the database,
 * is still shown rather than blanked.
 */
export function TimeSelect({
  value,
  onChange,
  ariaLabel,
  id,
  min = "00:00",
  max = "24:00",
  emptyLabel,
  disabled = false,
  className,
}: Readonly<TimeSelectProps>) {
  const options = buildTimeOptions(min, max);
  if (value !== "" && !options.includes(value)) {
    options.push(value);
    options.sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  }

  let selectValue = value;
  if (value === "" && emptyLabel) selectValue = EMPTY_VALUE;

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === EMPTY_VALUE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("min-w-0 flex-1 [&>span]:truncate", className)}>
        <SelectValue placeholder="Select time" />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={EMPTY_VALUE}>{emptyLabel}</SelectItem>}
        {options.map((time) => (
          <SelectItem key={time} value={time}>
            {optionLabel(time)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
