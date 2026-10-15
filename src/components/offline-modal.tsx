import { lazy, Suspense, useEffect, useState } from "react";
import { useOfflineModal } from "@/lib/offline-modal";

// The dialog pulls in the download code and every query file it reads, so it
// loads on first open and not with the first page. It stays mounted after that,
// which keeps the close animation and a running download's progress.
const OfflineDialog = lazy(() => import("@/components/offline-dialog"));

export function OfflineModal() {
  const { open } = useOfflineModal();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (open) setOpened(true);
  }, [open]);

  if (!opened) return null;
  return (
    <Suspense fallback={null}>
      <OfflineDialog />
    </Suspense>
  );
}
