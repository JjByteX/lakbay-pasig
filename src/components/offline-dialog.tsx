import { useEffect, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { OfflineProgress } from "@/components/offline-progress";
import { useOfflineModal } from "@/lib/offline-modal";
import { useAuth } from "@/lib/auth-context";
import { readMeta, useOfflineMeta, writeMeta } from "@/lib/offline/meta";
import { clearDropped, useQueueView } from "@/lib/offline/mine";
import { useOnline } from "@/lib/offline/status";
import {
  cancelDownload,
  downloadAll,
  estimateDownloadBytes,
  removeDownload,
  removeTrail,
  type Progress,
} from "@/lib/offline/download";
import { formatSize, type TrailPack } from "@/lib/offline/rules";
import { FAIL_TEXT, NEEDS_CONNECTION, OFFLINE_LABEL, droppedText } from "@/lib/offline/messages";
import { formatDateTimeNoSeconds } from "@/lib/datetime";

// One downloaded trail, with its size and Remove (one tap, no confirm: it can
// be downloaded again from the trail page).
function TrailRow({ pack }: Readonly<{ pack: TrailPack }>) {
  const [removing, setRemoving] = useState(false);

  async function remove() {
    setRemoving(true);
    try {
      await removeTrail(pack.id);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{pack.name}</p>
        <p className="text-xs text-muted-foreground">{formatSize(pack.bytes)}</p>
      </div>
      <Button variant="outline" size="sm" loading={removing} onClick={() => void remove()}>
        Remove
      </Button>
    </li>
  );
}

/**
 * The Offline modal body (offline-plan.md, Modal states): Not downloaded,
 * Downloading, Downloaded, Offline and not downloaded, Failed. One label,
 * no subtitle. Below it, the downloaded trails (Phase 7.4). Loaded on first
 * open by offline-modal.tsx.
 */
export default function OfflineDialog() {
  const { open, closeOffline } = useOfflineModal();
  const meta = useOfflineMeta();
  const online = useOnline();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { dropped } = useQueueView(userId);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  const canDownload = meta.state === "idle" || meta.state === "failed";

  // The size shows on the Download button, so read it while that button is up.
  useEffect(() => {
    if (!open || !online || !canDownload) return;
    let cancelled = false;
    estimateDownloadBytes()
      .then((bytes) => {
        if (!cancelled) setSize(bytes);
      })
      .catch(() => {
        if (!cancelled) setSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, online, canDownload]);

  function start() {
    setProgress({ done: 0, total: 0 });
    void downloadAll(setProgress);
  }

  async function remove() {
    setRemoving(true);
    try {
      await removeDownload();
    } finally {
      setRemoving(false);
    }
  }

  const downloadLabel = (
    <>
      <DownloadSimple className="mr-2 h-4 w-4" aria-hidden="true" />
      Download
      {size !== null && <span className="ml-1 font-normal opacity-80">{formatSize(size)}</span>}
    </>
  );

  let body;
  if (meta.state === "downloading") {
    body = <OfflineProgress done={progress?.done ?? 0} total={progress?.total ?? 0} onCancel={cancelDownload} />;
  } else if (meta.state === "downloaded" && meta.syncedAt !== null) {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Last synced</p>
          <p className="text-sm font-medium">{formatDateTimeNoSeconds(new Date(meta.syncedAt))}</p>
        </div>
        <Button variant="outline" size="lg" loading={removing} onClick={() => void remove()}>
          Remove download
        </Button>
      </div>
    );
  } else if (!online) {
    body = (
      <div className="flex flex-col gap-2">
        <Button size="lg" disabled>
          {downloadLabel}
        </Button>
        <p className="text-xs text-muted-foreground">{NEEDS_CONNECTION}</p>
      </div>
    );
  } else if (meta.state === "failed") {
    body = <ErrorState onRetry={start}>{FAIL_TEXT[meta.reason ?? "unknown"]}</ErrorState>;
  } else {
    body = (
      <Button size="lg" onClick={start}>
        {downloadLabel}
      </Button>
    );
  }

  // Trails a sync found removed, and changes the server refused, show once and
  // clear when the modal closes.
  function handleOpenChange(next: boolean) {
    if (next) return;
    closeOffline();
    if (readMeta().gone.length > 0) writeMeta({ ...readMeta(), gone: [] });
    if (userId && dropped > 0) void clearDropped(userId);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{OFFLINE_LABEL}</DialogTitle>
          <DialogDescription className="sr-only">Download Pasig content to use without a connection.</DialogDescription>
        </DialogHeader>
        {body}
        {meta.gone.length > 0 && (
          <ul className="flex flex-col gap-1">
            {meta.gone.map((name, index) => (
              <li key={`${name}-${index}`} className="text-xs text-muted-foreground">
                {name}. {FAIL_TEXT.gone}
              </li>
            ))}
          </ul>
        )}
        {dropped > 0 && <p className="text-xs text-muted-foreground">{droppedText(dropped)}</p>}
        {meta.trails.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Trails</p>
            <ul className="flex max-h-60 flex-col gap-3 overflow-y-auto">
              {meta.trails.map((pack) => (
                <TrailRow key={pack.id} pack={pack} />
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
