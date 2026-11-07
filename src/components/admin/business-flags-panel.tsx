import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchOpenFlags, resolveFlag, type OpenFlag } from "@/lib/business-reports";
import { formatDateTimeNoSeconds } from "@/lib/datetime";

/**
 * Build-order step 10: the open reports on one business, for staff with
 * review_businesses. Shows nothing when there are none. Resolving only marks
 * the flag resolved (the list page's Flagged badge then clears); changing the
 * listing itself is still the normal edit or review.
 */
export function BusinessFlagsPanel({ businessId }: Readonly<{ businessId: string }>) {
  const [flags, setFlags] = useState<OpenFlag[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOpenFlags(businessId)
      .then((rows) => {
        if (!cancelled) setFlags(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load reports for this listing.");
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function handleResolve(flagId: string) {
    setBusyId(flagId);
    setError(null);
    try {
      await resolveFlag(flagId);
      setFlags((prev) => prev.filter((flag) => flag.id !== flagId));
    } catch {
      setError("Couldn't resolve that report. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (flags.length === 0 && !error) return null;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Reports ({flags.length})</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="flex flex-col gap-2">
        {flags.map((flag) => (
          <li key={flag.id} className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="break-words text-sm text-foreground">{flag.flag_reason}</span>
              <span className="text-xs text-muted-foreground">
                {flag.flagged_by === null ? "Flagged automatically" : "Reported by a user"} ·{" "}
                {formatDateTimeNoSeconds(flag.created_at)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleResolve(flag.id)}
              disabled={busyId === flag.id}
              loading={busyId === flag.id}
            >
              Resolve
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
