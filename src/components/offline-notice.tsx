import { WifiSlash } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useOfflineMeta } from "@/lib/offline/meta";
import { useOnline } from "@/lib/offline/status";
import { useQueueView } from "@/lib/offline/mine";
import { noticeText, queuedText } from "@/lib/offline/messages";
import { savedAt } from "@/lib/offline/rules";
import { cn } from "@/lib/utils";

/**
 * The offline notice, in the layout shell (offline-plan.md). Renders nothing
 * online. Height is the --offline-notice-height token (index.css), muted
 * tokens only. The shell makes room for it, so no page needs to know. While
 * the signed in user has writes waiting (Phase 8), it adds how many.
 */
export function OfflineNotice({ className }: Readonly<{ className?: string }>) {
  const online = useOnline();
  const meta = useOfflineMeta();
  const { session } = useAuth();
  const { pending } = useQueueView(session?.user.id);
  if (online) return null;

  // The Pasig download, or else the newest downloaded trail.
  const syncedAt = savedAt(meta);
  return (
    <output
      className={cn(
        "flex h-[var(--offline-notice-height)] shrink-0 items-center gap-2 border-b border-border bg-muted px-4 text-xs leading-4 text-muted-foreground",
        className
      )}
    >
      <WifiSlash className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="line-clamp-3">
        {noticeText(syncedAt)}
        {pending > 0 && ` ${queuedText(pending)}`}
      </p>
    </output>
  );
}
