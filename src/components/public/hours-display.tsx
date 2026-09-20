import { getHoursDisplay } from "@/lib/hours";

/**
 * Hours on a public place or business page. Shows a schedule as day and hours
 * rows (neighbouring days with the same hours share a row), a closed notice for
 * temporarily or permanently closed, and anything entered before the hours
 * selectors existed as the plain text it always was. Renders nothing when there
 * are no hours to show.
 */
export function HoursDisplay({ value }: Readonly<{ value: string | null }>) {
  const display = getHoursDisplay(value);
  if (!display) return null;

  if (display.kind === "text") {
    return <p className="text-base text-muted-foreground">{display.text}</p>;
  }

  if (display.kind === "status") {
    return <p className="text-base text-muted-foreground">{display.label}</p>;
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base">
      {display.rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-foreground">{row.label}</dt>
          <dd className="text-muted-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
