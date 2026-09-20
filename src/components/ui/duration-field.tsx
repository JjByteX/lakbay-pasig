import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_OPTIONS, resolveDuration } from "@/lib/hours";

// SelectItem can't carry an empty value, so "clear this" travels as this
// sentinel and is translated back to "" on the way out.
const CLEAR_VALUE = "__clear__";

interface DurationFieldProps {
  id?: string;
  value: string; // the stored column text, e.g. "1 hr 30 min"
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A length of time picked from a list (15 minutes to 12 hours) instead of typed
 * as free text. Used for a place's Estimated Visit Duration and a trail's
 * Estimated Duration.
 *
 * The stored value is the option's own readable text, the same shape
 * trail-card.tsx and trail-detail.tsx already print as-is. An older typed value
 * that reads as a plain duration ("2 hours") shows as its matching option. One
 * that doesn't, like the range "45 to 60 minutes", stays selectable as its own
 * choice until staff pick a real option, so nothing is lost by opening the form.
 */
export function DurationField({ id, value, onChange, className }: Readonly<DurationFieldProps>) {
  const { canonical, legacy } = resolveDuration(value);
  const selected = canonical ?? legacy ?? "";

  return (
    <Select value={selected} onValueChange={(next) => onChange(next === CLEAR_VALUE ? "" : next)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder="Select a duration" />
      </SelectTrigger>
      <SelectContent>
        {selected !== "" && <SelectItem value={CLEAR_VALUE}>Not set</SelectItem>}
        {legacy && <SelectItem value={legacy}>{legacy}</SelectItem>}
        {DURATION_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
