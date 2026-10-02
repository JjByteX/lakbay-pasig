import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { fetchNotificationQueues, type NotificationQueue } from "@/lib/admin-notifications";

/**
 * Pending-review counts for the admin sidebar's Places and Businesses rows
 * (and the phone header's menu button). Replaces the header bell, which
 * fetched these same two queues once on mount: the same fetch now lives
 * here, scoped by the same permission checks (admin-notifications.ts).
 *
 * Refetched on every admin navigation, not just on mount. The counts now sit
 * in the sidebar the whole time, so one that stays at 3 after you've just
 * verified a place and come back to the list would be visible and wrong. It
 * is two head-only count queries, no rows.
 *
 * null until the first answer, so callers show no badge while loading
 * instead of a flash of zero.
 */
export function useAdminNotificationQueues(): NotificationQueue[] | null {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const [queues, setQueues] = useState<NotificationQueue[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchNotificationQueues(profile).then((next) => {
      if (!cancelled) setQueues(next);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.staff_role, profile?.system_permission, pathname]);

  return queues;
}
