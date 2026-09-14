import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchNotificationQueues, totalPending, type NotificationQueue } from "@/lib/admin-notifications";

// Notification icon (Phase 4.3): bell, left of the profile icon per the
// request. Reading admin-sidebar.tsx directly first (constraints.md's File
// Traversal rule) confirmed the profile/account control actually lives in
// the sidebar footer, not the header -- admin.tsx's header has no profile
// icon to sit left of today. Placed at the header's top right regardless,
// matching ux-ui-guidelines.md's "settings and account controls sit top
// right" convention the same way admin-sidebar.tsx's own footer already
// does, immediately next to AdminSearchBar (3.4's "next to where
// notification and profile will sit"). Left-of-profile ordering applies
// the moment a header-level profile control is ever added; not invented
// here since that's outside this phase's own scope.
//
// 4.4: DropdownMenu (Radix, trigger-driven/click-to-open) rather than
// AdminSearchBar's plain positioned div -- that div's shape exists
// specifically for a type-as-you-go panel with no natural trigger click,
// which doesn't apply here (4.4 explicitly asks for a click-opened
// dropdown), and DropdownMenu is already used for exactly this job by
// public-shell.tsx's AccountMenu, per constraints.md's Inventory Before
// Suggesting rule -- reused rather than a second custom panel.
export function AdminNotificationBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [queues, setQueues] = useState<NotificationQueue[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationQueues(profile).then((next) => {
      if (!cancelled) setQueues(next);
    });
    return () => {
      cancelled = true;
    };
    // profile?.id: re-fetch on a real account change, not on every
    // profile object reference change (e.g. a theme_preference save
    // elsewhere would otherwise refire this unnecessarily).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.staff_role, profile?.system_permission]);

  const pending = queues ? totalPending(queues) : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {/* 4.7: badge color from the existing destructive token, same
              red already used for admin-business-detail.tsx's reject
              state -- not a new color for "needs attention." Only shown
              above zero per 4.3. */}
          {pending > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {queues === null && (
          <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
        )}
        {/* 4.6: one clear empty message when every permitted queue is at
            zero -- not shown at all while a queue list with all-zero
            counts is still a meaningful list (the queues exist, they're
            just caught up), per ux-ui-guidelines.md's Label Rules against
            repeating the same message twice; a single line replaces the
            row list rather than sitting above an empty one. */}
        {queues !== null && queues.length > 0 && pending === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">All caught up, nothing pending.</p>
        )}
        {queues !== null && queues.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">No queues assigned yet.</p>
        )}
        {queues !== null &&
          pending > 0 &&
          queues.map((queue) => (
            <DropdownMenuItem key={queue.key} onClick={() => navigate(queue.route)}>
              <span className="flex-1">{queue.label}</span>
              <span className="text-xs text-muted-foreground">
                {queue.count} pending
              </span>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
