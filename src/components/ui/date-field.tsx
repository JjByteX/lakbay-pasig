import * as React from "react";
import { Calendar as CalendarIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { parseDateValue, toDateOnlyValue } from "@/lib/datetime";

interface DateFieldProps {
  id?: string;
  value: string; // "YYYY-MM-DD", or "" when unset
  onChange: (value: string) => void;
  disabled?: boolean;
  minDate?: Date; // e.g. an end date blocked before its start date
  maxDate?: Date; // e.g. a "from" date blocked after its "to" date
  "aria-label"?: string; // for a field with no visible <label>, e.g. a toolbar filter
  align?: "left" | "right"; // which edge the popup lines up with; right for fields near the screen edge
  "aria-invalid"?: boolean;
  className?: string;
}

/**
 * Date only. Replaces datetime-field.tsx on the Announcements form, where
 * the date and the time are separate fields because an event always has a
 * date but not always a time (see lib/datetime.ts). Same two paths
 * datetime-field.tsx had: a real native date input to type into, and a
 * calendar icon that opens calendar.tsx in a popup. Both write the same
 * "YYYY-MM-DD" value.
 *
 * The browser's own calendar icon inside the input is hidden
 * ([&::-webkit-calendar-picker-indicator]:hidden): it opened the native
 * picker next to our own icon button, so there were two calendar icons side
 * by side. Typing still works; the icon button opens calendar.tsx.
 *
 * Used by the Announcements form, the Activity and review history date range
 * filters, and the profile's Date of Birth, so every date in the app is typed
 * or picked the same way. `value` is "YYYY-MM-DD" in all of them, the same
 * shape the native inputs gave, so callers' filtering did not change.
 *
 * The popup is w-max: it used to size to its half-width column, which
 * squeezed the calendar's seven day columns into each other.
 */
export function DateField({
  id,
  value,
  onChange,
  disabled = false,
  minDate,
  maxDate,
  "aria-label": ariaLabel,
  align = "left",
  "aria-invalid": ariaInvalid,
  className,
}: Readonly<DateFieldProps>) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selected = parseDateValue(value);

  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleTypedDate(e: React.ChangeEvent<HTMLInputElement>) {
    // A partial value while typing arrives as "": ignored, so typing three
    // of six digits does not blank an otherwise valid date.
    if (!e.target.value) return;
    onChange(e.target.value);
  }

  function handlePick(date: Date) {
    onChange(toDateOnlyValue(date));
    setOpen(false);
  }

  const disabledDay =
    minDate || maxDate
      ? (date: Date) => {
          if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
          if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
          return false;
        }
      : undefined;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-md border border-input bg-card text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring",
          ariaInvalid && "border-destructive",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <input
          id={id}
          type="date"
          value={value}
          onChange={handleTypedDate}
          disabled={disabled}
          min={minDate ? toDateOnlyValue(minDate) : undefined}
          max={maxDate ? toDateOnlyValue(maxDate) : undefined}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className="h-full min-w-0 flex-1 bg-transparent px-3 py-1 text-sm text-foreground outline-none disabled:cursor-not-allowed [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ? `Open calendar, ${ariaLabel}` : "Open calendar"}
          aria-expanded={open}
          onClick={() => !disabled && setOpen((o) => !o)}
          className="flex h-full shrink-0 items-center justify-center px-3 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 w-max max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <Calendar selected={selected} onSelect={handlePick} disabled={disabledDay} />
        </div>
      )}
    </div>
  );
}
