import { useEffect, useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";

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
//
// Search row, lifecycle/published filters, sortable columns, and
// pagination: ported from amkor-ims's DataTable.jsx + FilterStrip.jsx into
// AdminDataTable/AdminFilterBar (src/components/admin/), filtered client
// side over the already-fetched `events` array. The initial date_time
// ascending order from the Supabase query stays the default row order
// (AdminDataTable only re-sorts once a column header is clicked).

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
const LIFECYCLE_FILTER_OPTIONS = ["all", ...LIFECYCLE_STATUSES] as const;
const PUBLISHED_OPTIONS = ["all", "published", "draft"] as const;

export default function AdminEventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<(typeof LIFECYCLE_FILTER_OPTIONS)[number]>("all");
  const [publishedFilter, setPublishedFilter] = useState<(typeof PUBLISHED_OPTIONS)[number]>("all");

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

  const filtered = useMemo(() => {
    if (!events) return [];
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (query && !event.title.toLowerCase().includes(query) && !(event.category ?? "").toLowerCase().includes(query)) {
        return false;
      }
      if (lifecycleFilter !== "all" && event.lifecycle_status !== lifecycleFilter) return false;
      if (publishedFilter !== "all") {
        const isPublished = publishedFilter === "published";
        if (event.published !== isPublished) return false;
      }
      return true;
    });
  }, [events, search, lifecycleFilter, publishedFilter]);

  const columns: AdminColumn<EventRow>[] = [
    {
      key: "title",
      label: "Title",
      render: (event) => <span className="font-semibold text-foreground">{event.title}</span>,
    },
    { key: "category", label: "Category", render: (event) => event.category ?? "—" },
    {
      key: "date_time",
      label: "Date & Time",
      render: (event) => (event.date_time ? new Date(event.date_time).toLocaleString() : "—"),
    },
    {
      key: "lifecycle_status",
      label: "Lifecycle Status",
      render: (event) => <Badge variant={LIFECYCLE_VARIANT[event.lifecycle_status]}>{event.lifecycle_status}</Badge>,
    },
    {
      key: "published",
      label: "Published",
      render: (event) => (
        <Badge variant={event.published ? "default" : "outline"}>{event.published ? "Published" : "Draft"}</Badge>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (event) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updatingId === event.id}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/admin/events/${event.id}`)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTogglePublished(event)}>
              {event.published ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Set status</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={event.lifecycle_status}
                  onValueChange={(v) => handleLifecycleChange(event, v as (typeof LIFECYCLE_STATUSES)[number])}
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
      ),
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Events & Announcements</h1>
        <Button onClick={() => navigate("/admin/events/new")}>New Event</Button>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={events === null}
        keyField="id"
        autoPageSize
        empty={events && events.length > 0 ? "No events match your search and filters." : "No events yet."}
        toolbar={
          <AdminFilterBar>
            <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by title or category…" />
            <Select value={lifecycleFilter} onValueChange={(v) => setLifecycleFilter(v as typeof lifecycleFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Lifecycle status" />
              </SelectTrigger>
              <SelectContent>
                {LIFECYCLE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All statuses" : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={publishedFilter} onValueChange={(v) => setPublishedFilter(v as typeof publishedFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Published" />
              </SelectTrigger>
              <SelectContent>
                {PUBLISHED_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All" : option === "published" ? "Published" : "Draft"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterBar>
        }
      />
    </div>
  );
}
