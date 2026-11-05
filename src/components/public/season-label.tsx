import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarBlank } from "@phosphor-icons/react";
import {
  fetchSeasonality,
  hasSeasonality,
  peakMonthsLabel,
  peakWeeksLabel,
  slotsLabel,
  weekRuns,
  type Seasonality,
} from "@/lib/seasonality";
import { fetchPlaceOccasions } from "@/lib/seasonality-occasions";
import type { Occasion } from "@/lib/seasonality-reasons";

/**
 * Seasonality lines under a place or business header (seasonal-visits-plan.md,
 * Phases 2 and 3): busiest months, peak weeks, usual busy and quiet times, and
 * a heads-up for next week. Fetches its own label and renders nothing while
 * loading, when the place has no label yet, and on any error, so a new place
 * shows no empty state. Labels only, never counts. Worded "among Lakbay Pasig
 * visitors" because the data is app users only.
 *
 * Phase 4: for a place, a last line lists published fiestas and events linked
 * to it (related_place_id) that fall in its peak weeks or months, worded
 * "Around the same time" because timing is not proof. Fetched only once the
 * place has a label, so a place without one costs no extra request.
 */
export function SeasonLabel({ kind, itemId }: Readonly<{ kind: "place" | "business"; itemId: string }>) {
  const [info, setInfo] = useState<Seasonality | null>(null);
  const [occasions, setOccasions] = useState<Occasion[]>([]);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setOccasions([]);
    fetchSeasonality(kind, itemId)
      .then(async (s) => {
        if (cancelled) return;
        setInfo(s);
        // Fiestas and events link to places only.
        if (kind !== "place" || !hasSeasonality(s)) return;
        const found = await fetchPlaceOccasions(itemId, s.peakMonths, s.peakWeeks);
        if (!cancelled) setOccasions(found);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, itemId]);

  if (!hasSeasonality(info)) return null;

  const months = peakMonthsLabel(info.peakMonths);
  // Weeks only add detail when they are few. Many runs means a broad season
  // the months line already says.
  const weeks = weekRuns(info.peakWeeks).length <= 3 ? peakWeeksLabel(info.peakWeeks) : null;
  const busier = slotsLabel(info.busySlots);
  const quieter = slotsLabel(info.quietSlots);

  const lines: { key: string; text: string; value?: string }[] = [];
  if (months) lines.push({ key: "months", text: "Busiest in:", value: months });
  if (weeks) lines.push({ key: "weeks", text: "Peak weeks:", value: weeks });
  if (info.busierNextWeek) lines.push({ key: "next", text: "Likely busier than usual next week" });
  if (quieter) lines.push({ key: "quiet", text: "Usually quieter:", value: quieter });
  if (busier) lines.push({ key: "busy", text: "Usually busier:", value: busier });

  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      {lines.map((line, i) => (
        <p key={line.key} className="flex items-center gap-2">
          {i === 0 ? (
            <CalendarBlank className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {line.text}
            {line.value && <span className="ml-1 font-medium text-foreground">{line.value}</span>}
          </span>
        </p>
      ))}
      {occasions.length > 0 && (
        <p className="flex items-start gap-2">
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Around the same time:
            {occasions.map((o, i) => (
              <span key={`${o.kind}:${o.id}`}>
                {i > 0 && ","}{" "}
                <Link
                  to={`/${o.kind === "fiesta" ? "fiestas" : "events"}/${o.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {o.name}
                </Link>
                <span className="ml-1">({o.when})</span>
              </span>
            ))}
          </span>
        </p>
      )}
      <p className="pl-6 text-xs">Among Lakbay Pasig visitors</p>
    </div>
  );
}
