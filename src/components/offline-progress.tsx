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
      <progress
        className="h-2 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-[width]"
        aria-label="Download progress"
        max={100}
        value={percent ?? undefined}
      />
      <Button variant="outline" size="lg" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
