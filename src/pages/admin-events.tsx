import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDots, CaretLeft, CaretRight, DownloadSimple, Hourglass, Pencil, UploadSimple, Plus } from "@phosphor-icons/react";
import { bulkUpdateEvents, type BulkEventAction } from "@/lib/bulk-review";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BulkActionBar } from "@/components/admin/bulk-action-bar";
import { AdminIconAction, AdminIconActions } from "@/components/admin/admin-icon-action";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import EventFormDialog from "@/components/admin/event-form-dialog";
import { readEmbeddedName } from "@/lib/place-categories";
import { usePageTitle } from "@/lib/page-title";
import { formatDateTimeNoSeconds, hasTimeOfDay } from "@/lib/datetime";

// Phase 2.1: columns per step-4-phases.md, title, category,
// lifecycle_status badge, published badge, date_time. No review queue for
// events per admin-panel-spec.md, so sort by date_time, not a priority
// function like admin-businesses.tsx uses.
//
// Row actions (2.1/2.3): "Both live as row actions and inside the detail
// view" — event-form-dialog.tsx already has publish/unpublish and a
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
//
// Modal conversion: New/Edit no longer navigate to /admin/events/new or
// /admin/events/:id (that route and admin-event-detail.tsx are retired).
// Both open event-form-dialog.tsx over this list instead, matching
// admin-landing.tsx + slide-form-dialog.tsx's existing "list page owns a
// create/edit modal" shape -- the closest precedent in this codebase for a
// dialog with real form fields (category-form-dialog.tsx exists too, but
// has none of this form's date/place/toggle fields to borrow layout from).
// The ?event= search param keeps a shareable/refreshable deep link into a
// specific event's modal, since admin-search-bar.tsx's Announcements
// results and other in-app links still navigate to a single "open this
// event" URL rather than carrying dialog state across a route change.
//
// Row actions as icons (direct instruction): the three-dot menu is gone, on
// every admin table. Edit, Publish/Unpublish and Set status each show as
// their own icon button with a tooltip label on hover, from the shared
// src/components/admin/admin-icon-action.tsx. Set status keeps a small
// dropdown behind its icon, since it has three choices (upcoming, ongoing,
// past) and one icon cannot pick between them.
//
// Calendar / List (direct instruction): a segmented Calendar | List control
// sits in the toolbar, left of search, same slot and same Tabs primitive
// admin-categories.tsx uses for its type selector. Calendar is the default.
// List is the existing AdminDataTable, untouched. Calendar is a month grid
// built over the same `filtered` array, so the search box and both filters
// apply in either view. A multi-day event (end_date_time set) shows on every
// day it spans. Clicking an event opens the same edit modal as the table's
// Edit action. Hand-built against the native Date object like
// src/components/ui/calendar.tsx (that one is a date picker with no event
// content, so it is not reused here).
//
// Bulk actions: the List view opts into AdminDataTable's `selection`, the
// same checkbox column, select-scope prompt and discard-selection prompt
// Places and Businesses use, with the shared BulkActionBar for the actions.
// The actions are the row actions, batched: Publish, Unpublish and Set
// status (bulkUpdateEvents in bulk-review.ts). The Calendar has no
// checkboxes, so switching to it clears the selection rather than leaving
// checked rows behind a view that can't show them or guard leaving the page.

interface EventRow {
  id: string;
  title: string;
  category: string | null;
  date_time: string | null;
  end_date_time: string | null;
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

// What each bulk action applies to, and its wording. Selected rows already in
// the target state are skipped, and the dialog says so.
const BULK_ACTIONS: Record<
  BulkEventAction,
  { title: string; verb: string; appliesTo: (e: EventRow) => boolean; blurb: string }
> = {
  publish: {
    title: "Publish",
    verb: "Publish",
    appliesTo: (e) => !e.published,
    blurb: "Each announcement will be visible to the public.",
  },
  unpublish: {
    title: "Unpublish",
    verb: "Unpublish",
    appliesTo: (e) => e.published,
    blurb: "Each announcement will go back to Draft and be hidden from the public.",
  },
  upcoming: {
    title: "Set to upcoming",
    verb: "Set to upcoming",
    appliesTo: (e) => e.lifecycle_status !== "upcoming",
    blurb: "Each announcement's lifecycle status will be set to upcoming.",
  },
  ongoing: {
    title: "Set to ongoing",
    verb: "Set to ongoing",
    appliesTo: (e) => e.lifecycle_status !== "ongoing",
    blurb: "Each announcement's lifecycle status will be set to ongoing.",
  },
  past: {
    title: "Set to past",
    verb: "Set to past",
    appliesTo: (e) => e.lifecycle_status !== "past",
    blurb: "Each announcement's lifecycle status will be set to past.",
  },
};

type ViewMode = "calendar" | "list";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const TIME_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const MAX_CHIPS_PER_DAY = 3;
const MAX_SPAN_DAYS = 62;

// A date with no set time (stored as midnight) shows the date alone.
function formatEventDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return hasTimeOfDay(date) ? formatDateTimeNoSeconds(date) : date.toLocaleDateString();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Every local day an event touches, start day through end day. Capped so a
// bad end date years out cannot generate thousands of entries.
function eventDays(event: EventRow): Date[] {
  if (!event.date_time) return [];
  const start = startOfDay(new Date(event.date_time));
  const rawEnd = event.end_date_time ? startOfDay(new Date(event.end_date_time)) : start;
  const end = rawEnd < start ? start : rawEnd;
  const days: Date[] = [];
  for (let i = 0; i < MAX_SPAN_DAYS; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (day > end) break;
    days.push(day);
  }
  return days;
}

function chipClass(event: EventRow) {
  if (!event.published) return "border border-dashed border-border bg-card text-muted-foreground";
  if (event.lifecycle_status === "past") return "bg-muted text-muted-foreground";
  if (event.lifecycle_status === "ongoing") return "bg-accent text-accent-foreground";
  return "bg-primary/10 text-primary";
}

function EventsCalendar({
  events,
  onOpen,
}: Readonly<{
  events: EventRow[];
  onOpen: (id: string) => void;
}>) {
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const event of events) {
      for (const day of eventDays(event)) {
        const key = dayKey(day);
        const list = map.get(key);
        if (list) list.push(event);
        else map.set(key, [event]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.date_time ?? "").localeCompare(b.date_time ?? ""));
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = viewMonth.getDay();
    // Always six full weeks so the grid never changes height between months.
    return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - firstWeekday + i));
  }, [viewMonth]);

  function goToMonth(offset: number) {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-2">
        <span className="px-1 text-base font-semibold text-foreground">{MONTH_LABEL_FORMAT.format(viewMonth)}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToMonth(-1)}
            aria-label="Previous month"
          >
            <CaretLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
          >
            <CaretRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="min-w-[720px]">
          <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-border bg-card">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label} className="px-2 py-2 text-xs font-semibold text-muted-foreground">
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(7rem,auto)]">
            {cells.map((date, index) => {
              const key = dayKey(date);
              const inMonth = date.getMonth() === viewMonth.getMonth();
              const isToday = key === dayKey(today);
              const dayEvents = byDay.get(key) ?? [];
              const isExpanded = expanded.has(key);
              const visible = isExpanded ? dayEvents : dayEvents.slice(0, MAX_CHIPS_PER_DAY);
              const hiddenCount = dayEvents.length - visible.length;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex flex-col gap-1 border-b border-border p-1",
                    index % 7 !== 6 && "border-r",
                    !inMonth && "bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md text-xs",
                      inMonth ? "text-foreground" : "text-muted-foreground/60",
                      isToday && "bg-primary font-semibold text-primary-foreground"
                    )}
                    aria-current={isToday ? "date" : undefined}
                  >
                    {date.getDate()}
                  </span>
                  {visible.map((event) => {
                    const startsToday = event.date_time ? dayKey(new Date(event.date_time)) === key : false;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onOpen(event.id)}
                        title={event.title}
                        className={cn(
                          "w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs font-semibold transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          chipClass(event)
                        )}
                      >
                        {startsToday && event.date_time && hasTimeOfDay(new Date(event.date_time)) && (
                          <span className="font-normal">{TIME_FORMAT.format(new Date(event.date_time))} </span>
                        )}
                        {event.title}
                      </button>
                    );
                  })}
                  {(hiddenCount > 0 || (isExpanded && dayEvents.length > MAX_CHIPS_PER_DAY)) && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(key)}
                      className="w-full rounded-md px-1.5 py-0.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {isExpanded ? "Show less" : `+${hiddenCount} more`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// Extracted from a nested ternary (option === "all" ? ... : option ===
// "published" ? ... : ...) inline in the Published filter's option labels
// below.
function publishedFilterOptionLabel(option: (typeof PUBLISHED_OPTIONS)[number]): string {
  if (option === "all") return "All";
  if (option === "published") return "Published";
  return "Draft";
}

export default function AdminEventsPage() {
  usePageTitle("Announcements");
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<(typeof LIFECYCLE_FILTER_OPTIONS)[number]>("all");
  const [publishedFilter, setPublishedFilter] = useState<(typeof PUBLISHED_OPTIONS)[number]>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");

  // Bulk actions: checked ids (AdminDataTable's `selection`, remembered
  // across paging, sorting and filtering) and the confirm dialog the bar opens.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<BulkEventAction | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Modal conversion: dialog open/closed and which event it's editing
  // (null = New) both derive from the ?event= search param rather than
  // separate useState, so a deep link (admin-search-bar.tsx's Announcements
  // result, a bookmarked URL) opens the right event's modal on load, and
  // closing/saving clears the param the same way it was set -- one source
  // of truth instead of two that could drift apart.
  const eventParam = searchParams.get("event");
  const dialogOpen = eventParam !== null;
  const editingEventId = eventParam && eventParam !== "new" ? eventParam : null;

  function openNew() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("event", "new");
      return next;
    });
  }

  function openEdit(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("event", id);
      return next;
    });
  }

  function closeDialog() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("event");
      return next;
    });
  }

  function load() {
    // Category Directory Phase 1.10: category is now a joined event_
    // categories.name (migration 0024), flattened below so EventRow's
    // own category field stays string | null, unchanged.
    return supabase
      .from("events")
      .select("id, title, date_time, end_date_time, lifecycle_status, published, event_categories(name)")
      .order("date_time", { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        const rows = (data ?? []) as (Omit<EventRow, "category"> & {
          event_categories: { name: string } | { name: string }[] | null;
        })[];
        setEvents(
          rows.map(({ event_categories, ...rest }) => ({
            ...rest,
            category: readEmbeddedName(event_categories),
          }))
        );
      });
  }

  useEffect(() => {
    load();
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

  // Selection survives filtering, so some checked rows can be out of view.
  // A bulk action still reaches every checked row it applies to, so say how
  // many are hidden.
  const visibleIds = new Set(filtered.map((e) => e.id));
  const hiddenSelected = [...selectedIds].filter((id) => !visibleIds.has(id)).length;
  const selectedRows = (events ?? []).filter((e) => selectedIds.has(e.id));
  const countFor = (action: BulkEventAction) => selectedRows.filter(BULK_ACTIONS[action].appliesTo).length;

  function openBulkDialog(action: BulkEventAction) {
    setBulkAction(action);
    setBulkError(null);
  }

  async function handleBulkSubmit() {
    if (!bulkAction) return;
    const targets = selectedRows.filter(BULK_ACTIONS[bulkAction].appliesTo);
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      await bulkUpdateEvents({ action: bulkAction, ids: targets.map((e) => e.id) });
      const done = new Set(targets.map((e) => e.id));
      setEvents((prev) =>
        (prev ?? []).map((e) => {
          if (!done.has(e.id)) return e;
          if (bulkAction === "publish") return { ...e, published: true };
          if (bulkAction === "unpublish") return { ...e, published: false };
          return { ...e, lifecycle_status: bulkAction };
        })
      );
      setSelectedIds(new Set());
      setBulkAction(null);
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : "Could not save the changes.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  function changeViewMode(next: ViewMode) {
    if (next === "calendar") setSelectedIds(new Set());
    setViewMode(next);
  }

  const bulkTargetCount = bulkAction ? countFor(bulkAction) : 0;
  const bulkSkipped = selectedIds.size - bulkTargetCount;
  let bulkSubmitLabel = bulkAction ? BULK_ACTIONS[bulkAction].verb : "";
  if (bulkSubmitting) bulkSubmitLabel = "Submitting…";

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
      render: (event) => formatEventDate(event.date_time),
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
        <AdminIconActions>
          <AdminIconAction
            icon={Pencil}
            label="Edit"
            onClick={() => openEdit(event.id)}
            disabled={updatingId === event.id}
          />
          <AdminIconAction
            icon={event.published ? DownloadSimple : UploadSimple}
            label={event.published ? "Unpublish" : "Publish"}
            onClick={() => handleTogglePublished(event)}
            disabled={updatingId === event.id}
          />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={updatingId === event.id}
                    aria-label="Set status"
                  >
                    <Hourglass className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Set status</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
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
            </DropdownMenuContent>
          </DropdownMenu>
        </AdminIconActions>
      ),
    },
  ];

  const toolbar = (
    <AdminFilterBar>
      <Tabs value={viewMode} onValueChange={(v) => changeViewMode(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>
      </Tabs>
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
              {publishedFilterOptionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AdminFilterBar>
  );

  return (
    <div className="relative flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Announcements</h1>
        <Button onClick={openNew} className="gap-1 pl-3.5">
          <Plus weight="bold" className="h-3.5 w-3.5" aria-hidden="true" />
          New Event
        </Button>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {viewMode === "list" ? (
        <AdminDataTable
          columns={columns}
          rows={filtered}
          loading={events === null}
          keyField="id"
          autoPageSize
          selection={{ selectedIds, onChange: setSelectedIds }}
          emptyIcon={CalendarDots}
          empty={events && events.length > 0 ? "Matching events will appear here." : "Events will appear here."}
          toolbar={toolbar}
        />
      ) : (
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
          <div className="shrink-0 border-b border-border p-2">{toolbar}</div>
          {events === null ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <EventsCalendar events={filtered} onOpen={openEdit} />
          )}
        </div>
      )}

      <BulkActionBar
        count={selectedIds.size}
        detail={hiddenSelected > 0 ? `${hiddenSelected} hidden by filters` : undefined}
        onClear={() => setSelectedIds(new Set())}
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={countFor("unpublish") === 0}
          onClick={() => openBulkDialog("unpublish")}
        >
          <DownloadSimple className="h-4 w-4" />
          Unpublish ({countFor("unpublish")})
        </Button>
        <Button
          size="sm"
          className="gap-1"
          disabled={countFor("publish") === 0}
          onClick={() => openBulkDialog("publish")}
        >
          <UploadSimple className="h-4 w-4" />
          Publish ({countFor("publish")})
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Hourglass className="h-4 w-4" />
              Set status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LIFECYCLE_STATUSES.map((status) => (
              <DropdownMenuItem
                key={status}
                disabled={countFor(status) === 0}
                onSelect={() => openBulkDialog(status)}
              >
                {status} ({countFor(status)})
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </BulkActionBar>

      <Dialog open={bulkAction !== null} onOpenChange={(open) => !open && !bulkSubmitting && setBulkAction(null)}>
        <DialogContent>
          {bulkAction && (
            <DialogHeader>
              <DialogTitle>
                {BULK_ACTIONS[bulkAction].title} {bulkTargetCount}{" "}
                {bulkTargetCount === 1 ? "announcement" : "announcements"}?
              </DialogTitle>
              <DialogDescription>
                {BULK_ACTIONS[bulkAction].blurb}
                {bulkSkipped > 0 &&
                  ` ${bulkSkipped} of your ${selectedIds.size} selected ${
                    bulkSkipped === 1 ? "doesn't" : "don't"
                  } apply and will be left as is.`}
              </DialogDescription>
            </DialogHeader>
          )}

          {bulkError && <p className="text-sm text-destructive">{bulkError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)} disabled={bulkSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleBulkSubmit} disabled={bulkSubmitting || bulkTargetCount === 0} loading={bulkSubmitting}>
              {bulkSubmitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) closeDialog();
        }}
        eventId={editingEventId}
        onSaved={load}
      />
    </div>
  );
}
