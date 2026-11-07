import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarBlank, CaretRight, CheckCircle, ChartLineUp, ClipboardText, type Icon } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import type { SystemPermission } from "@/lib/auth-types";
import { usePageTitle } from "@/lib/page-title";
import { useAutoPageSize } from "@/hooks/use-auto-page-size";
import {
  RANGES,
  daysSince,
  deltaLabel,
  fetchActivity,
  fetchComingUp,
  fetchOverview,
  fetchReviewTimes,
  fetchTopVisited,
  fetchVisits,
  timeAgo,
  toTrend,
  type ActivityRow,
  type ComingUpItem,
  type DashboardPerms,
  type Overview,
  type Queue,
  type RangeDays,
  type Trend,
  type VisitRow,
} from "@/lib/admin-dashboard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AreaChart, Meter, PaneGroup, Sparkline } from "@/components/admin/dashboard-widgets";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Admin dashboard. Fits the viewport on a wide screen (admin.tsx lists "/admin"
// in BOUNDED_LIST_ROUTES) and scrolls on a narrow one.
//
// Order follows project-foundation/ux-ui-guidelines.md: what needs action
// first, then trends, then the reference log. Left column is the work (queues,
// what is coming up), right column is the record (trend, activity), so the
// wide data side balances the sidebar and the narrow action rail on the left.
//
//   header          title and date              date range
//   summary strip   no card, up to 4 figures, a horizontal line underneath
//   one card        left (4) Needs attention over Coming up, right (8) Daily
//                   trend over Recent activity, split by a hairline
//
// Every panel is permission gated like the sidebar. A panel a person cannot use
// is left out, and a row with one panel gives it the full width.

const WIDE_QUERY = "(min-width: 1280px)";
// A queue untouched this long is flagged as late.
const STALE_DAYS = 7;

interface Load<T> {
  data: T | null;
  error: boolean;
}

// Runs `load` when `key` changes. The previous result stays on screen while the
// next one loads, so changing the date range does not flash the page empty.
function useLoad<T>(load: (() => Promise<T>) | null, key: string): Load<T> {
  const [state, setState] = useState<Load<T>>({ data: null, error: false });
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const run = loadRef.current;
    if (!run) return;
    let cancelled = false;
    run().then(
      (data) => !cancelled && setState({ data, error: false }),
      () => !cancelled && setState((prev) => ({ ...prev, error: true }))
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide;
}

function plural(n: number, one: string, other: string): string {
  return `${n.toLocaleString("en-PH")} ${n === 1 ? one : other}`;
}

function ageLabel(days: number): string {
  if (days === 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

// ---------------------------------------------------------------- summary strip

function Figure({
  label,
  value,
  pill,
  pillHint,
  note,
  trend,
  trendLabel,
  meter,
}: Readonly<{
  label: string;
  value: string;
  pill?: string | null;
  pillHint?: string;
  note?: string;
  trend?: number[];
  trendLabel?: string;
  meter?: { value: number; label: string };
}>) {
  const rising = pill === "New" || pill?.startsWith("+");
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-1 px-4 py-4 first:pl-0 last:pr-0",
        // The strip has no card. Lines run edge to edge of the strip.
        // Stacked: a line under every figure but the last.
        "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border last:after:hidden",
        // Two columns: no bottom line on the last row.
        "md:max-xl:[&:nth-last-child(2):nth-child(odd)]:after:hidden",
        // One row: no lines between figures.
        "xl:after:hidden"
      )}
    >
      <div className="flex h-6 items-center justify-between gap-2">
        <h3 className="truncate text-sm text-muted-foreground">{label}</h3>
        {pill && (
          <Badge variant={rising ? "info" : "muted"} title={pillHint} aria-label={pillHint ? `${pill}, ${pillHint}` : pill}>
            {pill}
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-semibold leading-8 text-foreground">{value}</p>
        {trend && <Sparkline values={trend} label={trendLabel ?? `${label} per day`} />}
        {meter && (
          <div className="w-24 shrink-0">
            <Meter value={meter.value} label={meter.label} />
          </div>
        )}
      </div>
      {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

const STRIP_COLUMNS = ["", "xl:grid-cols-1", "xl:grid-cols-2", "xl:grid-cols-3", "xl:grid-cols-4"];

// ---------------------------------------------------------------- summary figures

function lastDays(trend: Trend | null, days: number): string | undefined {
  return trend ? `Last ${days} days` : undefined;
}

function visitsNote(top: { name: string; visits: number } | null | undefined, trend: Trend | null, days: number): string | undefined {
  if (top) return `Most visited: ${top.name}, ${top.visits}`;
  return lastDays(trend, days);
}

function listingScope(canPlaces: boolean, canBusinesses: boolean): string {
  if (canPlaces && canBusinesses) return "listings";
  return canPlaces ? "places" : "businesses";
}

function trendFigure({
  id,
  label,
  trend,
  days,
  note,
}: Readonly<{ id: string; label: string; trend: Trend | null; days: number; note: string | undefined }>) {
  return (
    <Figure
      key={id}
      label={label}
      value={trend ? trend.current.toLocaleString("en-PH") : "–"}
      pill={trend ? deltaLabel(trend.current, trend.previous) : null}
      pillHint={`compared with the previous ${days} days`}
      note={note}
      trend={trend?.series.map((p) => p.value)}
      trendLabel={`${label} per day, last ${days} days`}
    />
  );
}

function verifiedFigure({ verified, total }: { verified: number; total: number }, scope: string) {
  const pct = total === 0 ? 0 : Math.round((verified / total) * 100);
  return (
    <Figure
      key="verified"
      label="Verified listings"
      value={`${pct}%`}
      meter={{ value: pct, label: `${pct}% of ${scope} verified` }}
      note={`${verified.toLocaleString("en-PH")} of ${total.toLocaleString("en-PH")} ${scope}`}
    />
  );
}

function countFigure(key: string, label: string, count: number, drafts: number) {
  return <Figure key={key} label={label} value={count.toLocaleString("en-PH")} note={plural(drafts, "draft", "drafts")} />;
}

function contentFigures(content: Overview | null, perms: DashboardPerms): ReactNode[] {
  const figures: ReactNode[] = [];
  if (content?.verified) {
    figures.push(verifiedFigure(content.verified, listingScope(perms.canPlaces, perms.canBusinesses)));
  }
  if (content?.announcements) {
    figures.push(countFigure("announcements", "Live announcements", content.announcements.live, content.announcements.drafts));
  }
  if (content?.trails) {
    figures.push(countFigure("trails", "Published trails", content.trails.published, content.trails.drafts));
  }
  return figures;
}

interface DashboardData {
  overview: Load<Overview>;
  reviews: Load<string[]>;
  visits: Load<{ rows: VisitRow[]; top: { name: string; visits: number } | null }>;
  comingUp: Load<ComingUpItem[]>;
  activity: Load<ActivityRow[]>;
  reviewTrend: Trend | null;
  visitTrend: Trend | null;
}

function summaryFigures(perms: DashboardPerms, days: number, data: DashboardData): ReactNode[] {
  const figures: ReactNode[] = [];
  if (perms.isAdmin) {
    const note = visitsNote(data.visits.data?.top, data.visitTrend, days);
    figures.push(trendFigure({ id: "visits", label: "Visits", trend: data.visitTrend, days, note }));
  }
  if (perms.canPlaces || perms.canBusinesses) {
    figures.push(trendFigure({ id: "reviews", label: "Reviews", trend: data.reviewTrend, days, note: lastDays(data.reviewTrend, days) }));
  }
  figures.push(...contentFigures(data.overview.data, perms));
  return figures.slice(0, 4);
}

// ---------------------------------------------------------------- needs attention

interface AttentionRow {
  key: string;
  label: string;
  note: string | null;
  count: number;
  stale: boolean;
  to: string;
}

function queueRow(
  key: string,
  one: string,
  other: string,
  to: string,
  queue: Queue,
  extra?: string
): AttentionRow | null {
  if (queue.count === 0) return null;
  const age = queue.oldest ? daysSince(queue.oldest) : 0;
  return {
    key,
    label: `${plural(queue.count, one, other)} awaiting review`,
    note: [queue.oldest ? `Oldest edited ${ageLabel(age)}` : null, extra].filter(Boolean).join(", ") || null,
    count: queue.count,
    stale: age >= STALE_DAYS,
    to,
  };
}

function draftRow(key: string, one: string, other: string, to: string, drafts: number | undefined): AttentionRow | null {
  if (!drafts || drafts <= 0) return null;
  return { key, label: plural(drafts, one, other), note: "Not published", count: drafts, stale: false, to };
}

function feedbackRow(feedback: Queue | null | undefined): AttentionRow | null {
  if (!feedback || feedback.count <= 0) return null;
  const age = feedback.oldest ? daysSince(feedback.oldest) : 0;
  return {
    key: "feedback",
    label: `${feedback.count.toLocaleString("en-PH")} new feedback`,
    note: feedback.oldest ? `Oldest received ${ageLabel(age)}` : null,
    count: feedback.count,
    stale: age >= STALE_DAYS,
    to: "/admin/feedback",
  };
}

function attentionRows(content: Overview | null): AttentionRow[] {
  if (!content) return [];
  const { places, businesses } = content;
  const candidates = [
    places && queueRow("places", "place", "places", "/admin/places", places, places.flagged > 0 ? `${places.flagged} flagged` : undefined),
    businesses && queueRow("businesses", "business", "businesses", "/admin/businesses", businesses),
    draftRow("events", "draft announcement", "draft announcements", "/admin/events", content.announcements?.drafts),
    draftRow("trails", "draft trail", "draft trails", "/admin/trails", content.trails?.drafts),
    feedbackRow(content.feedback),
  ];
  const rows = candidates.filter((row): row is AttentionRow => !!row);
  rows.sort((a, b) => Number(b.stale) - Number(a.stale) || b.count - a.count);
  return rows;
}

// ---------------------------------------------------------------- pane bodies

// What a pane shows until its data arrives: the failure message, or a loading line.
function PendingBody({ error, icon, children }: Readonly<{ error: boolean; icon: Icon; children: ReactNode }>) {
  if (!error) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  return (
    <EmptyState icon={icon} className="h-full">
      {children}
    </EmptyState>
  );
}

function AttentionBody({ content, error }: Readonly<{ content: Overview | null; error: boolean }>) {
  if (!content) {
    return (
      <PendingBody error={error} icon={ClipboardText}>
        Review queues could not be loaded. Reload the page to try again.
      </PendingBody>
    );
  }
  const rows = attentionRows(content);
  if (rows.length === 0) {
    return (
      <EmptyState icon={CheckCircle} className="h-full">
        Nothing needs attention.
      </EmptyState>
    );
  }
  return (
    <ul className="grid h-full grid-cols-[minmax(0,1fr)] auto-rows-[minmax(3.5rem,4.5rem)] overflow-y-auto">
      {rows.map((row) => (
        <li key={row.key} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
          <Link
            to={row.to}
            className="flex h-full items-center justify-between gap-4 px-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-foreground">{row.label}</span>
              {row.note && <span className="block truncate text-xs text-muted-foreground">{row.note}</span>}
            </span>
            <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const NOUNS = {
  visits: { one: "visit", other: "visits" },
  reviews: { one: "review", other: "reviews" },
};

function TrendBody({
  trend,
  error,
  noun,
  days,
}: Readonly<{ trend: Trend | null; error: boolean; noun: { one: string; other: string }; days: number }>) {
  if (!trend) {
    return (
      <PendingBody error={error} icon={ChartLineUp}>
        The {noun.other} could not be loaded. Reload the page to try again.
      </PendingBody>
    );
  }
  if (trend.current === 0) {
    return (
      <EmptyState icon={ChartLineUp} className="h-full">
        {noun.other[0].toUpperCase() + noun.other.slice(1)} from the last {days} days will appear here.
      </EmptyState>
    );
  }
  return <AreaChart points={trend.series} noun={noun} />;
}

function ComingUpBody({ items, error, pageSize }: Readonly<{ items: ComingUpItem[] | null; error: boolean; pageSize: number }>) {
  if (!items) {
    return (
      <PendingBody error={error} icon={CalendarBlank}>
        Upcoming dates could not be loaded. Reload the page to try again.
      </PendingBody>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState icon={CalendarBlank} className="h-full">
        Announcements and fiestas in the next 90 days will appear here.
      </EmptyState>
    );
  }
  return (
    <ul className="grid h-full grid-cols-[minmax(0,1fr)] auto-rows-[minmax(3.5rem,4rem)]">
      {items.slice(0, pageSize).map((item) => (
        <li key={item.key} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
          <Link
            to={item.to}
            className="flex h-full items-center gap-4 px-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-xs leading-4 text-muted-foreground">
              <span>{item.month}</span>
              {item.day !== null && <span className="text-sm font-semibold text-foreground">{item.day}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.kind}, {item.detail}
              </span>
            </span>
            {!item.published && <Badge variant="muted">Draft</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActivityBody({ items, error, pageSize }: Readonly<{ items: ActivityRow[] | null; error: boolean; pageSize: number }>) {
  if (!items) {
    return (
      <PendingBody error={error} icon={ClipboardText}>
        Recent activity could not be loaded. Reload the page to try again.
      </PendingBody>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState icon={ClipboardText} className="h-full">
        Staff actions will appear here.
      </EmptyState>
    );
  }
  const rows = items.slice(0, pageSize);
  const showItem = items.some((r) => r.label);
  return (
    <div className="px-4">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="h-10 hover:bg-transparent">
            <TableHead className="h-10 w-[22%] px-4 first:pl-0">Staff</TableHead>
            <TableHead className="h-10 w-[32%] px-4">Action</TableHead>
            {showItem && <TableHead className="hidden h-10 px-4 md:table-cell">Item</TableHead>}
            <TableHead className="h-10 w-[18%] px-4 text-right last:pr-0">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr:last-child]:border-0">
          {rows.map((entry) => (
            <TableRow key={entry.id} className="h-[var(--height-table-row)]">
              <TableCell className="truncate px-4 py-0 text-sm text-foreground first:pl-0">{entry.who}</TableCell>
              <TableCell className="truncate px-4 py-0 text-sm text-foreground">
                {entry.action} {entry.target}
              </TableCell>
              {showItem && (
                <TableCell className="hidden truncate px-4 py-0 text-sm text-muted-foreground md:table-cell">
                  {entry.label ?? ""}
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap px-4 py-0 text-right text-xs text-muted-foreground last:pr-0">{timeAgo(entry.at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------- layout

type Section = { title: string; action?: ReactNode; bodyRef?: Ref<HTMLDivElement>; children: ReactNode };

// Stacked (below xl) a card has no row to fill, so each section gets a fixed height.
function stackedHeight(count: number): string {
  return count === 2 ? "h-[40rem]" : "h-80";
}

// Left column: the work. Needs attention and Coming up are one context (what
// to do next), so they share one card split by a hairline. Right column: the
// record, trend over activity. A lone section stays its own card.
function Panels({ left, right }: Readonly<{ left: Section[]; right: Section[] }>) {
  if (left.length === 0 && right.length === 0) return null;
  return (
    <div className="grid overflow-hidden rounded-lg border border-border bg-card xl:min-h-[28rem] xl:flex-1 xl:grid-cols-12">
      {left.length > 0 && (
        <PaneGroup
          bare
          sections={left}
          className={cn(stackedHeight(left.length), "xl:h-auto", right.length > 0 ? "xl:col-span-4" : "xl:col-span-12")}
        />
      )}
      {right.length > 0 && (
        <PaneGroup
          bare
          sections={right}
          className={cn(
            stackedHeight(right.length),
            "xl:h-auto",
            left.length > 0
              ? "relative xl:col-span-8 before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-border xl:before:inset-x-auto xl:before:inset-y-4 xl:before:left-0 xl:before:h-auto xl:before:w-px"
              : "xl:col-span-12"
          )}
        />
      )}
    </div>
  );
}

function ActivityLink() {
  return (
    <Button asChild variant="link" className="h-auto gap-1 px-0 py-0">
      <Link to="/admin/activity">
        View all
        <ArrowUpRight weight="bold" className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}

// ---------------------------------------------------------------- data

function useDashboardPerms(): DashboardPerms {
  const { profile } = useAuth();
  const isAdmin = profile?.staff_role === "admin";
  const has = (permission: SystemPermission) => isAdmin || !!profile?.system_permission?.includes(permission);
  return {
    isAdmin,
    canPlaces: has("manage_places"),
    canBusinesses: has("review_businesses"),
    canEvents: has("publish_events"),
    canTrails: has("build_trails"),
    canFeedback: has("review_feedback"),
  };
}

function useDashboardData(perms: DashboardPerms, days: RangeDays): DashboardData {
  const { isAdmin, canPlaces, canBusinesses, canEvents, canTrails, canFeedback } = perms;
  const canReviews = canPlaces || canBusinesses;
  const hasTimeData = isAdmin || canReviews;
  const permKey = [isAdmin, canPlaces, canBusinesses, canEvents, canTrails, canFeedback].join();

  const overview = useLoad(() => fetchOverview(perms), permKey);
  const reviews = useLoad(canReviews ? () => fetchReviewTimes(perms, days) : null, `${permKey}:${days}`);
  const visits = useLoad(
    isAdmin
      ? async () => {
          const rows = await fetchVisits(days);
          return { rows, top: await fetchTopVisited(rows, days) };
        }
      : null,
    `${permKey}:${days}`
  );
  const comingUp = useLoad(canEvents ? () => fetchComingUp() : null, permKey);
  const activity = useLoad(hasTimeData ? () => fetchActivity(perms) : null, permKey);

  const reviewTrend = useMemo<Trend | null>(() => (reviews.data ? toTrend(reviews.data, days) : null), [reviews.data, days]);
  const visitTrend = useMemo<Trend | null>(
    () => (visits.data ? toTrend(visits.data.rows.map((r) => r.visited_at), days) : null),
    [visits.data, days]
  );
  return { overview, reviews, visits, comingUp, activity, reviewTrend, visitTrend };
}

function pickMetric(metric: "visits" | "reviews", data: DashboardData) {
  return metric === "visits"
    ? { trend: data.visitTrend, state: data.visits, noun: NOUNS.visits }
    : { trend: data.reviewTrend, state: data.reviews, noun: NOUNS.reviews };
}

// ---------------------------------------------------------------- page

export default function AdminDashboardPage() {
  usePageTitle("Dashboard");
  const perms = useDashboardPerms();
  const { isAdmin, canPlaces, canBusinesses, canEvents, canTrails, canFeedback } = perms;
  const hasTimeData = isAdmin || canPlaces || canBusinesses;

  const wide = useIsWide();
  const [days, setDays] = useState<RangeDays>(14);
  const [metric, setMetric] = useState<"visits" | "reviews">(isAdmin ? "visits" : "reviews");
  const activeMetric = metric === "visits" && !isAdmin ? "reviews" : metric;

  const data = useDashboardData(perms, days);

  // Lists count how many 56px rows fit their pane, so nothing scrolls. Below
  // the wide breakpoint the page scrolls instead and shows a fixed count.
  const comingFit = useAutoPageSize({ enabled: wide, pageSize: 5, hasToolbar: false, hasPagination: false, headerHeight: 0, minRows: 2 });
  const activityFit = useAutoPageSize({ enabled: wide, pageSize: 4, hasToolbar: false, hasPagination: false, minRows: 2 });

  const strip = summaryFigures(perms, days, data);
  const { trend, state: trendState, noun } = pickMetric(activeMetric, data);

  const leftSections: Section[] = [];
  if (canPlaces || canBusinesses || canEvents || canTrails || canFeedback) {
    leftSections.push({ title: "Needs attention", children: <AttentionBody content={data.overview.data} error={data.overview.error} /> });
  }
  if (canEvents) {
    leftSections.push({
      title: "Coming up",
      bodyRef: comingFit.containerRef,
      children: <ComingUpBody items={data.comingUp.data} error={data.comingUp.error} pageSize={comingFit.pageSize} />,
    });
  }

  const rightSections: Section[] = [];
  if (hasTimeData) {
    rightSections.push(
      {
        title: isAdmin ? "Daily trend" : "Reviews per day",
        action: isAdmin ? (
          <SegmentedControl
            label="Metric"
            value={activeMetric}
            onChange={setMetric}
            options={[
              { value: "visits", label: "Visits" },
              { value: "reviews", label: "Reviews" },
            ]}
          />
        ) : undefined,
        children: <TrendBody trend={trend} error={trendState.error} noun={noun} days={days} />,
      },
      {
        title: "Recent activity",
        action: isAdmin ? <ActivityLink /> : undefined,
        bodyRef: activityFit.containerRef,
        children: <ActivityBody items={data.activity.data} error={data.activity.error} pageSize={activityFit.pageSize} />,
      }
    );
  }

  const today = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      <AdminPageHeader
        title="Dashboard"
        badges={<span className="text-sm text-muted-foreground">{today}</span>}
        actions={
          hasTimeData ? (
            <SegmentedControl
              label="Date range"
              value={days}
              onChange={setDays}
              options={RANGES.map((d) => ({ value: d, label: `${d} days` }))}
            />
          ) : undefined
        }
      />

      {strip.length > 0 && (
        <div
          className={cn(
            "grid shrink-0 grid-cols-1 border-y border-border px-4 md:grid-cols-2",
            STRIP_COLUMNS[strip.length],
            // Odd count on two columns: the last figure takes the full row.
            "md:max-xl:[&>:last-child:nth-child(odd)]:col-span-2"
          )}
        >
          {strip}
        </div>
      )}

      <Panels left={leftSections} right={rightSections} />
    </div>
  );
}
