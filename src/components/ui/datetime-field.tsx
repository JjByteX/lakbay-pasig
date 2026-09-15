import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { TimeField } from "@/components/ui/time-field";
import { parseDateTimeLocalValue, toDateOnlyValue, toDateTimeLocalValue } from "@/lib/datetime";

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
 *
 * Type-or-click parity fix: the trigger used to be a single non-typable
 * button (click-only, no way to type a date), unlike Amkor's own
 * DatePicker.jsx, which pairs a real, typable native `<input type="date">`
 * with a calendar-icon button that opens the exact same native picker --
 * either path works. Rebuilt the same way here: the left side is now a
 * genuine `<input type="date">` (native mm/dd/yyyy entry, arrow-key
 * spinners, browser validation, all free), and the calendar-icon button on
 * the right still opens this component's own Calendar+TimeField popup
 * unchanged, since that popup is also where the time half of this field
 * lives (Amkor's own field is date-only, so it never had a paired time
 * control to preserve). Both paths write through the same commitDate /
 * onChange, so typing a date and picking one from the popup can never
 * disagree with each other.
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

  // Native date input's own onChange: fires with "YYYY-MM-DD" (or "" while
  // a partial value is still being typed/cleared) straight from the
  // browser, per the same `<input type="date">` contract Amkor's
  // DatePicker.jsx relies on. An empty/partial in-progress value is a
  // no-op here rather than clearing the field, matching commitDate's own
  // "keep the existing time, only replace the date part" behavior --
  // typing three of six digits shouldn't blank out an otherwise-valid
  // selection before the person finishes.
  function handleTypedDate(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return;
    const [year, month, day] = e.target.value.split("-").map(Number);
    if (!year || !month || !day) return;
    commitDate(new Date(year, month - 1, day));
  }

  function openPopup(e: React.MouseEvent) {
    e.preventDefault();
    if (disabled) return;
    setOpen((o) => !o);
  }

  const disabledDay = minDate
    ? (date: Date) => {
        const min = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
        return date < min;
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
        {/* Typable half: a real native date input, so a date can be typed
            directly (arrow keys, mm/dd/yyyy segments, browser validation)
            instead of only ever picked from the popup below -- the actual
            fix this component was missing relative to Amkor's own
            DatePicker.jsx. min mirrors the popup calendar's own
            disabledDay rule so the two paths can't disagree about which
            dates are selectable. */}
        <input
          id={id}
          type="date"
          value={selected ? toDateOnlyValue(selected) : ""}
          onChange={handleTypedDate}
          disabled={disabled}
          min={minDate ? toDateOnlyValue(minDate) : undefined}
          aria-invalid={ariaInvalid}
          className="h-full min-w-0 flex-1 bg-transparent px-3 py-1 text-sm text-foreground outline-none disabled:cursor-not-allowed [color-scheme:light] dark:[color-scheme:dark]"
        />
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        {/* Icon half: unchanged behavior, opens the same Calendar+TimeField
            popup as before -- still needed even with a typable date input
            since the popup is also where this field's time half lives. */}
        <button
          type="button"
          disabled={disabled}
          aria-label="Open calendar"
          aria-expanded={open}
          onClick={openPopup}
          className="flex h-full shrink-0 items-center justify-center px-3 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>
      {selected && (
        <p className="mt-1 truncate px-1 text-xs text-muted-foreground">
          {DISPLAY_FORMAT.format(selected)}
        </p>
      )}
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
