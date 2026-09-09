import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Phase 2.1: columns per step-4-phases.md, title, category,
// lifecycle_status badge, published badge, date_time. No review queue for
// events per admin-panel-spec.md, so sort by date_time, not a priority
// function like admin-businesses.tsx uses.
//
// Row actions (2.1/2.3): "Both live as row actions and inside the detail
// view" — admin-event-detail.tsx already has publish/unpublish and a
// lifecycle_status control, this list page was missing its half. Mirrors
// admin-trails.tsx's row-action publish/unpublish shape (dropdown item +
// inline error line above the table) per constraints.md's Inventory Before
// Suggesting rule, extended with a lifecycle_status submenu since events
// have a second, independent status Trails doesn't.

interface EventRow {
  id: string;
  title: string;
  category: string | null;
  date_time: string | null;
  lifecycle_status: "upcoming" | "ongoing" | "past";
  published: boolean;
}

const LIFECYCLE_VARIANT = {
  upcoming: "secondary",
  ongoing: "accent",
  past: "outline",
} as const;

const LIFECYCLE_STATUSES = ["upcoming", "ongoing", "past"] as const;

export default function AdminEventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("events")
      .select("id, title, category, date_time, lifecycle_status, published")
      .order("date_time", { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (!cancelled) setEvents((data ?? []) as EventRow[]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2.3: "Publish toggles `published` boolean" — a separate control from
  // lifecycle_status below, not one combined action.
  async function handleTogglePublished(event: EventRow) {
    setActionError(null);
    setUpdatingId(event.id);
    const nextPublished = !event.published;

    const { error } = await supabase
      .from("events")
      .update({ published: nextPublished, updated_at: new Date().toISOString() })
      .eq("id", event.id);

    setUpdatingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setEvents((prev) =>
      (prev ?? []).map((e) => (e.id === event.id ? { ...e, published: nextPublished } : e))
    );
  }

  // 2.3: "Lifecycle_status ... is a separate manual set by staff, no
  // auto-compute from date_time exists in schema."
  async function handleLifecycleChange(event: EventRow, nextStatus: (typeof LIFECYCLE_STATUSES)[number]) {
    if (nextStatus === event.lifecycle_status) return;
    setActionError(null);
    setUpdatingId(event.id);

    const { error } = await supabase
      .from("events")
      .update({ lifecycle_status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", event.id);

    setUpdatingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setEvents((prev) =>
      (prev ?? []).map((e) => (e.id === event.id ? { ...e, lifecycle_status: nextStatus } : e))
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Events & Announcements</h1>
        <Button onClick={() => navigate("/admin/events/new")}>New Event</Button>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {events === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Date &amp; Time</TableHead>
              <TableHead>Lifecycle Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-semibold text-foreground">{event.title}</TableCell>
                <TableCell>{event.category ?? "—"}</TableCell>
                <TableCell>
                  {event.date_time ? new Date(event.date_time).toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={LIFECYCLE_VARIANT[event.lifecycle_status]}>
                    {event.lifecycle_status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={event.published ? "default" : "outline"}>
                    {event.published ? "Published" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={updatingId === event.id}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/admin/events/${event.id}`)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleTogglePublished(event)}>
                        {event.published ? "Unpublish" : "Publish"}
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Set status</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={event.lifecycle_status}
                            onValueChange={(v) =>
                              handleLifecycleChange(event, v as (typeof LIFECYCLE_STATUSES)[number])
                            }
                          >
                            {LIFECYCLE_STATUSES.map((s) => (
                              <DropdownMenuRadioItem key={s} value={s}>
                                {s}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
