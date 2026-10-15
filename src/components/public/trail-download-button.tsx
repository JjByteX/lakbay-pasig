import { useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { OfflineProgress } from "@/components/offline-progress";
import { useOfflineMeta } from "@/lib/offline/meta";
import { useOnline } from "@/lib/offline/status";
import { cancelTrailDownload, useTrailJob } from "@/lib/offline/trail-jobs";
import { estimateTrailBytes, formatSize } from "@/lib/offline/rules";
import { FAIL_TEXT, NEEDS_CONNECTION } from "@/lib/offline/messages";
import type { TrailDetail } from "@/lib/trail-types";

/**
 * "Download this trail" on the trail page (offline-plan.md, Trail downloads).
 * The same five states as the Offline modal: Download with its size,
 * Downloading with progress and Cancel, Downloaded with Remove, Download
 * disabled offline, Failed with Retry. Guests and signed in users alike: the
 * download stores what a Guest sees, so a personal trail (only its owner can
 * read it) never gets this button (trail-detail.tsx).
 *
 * The download code loads when the button is tapped, not with the page.
 */
export function TrailDownloadButton({ trail }: Readonly<{ trail: TrailDetail }>) {
  const meta = useOfflineMeta();
  const online = useOnline();
  const job = useTrailJob(trail.id);
  const [removing, setRemoving] = useState(false);

  const pack = meta.trails.find((p) => p.id === trail.id);
  const size = estimateTrailBytes({
    stops: trail.stops.length,
    entryPhotos: trail.stops.reduce((n, s) => n + s.discoveryContent.filter((e) => e.photoUrl).length, 0),
  });

  function start() {
    void import("@/lib/offline/download").then((m) => m.downloadTrail(trail.id)).catch(() => undefined);
  }

  async function remove() {
    setRemoving(true);
    try {
      const m = await import("@/lib/offline/download");
      await m.removeTrail(trail.id);
    } finally {
      setRemoving(false);
    }
  }

  if (job?.status === "downloading") {
    return <OfflineProgress done={job.done} total={job.total} onCancel={() => cancelTrailDownload(trail.id)} />;
  }

  if (pack) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Downloaded · {formatSize(pack.bytes)}</p>
        <Button type="button" variant="outline" loading={removing} onClick={() => void remove()} className="w-full">
          Remove download
        </Button>
      </div>
    );
  }

  const downloadLabel = (
    <>
      <DownloadSimple className="mr-2 h-4 w-4" aria-hidden="true" />
      Download
      <span className="ml-1 font-normal opacity-80">{formatSize(size)}</span>
    </>
  );

  if (!online) {
    return (
      <div className="flex flex-col gap-1">
        <Button type="button" variant="outline" disabled className="w-full">
          {downloadLabel}
        </Button>
        <p className="text-xs text-muted-foreground">{NEEDS_CONNECTION}</p>
      </div>
    );
  }

  if (job?.status === "failed") {
    return <ErrorState onRetry={start}>{FAIL_TEXT[job.reason ?? "unknown"]}</ErrorState>;
  }

  return (
    <Button type="button" variant="outline" onClick={start} className="w-full">
      {downloadLabel}
    </Button>
  );
}
