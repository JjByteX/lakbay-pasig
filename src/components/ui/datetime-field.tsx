import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { TimeField } from "@/components/ui/time-field";
import { parseDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/datetime";

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface DateTimeFieldProps {
  id?: string;
  value: string; // "YYYY-MM-DDTHH:mm", same shape every datetime-local input in this codebase already used
  onChange: (value: string) => void;
  disabled?: boolean;
  minDate?: Date; // e.g. an end-date field blocked before its start date, 5.6
  "aria-invalid"?: boolean;
  className?: string;
}

/**
 * Phase 5.5: replaces a native `type="datetime-local"` Input, wiring
 * calendar.tsx and time-field.tsx together behind one trigger. Value stays
 * the exact "YYYY-MM-DDTHH:mm" string every datetime-local input in this
 * codebase already produced (lib/datetime.ts), so the calling form's own
 * validation (e.g. admin-event-detail.tsx's endBeforeStart, `new
 * Date(form.end_date_time) <= new Date(form.date_time)`) and save payload
 * (`new Date(form.date_time).toISOString()`) both keep working unchanged.
 *
 * Dropdown is a plain absolutely-positioned panel with pointerdown/Escape
 * dismissal, the same hand-rolled pattern global-search-bar.tsx's dropdown
 * already established -- no Popover primitive exists in this codebase to
 * reach for instead (see calendar.tsx's own header comment), and this
 * session runs no npm install.
 */
export function DateTimeField({
  id,
  value,
  onChange,
  disabled = false,
  minDate,
  "aria-invalid": ariaInvalid,
  className,
}: Readonly<DateTimeFieldProps>) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selected = parseDateTimeLocalValue(value);

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

  function commitDate(date: Date) {
    const base = selected ?? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0);
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), base.getHours(), base.getMinutes());
    onChange(toDateTimeLocalValue(next));
  }

  function commitTime(hour24: number, minuteValue: number) {
    const base = selected ?? new Date();
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour24, minuteValue);
    onChange(toDateTimeLocalValue(next));
  }

  const disabledDay = minDate
    ? (date: Date) => {
        const min = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
        return date < min;
      }
    : undefined;

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          ariaInvalid && "border-destructive",
          className
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? DISPLAY_FORMAT.format(selected) : "Select date and time"}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 flex flex-col gap-2 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md sm:flex-row">
          <Calendar selected={selected} onSelect={commitDate} disabled={disabledDay} />
          <div className="flex flex-col gap-1 border-t border-border pt-2 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
            <TimeField
              hour24={selected ? selected.getHours() : -1}
              minute={selected ? selected.getMinutes() : -1}
              onChange={commitTime}
            />
          </div>
        </div>
      )}
    </div>
  );
}
