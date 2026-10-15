import { Button } from "@/components/ui/button";
import { SquareLoader } from "@/components/public/square-loader";

/**
 * The Downloading state, shared by the Offline modal and the trail page button
 * (offline-plan.md, Modal states): spinner, percent, bar, Cancel. No percent
 * until the first count is known.
 */
export function OfflineProgress({
  done,
  total,
  onCancel,
}: Readonly<{ done: number; total: number; onCancel: () => void }>) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <SquareLoader size="sm" />
        <p className="text-sm">{percent === null ? "Downloading" : `Downloading ${percent}%`}</p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent ?? 0}%` }} />
      </div>
      <Button variant="outline" size="lg" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
