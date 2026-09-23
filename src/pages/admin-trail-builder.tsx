import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, BookOpen, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PlaceBusinessPicker,
  type PickedLocation,
} from "@/components/admin/place-business-picker";
import { fetchActiveCategories, type TrailCategory } from "@/lib/trail-categories";
import { CharCount } from "@/components/business/business-fields";
import { DurationField } from "@/components/ui/duration-field";
import { RecommendedTimeField } from "@/components/ui/recommended-time-field";
import { usePageTitle } from "@/lib/page-title";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

// Trail builder: one screen, no stepper. The trail info form is the left
// column, Stops the right, and per stop Discovery Content (5.1) is a centered
// modal, per ux-ui-guidelines.md's modal rule (focused task, fits one
// viewport), not a side panel. Publish/Unpublish sits top right beside the
// status badge, the placement convention for a primary action, with the reason
// shown next to it whenever it is unavailable (Disabled/gated rule).
//
// This used to be two steps, Details then Review and Publish. The second step
// only mirrored what Details already shows and repeated the publish action
// admin-trails.tsx's list page has, so it was removed: ux-ui-guidelines.md's
// "if content fits on a single screen, keep it on a single screen" and its
// default-to-removing rule. The gate itself is unchanged, see
// publishBlockedReason below. Flagged discovery content still links to
// admin-discovery-content-review.tsx (Phase 5.3), listed under Stops.
//
// needs_place_review is computed by migration 0012's trigger on every insert/
// update to discovery_content, this page never sets it on a write, see the
// insert/update calls below.

// Category Directory Phase 6.1: Theme renamed Category per direct
// instruction (category-directory-phases.md 6.1, category-directory-
// plan.md's Admin: Each Content Form section). The hardcoded THEMES
// const is gone -- migration 0023 dropped routes.theme entirely, so this
// page's category picker now reads from trail_categories via
// fetchActiveCategories (Phase 1.5 lib), same fetch/render shape admin-
// place-detail.tsx's Phase 5.1 already established for its own Category
// field, reused rather than reinvented per constraints.md's Inventory
// Before Suggesting rule.
const RUN_TYPES = ["CATO guided", "self guided"] as const;

interface TrailInfoFormState {
  name: string;
  category_id: string;
  estimated_duration: string;
  estimated_budget: string; // numeric column (migration 0019), kept as a string here since the number input's value must be a string; parsed to a number or null at submit time
  recommended_time: string;
  run_type: string;
}

const EMPTY_INFO: TrailInfoFormState = {
  name: "",
  category_id: "",
  estimated_duration: "",
  estimated_budget: "",
  recommended_time: "",
  run_type: "",
};

interface StopRow {
  id: string;
  stop_type: "place" | "business";
  stop_id: string;
  sequence_order: number;
  name: string; // resolved client side, not a route_stops column (4.4/4.5: no FK, app resolves it)
}

// 5.1: discovery_content row shape per migration 0005. related_location_type
// and related_location_id are never chosen in this modal, they are inherited
// from the parent stop (StopRow.stop_type / stop_id) the modal was opened
// for, per step-4-phases.md 5.1's "tied to related_location_type and
// related_location_id matching the parent stop." needs_place_review is
// read-only here: migration 0012's trigger computes it server side on
// every write, this page's insert/update payloads never set it. 5.4 reads
// it to build the Review and Publish summary, so it's selected in
// loadDiscoveryContent below, but that's the only use — still never sent
// back on a write.
interface DiscoveryContentRow {
  id: string;
  route_stop_id: string;
  title: string;
  content: string;
  sequence_order: number;
  unlock_radius: number;
  needs_place_review: boolean;
}

interface DiscoveryContentFormState {
  title: string;
  content: string;
  sequence_order: string;
  unlock_radius: string;
}

const EMPTY_DISCOVERY_FORM: DiscoveryContentFormState = {
  title: "",
  content: "",
  sequence_order: "",
  unlock_radius: "",
};

// Extracted from persistStops (4.5/5.4 comment above still applies): the
// "renumber surviving stops" two-pass sequence (see the Phase 1/Phase 2
// comments this function now owns). Pulled out for the same reason
// insertNewStops was: persistStops's own body reads as one sequence of
// steps (delete removed, renumber survivors, insert new, merge state)
// instead of owning every loop and its own error branch inline. Same
// offset-then-finalize behavior as before, unchanged — see the Phase 1/
// Phase 2 comments below for why two passes are needed.
async function renumberSurvivors(
  survivors: StopRow[],
  nextStops: StopRow[]
): Promise<{ ok: true } | { error: string }> {
  // Phase 1: push every survivor out of the (route_id, sequence_order)
  // range any row could currently hold, so phase 2's real values can
  // never collide with a survivor still sitting at its old position.
  for (const [index, s] of survivors.entries()) {
    const { error: offsetError } = await supabase
      .from("route_stops")
      .update({ sequence_order: -1 * (index + 1) })
      .eq("id", s.id);
    if (offsetError) return { error: offsetError.message };
  }

  // Phase 2: set every survivor's real final sequence_order, matching
  // its position in nextStops.
  for (const s of survivors) {
    const { error: finalizeError } = await supabase
      .from("route_stops")
      .update({ sequence_order: nextStops.indexOf(s) })
      .eq("id", s.id);
    if (finalizeError) return { error: finalizeError.message };
  }

  return { ok: true };
}

// Extracted from persistStops (4.5/5.4 comment above still applies): this
// is the "insert newly picked stops" branch. Pulled out as its own
// function so persistStops's own branching (survivor offset/finalize
// passes, this insert call, final state merge) reads as one sequence of
// steps instead of one function owning every nested validation branch
// itself. Same re-verify-against-the-table behavior as before, unchanged.
async function insertNewStops(
  routeId: string,
  newStops: StopRow[],
  nextStops: StopRow[]
): Promise<{ rows: { id: string; stop_type: string; stop_id: string; sequence_order: number }[] } | { error: string }> {
  const newPlaceIds = newStops.filter((s) => s.stop_type === "place").map((s) => s.stop_id);
  const newBusinessIds = newStops.filter((s) => s.stop_type === "business").map((s) => s.stop_id);

  const [{ data: validPlaces }, { data: validBusinesses }] = await Promise.all([
    newPlaceIds.length > 0
      ? supabase.from("places").select("id").eq("verification_status", "verified").in("id", newPlaceIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    newBusinessIds.length > 0
      ? supabase.from("businesses").select("id").eq("verification_status", "verified").in("id", newBusinessIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);

  const validIds = new Set([...(validPlaces ?? []), ...(validBusinesses ?? [])].map((r) => r.id));
  const invalidStop = newStops.find((s) => !validIds.has(s.stop_id));

  if (invalidStop) {
    return {
      error: `"${invalidStop.name}" is no longer available to add — it may have been removed or is no longer verified. Refresh and try again.`,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("route_stops")
    .insert(
      newStops.map((s) => ({
        route_id: routeId,
        stop_type: s.stop_type,
        stop_id: s.stop_id,
        sequence_order: nextStops.indexOf(s),
      }))
    )
    .select("id, stop_type, stop_id, sequence_order");

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Could not save stop order." };
  }
  return { rows: inserted };
}

// Save button label for the discovery-entry form: saving takes priority
// over which mode the form is in, then "new" vs "editing" pick the verb.
// Extracted from a nested ternary in DiscoveryContentModalBody's JSX below.
function discoveryEntrySaveLabel(discoverySaving: boolean, editingEntryId: string | null): string {
  if (discoverySaving) return "Saving…";
  return editingEntryId === "new" ? "Add" : "Save Changes";
}

// admin-form-fields-plan.md #2: every maxLength needs a visible counter
// nearby so the cap isn't a silent wall. Step 8 cleanup: this was a
// page-local CharCount, byte-identical to business-fields.tsx's own and
// four other admin detail pages' own copies -- now imported from
// business-fields.tsx, the one place it's kept.

// Extracted from AdminTrailBuilderPage's render (previously an inline IIFE
// inside the Dialog's DialogContent). Same two-mode body: a list view
// (editingEntryId === null) or the add/edit form, same markup and
// behavior, just named and pulled out of the parent function so its own
// loading/empty/list and add/edit branches aren't counted against
// AdminTrailBuilderPage's complexity.
function DiscoveryContentModalBody({
  activeStop,
  entriesForStop,
  discoveryError,
  discoveryLoading,
  discoverySaving,
  editingEntryId,
  discoveryForm,
  setDiscoveryForm,
  canSubmitDiscoveryEntry,
  onStartNew,
  onStartEdit,
  onDelete,
  onCancelEdit,
  onSave,
}: Readonly<{
  activeStop: StopRow;
  entriesForStop: DiscoveryContentRow[];
  discoveryError: string | null;
  discoveryLoading: boolean;
  discoverySaving: boolean;
  editingEntryId: string | null;
  discoveryForm: DiscoveryContentFormState;
  setDiscoveryForm: Dispatch<SetStateAction<DiscoveryContentFormState>>;
  canSubmitDiscoveryEntry: boolean;
  onStartNew: (stop: StopRow) => void;
  onStartEdit: (entry: DiscoveryContentRow) => void;
  onDelete: (entryId: string) => void;
  onCancelEdit: () => void;
  onSave: (stop: StopRow) => void;
}>) {
  // Extracted from a nested ternary (discoveryLoading ? ... :
  // entriesForStop.length === 0 ? ... : ...) inline in the list view below.
  let entriesListBody: ReactNode;
  if (discoveryLoading) {
    entriesListBody = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (entriesForStop.length === 0) {
    entriesListBody = <p className="text-sm text-muted-foreground">No discovery content yet.</p>;
  } else {
    entriesListBody = (
      <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {entriesForStop.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                  {entry.sequence_order}
                </span>
                <span className="truncate text-sm font-semibold text-foreground">{entry.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">Unlocks within {entry.unlock_radius}m</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onStartEdit(entry)}>
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                disabled={discoverySaving}
                onClick={() => onDelete(entry.id)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Discovery Content: {activeStop.name}</DialogTitle>
      </DialogHeader>

      {discoveryError && <p className="text-sm text-destructive">{discoveryError}</p>}

      {editingEntryId === null ? (
        <div className="flex flex-col gap-3">
          {entriesListBody}
          <div>
            <Button type="button" variant="outline" onClick={() => onStartNew(activeStop)}>
              Add Discovery Content
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="discovery_title">Title</Label>
            <Input
              id="discovery_title"
              value={discoveryForm.title}
              onChange={(e) => setDiscoveryForm((prev) => ({ ...prev, title: e.target.value }))}
              required
              maxLength={150}
            />
            <CharCount value={discoveryForm.title} max={150} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="discovery_content_text">Content</Label>
            <Textarea
              id="discovery_content_text"
              className="min-h-30"
              value={discoveryForm.content}
              onChange={(e) => setDiscoveryForm((prev) => ({ ...prev, content: e.target.value }))}
              required
              maxLength={2000}
            />
            <CharCount value={discoveryForm.content} max={2000} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="discovery_sequence_order">Sequence Order</Label>
              <Input
                id="discovery_sequence_order"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={discoveryForm.sequence_order}
                onChange={(e) => setDiscoveryForm((prev) => ({ ...prev, sequence_order: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discovery_unlock_radius">Unlock Radius (meters)</Label>
              <Input
                id="discovery_unlock_radius"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={discoveryForm.unlock_radius}
                onChange={(e) => setDiscoveryForm((prev) => ({ ...prev, unlock_radius: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button type="button" onClick={() => onSave(activeStop)} disabled={!canSubmitDiscoveryEntry}>
              {discoveryEntrySaveLabel(discoverySaving, editingEntryId)}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// Why Publish is unavailable right now, or null when it is allowed. Unpublishing
// is never blocked, so a published trail always returns null. Same two blocking
// rules as admin-trails.tsx's handleTogglePublish (no stops, or discovery
// content still flagged), per admin-panel-spec.md's Trail Publishing exception,
// plus unsaved stops, which exist only in this page's state and would not be
// counted by the database.
function publishBlockedReason(
  status: "draft" | "published",
  stops: StopRow[],
  flaggedCount: number
): string | null {
  if (status === "published") return null;
  if (stops.some((s) => s.id.startsWith("temp-"))) return "Save your stops to publish.";
  if (stops.length === 0) return "Add at least one stop to publish.";
  if (flaggedCount > 0) {
    return flaggedCount === 1
      ? "1 discovery entry still needs review."
      : `${flaggedCount} discovery entries still need review.`;
  }
  return null;
}

// Lists discovery content still flagged needs_place_review, each with the stop
// it belongs to and a link to its review page. Returns nothing when none are
// flagged. Shown under Stops so the reason Publish is unavailable is next to the
// content that has to be fixed.
function FlaggedForReview({
  discoveryContent,
  stops,
}: Readonly<{ discoveryContent: DiscoveryContentRow[]; stops: StopRow[] }>) {
  const flaggedEntries = discoveryContent.filter((entry) => entry.needs_place_review);
  if (flaggedEntries.length === 0) return null;
  const stopNameById = new Map(stops.map((s) => [s.id, s.name]));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-foreground">Flagged for review</span>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {flaggedEntries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{entry.title}</span>
              <span className="text-xs text-muted-foreground">
                Stop: {stopNameById.get(entry.route_stop_id) ?? "(unknown stop)"}
              </span>
            </div>
            <Link to={`/admin/places/discovery/${entry.id}`} className="text-sm underline underline-offset-2">
              Review it
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminTrailBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [infoSaved, setInfoSaved] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(isNew ? null : id ?? null);
  const [status, setStatus] = useState<"draft" | "published">("draft");

  const [info, setInfo] = useState<TrailInfoFormState>(EMPTY_INFO);
  usePageTitle(isNew && !routeId ? "New Trail" : info.name || "Edit Trail");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Category Directory Phase 6.1: category picker source, active rows
  // only, same fetchActiveCategories/effect shape admin-place-detail.tsx's
  // Phase 5.1 already established for its own Category field, reused
  // rather than reinvented per constraints.md's Inventory Before
  // Suggesting rule. Loaded once on mount, independent of isNew/routeId,
  // since a new trail's Details step needs the picker just as much as an
  // existing one's does.
  const [categories, setCategories] = useState<TrailCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveCategories()
      .then(setCategories)
      .catch((err: unknown) => {
        setCategoriesError(
          err instanceof Error ? err.message : "Could not load categories."
        );
      });
  }, []);

  const [stops, setStops] = useState<StopRow[]>([]);
  const [stopsLoading, setStopsLoading] = useState(!isNew);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [savingStops, setSavingStops] = useState(false);

  // 5.1: discovery content, loaded once per trail alongside stops (both
  // read from routeId), not lazily per stop, so the Stops list's
  // "content count" badge (below) and the per stop modal
  // share one source of truth instead of two independent fetches drifting.
  const [discoveryContent, setDiscoveryContent] = useState<DiscoveryContentRow[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(!isNew);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoverySaving, setDiscoverySaving] = useState(false);
  // Which stop's modal is open, null when closed. Set to a stop id to open
  // the list-for-that-stop view; editingEntryId then narrows to the add/edit
  // form within it.
  const [discoveryModalStopId, setDiscoveryModalStopId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [discoveryForm, setDiscoveryForm] = useState<DiscoveryContentFormState>(EMPTY_DISCOVERY_FORM);

  // 5.4: Publish. Same gate as admin-trails.tsx's list page (see
  // publishBlockedReason), reached from the page header instead of a list
  // row. publishError only holds a failed database write, the blocking rules
  // are shown as publishBlockedReason instead of an error.
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !routeId) return;

    setLoading(true);
    setNotFound(false);
    supabase
      .from("routes")
      // Category Directory Phase 6.1: theme (migration 0023) is gone,
      // category_id selected directly off routes -- this form never
      // displays the category's name here, only writes/reads the id, so
      // a flat select is enough, no trail_categories embed needed. Same
      // reasoning admin-place-detail.tsx's Phase 5.1 entry already gives
      // for its own category_id select.
      .select("id, name, category_id, estimated_duration, estimated_budget, recommended_time, run_type, status")
      .eq("id", routeId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setInfo({
          name: data.name ?? "",
          category_id: data.category_id ?? "",
          estimated_duration: data.estimated_duration ?? "",
          estimated_budget: data.estimated_budget !== null ? String(data.estimated_budget) : "",
          recommended_time: data.recommended_time ?? "",
          run_type: data.run_type ?? "",
        });
        setStatus(data.status);
        setLoading(false);
      });

    loadStops(routeId);
    loadDiscoveryContent(routeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, isNew]);

  async function loadStops(forRouteId: string) {
    setStopsLoading(true);
    const { data: stopRows } = await supabase
      .from("route_stops")
      .select("id, stop_type, stop_id, sequence_order")
      .eq("route_id", forRouteId)
      .order("sequence_order", { ascending: true });

    if (!stopRows || stopRows.length === 0) {
      setStops([]);
      setStopsLoading(false);
      return;
    }

    const placeIds = stopRows.filter((s) => s.stop_type === "place").map((s) => s.stop_id);
    const businessIds = stopRows.filter((s) => s.stop_type === "business").map((s) => s.stop_id);

    const [placesRes, businessesRes] = await Promise.all([
      placeIds.length
        ? supabase.from("places").select("id, name").in("id", placeIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      businessIds.length
        ? supabase.from("businesses").select("id, name").in("id", businessIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const nameById = new Map<string, string>();
    for (const p of placesRes.data ?? []) nameById.set(p.id, p.name);
    for (const b of businessesRes.data ?? []) nameById.set(b.id, b.name);

    setStops(
      stopRows.map((s) => ({
        id: s.id,
        stop_type: s.stop_type,
        stop_id: s.stop_id,
        sequence_order: s.sequence_order,
        name: nameById.get(s.stop_id) ?? "(deleted)",
      }))
    );
    setStopsLoading(false);
  }

  // 5.1: fetched by route_id, not per stop, per the state comment above —
  // one query covers every stop's content, filtered client side by
  // route_stop_id when rendering a given stop's modal. related_location_type
  // and related_location_id are deliberately not selected here: this page
  // never reads them back into a form, they are write-once-at-insert values
  // inherited from the parent stop (see handleSaveDiscoveryEntry), not
  // something this step edits.
  //
  // FIXED, ahead of Phase 5.4: persistStops (4.5, below) used to delete and
  // re-insert every route_stops row on any add/remove/reorder, which changed
  // route_stops.id on every stop edit. discovery_content.related_route_stop_id
  // is `on delete set null` (0005_routes.sql), so that pattern silently nulled
  // out every discovery_content row's stop link the moment stops were edited
  // after content existed. persistStops now updates surviving stops'
  // sequence_order in place and only deletes/inserts rows that were actually
  // removed/added, so route_stops.id — and therefore related_route_stop_id —
  // stays stable across a reorder. Human-approved before starting 5.4, since
  // 5.4's summary is exactly where a broken link would first surface as
  // "missing" content to staff.
  async function loadDiscoveryContent(forRouteId: string) {
    setDiscoveryLoading(true);
    const { data, error: fetchError } = await supabase
      .from("discovery_content")
      .select("id, related_route_stop_id, title, content, sequence_order, unlock_radius, needs_place_review")
      .eq("route_id", forRouteId)
      .order("sequence_order", { ascending: true });

    setDiscoveryLoading(false);
    if (fetchError || !data) {
      setDiscoveryError(fetchError?.message ?? "Could not load discovery content.");
      return;
    }

    setDiscoveryContent(
      data
        .filter((row) => row.related_route_stop_id !== null)
        .map((row) => ({
          id: row.id,
          route_stop_id: row.related_route_stop_id as string,
          title: row.title,
          content: row.content,
          sequence_order: row.sequence_order,
          unlock_radius: row.unlock_radius,
          needs_place_review: row.needs_place_review,
        }))
    );
  }

  function updateInfoField<K extends keyof TrailInfoFormState>(key: K, value: TrailInfoFormState[K]) {
    setInfo((prev) => ({ ...prev, [key]: value }));
    setInfoSaved(false);
  }

  const canSaveInfo = info.name.trim().length > 0 && !saving;

  // Extracted from a nested ternary in the Details step's Save button JSX.
  function saveInfoButtonLabel(): string {
    if (saving) return "Saving…";
    return routeId ? "Save Changes" : "Create Trail";
  }

  // 4.3: saves as a routes row with status = draft, per step-4-phases.md.
  // Info step only ever creates/updates the routes row itself — stops and
  // publish status are handled by their own steps.
  async function handleSaveInfo() {
    if (!canSaveInfo || !profile) return;

    setSaving(true);
    setError(null);

    // estimated_budget is numeric (migration 0019): the form holds it as a
    // string for the number input, same reasoning as admin-place-detail.tsx's
    // entrance_fee -- an empty string fails Postgres's numeric cast, so it
    // must become a real number or null before it reaches the payload.
    const payload = {
      name: info.name.trim(),
      // Category Directory Phase 6.1: writes category_id (migration
      // 0023), nullable, matching theme's own prior optionality -- not
      // forced required, same reasoning 0023's own comment gives for why
      // category_id stays nullable on routes.
      category_id: info.category_id || null,
      estimated_duration: info.estimated_duration || null,
      estimated_budget: info.estimated_budget.trim() ? Number(info.estimated_budget) : null,
      recommended_time: info.recommended_time || null,
      run_type: info.run_type || null,
      updated_at: new Date().toISOString(),
    };

    if (isNew && !routeId) {
      const { data, error: insertError } = await supabase
        .from("routes")
        .insert({ ...payload, created_by: profile.id })
        .select("id")
        .single();

      setSaving(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "Could not create this trail.");
        return;
      }
      setRouteId(data.id);
      setStopsLoading(false);

      // Stops picked before the trail existed are written now that there is
      // a route_id for them. If that write fails the trail row already
      // exists, so stay on this page with routeId set: the button becomes
      // "Save Changes" and the next save retries the stops instead of
      // creating a duplicate trail. Navigating away here would remount the
      // page and drop the unsaved stops.
      if (stops.length > 0) {
        const stopsSaved = await persistStops(stops, data.id);
        if (!stopsSaved) {
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      navigate(`/admin/trails/${data.id}`, { replace: true });
      return;
    }

    const { error: updateError } = await supabase.from("routes").update(payload).eq("id", routeId!);

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    // Retry path for the failed first write described above: any stop still
    // carrying a `temp-` id was never persisted.
    if (stops.some((s) => s.id.startsWith("temp-"))) {
      const stopsSaved = await persistStops(stops);
      if (!stopsSaved) {
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setInfoSaved(true);
  }

  // 4.5: add, remove, reorder. route_stops.sequence_order has a unique
  // constraint per (route_id, sequence_order) (0005_routes.sql).
  //
  // Fixed ahead of 5.4 (human-approved, see loadDiscoveryContent's comment
  // above): this used to delete every route_stops row for the trail and
  // re-insert the full set, which destroyed and recreated every row's id on
  // every add/remove/reorder. discovery_content.related_route_stop_id is
  // `on delete set null`, so that pattern silently orphaned any discovery
  // content already attached to a stop. Survivors (an existing StopRow
  // whose id is a real route_stops.id, not the `temp-` prefix handlePick
  // gives a freshly picked, not-yet-persisted stop) now get their
  // sequence_order updated in place instead, so their id — and therefore
  // any discovery_content pointing at it — never changes. Only stops
  // actually removed are deleted; only stops actually new are inserted.
  //
  // Updating sequence_order in place still has to dodge the same unique
  // constraint: two rows swapping positions would collide if updated
  // straight to their final values in sequence. Survivors are offset to a
  // negative, out-of-range sequence_order first, then set to their real
  // final value in a second pass, so no in-flight state can collide with
  // another row's current value.
  //
  // Stops can now be added before the trail itself is saved. With no
  // routeId yet there is no route_stops.route_id to write against, so the
  // list is only held in state (every row keeps its `temp-` id) and written
  // out for real by handleSaveInfo once the routes row exists. handleSaveInfo
  // passes forRouteId explicitly for that first write, since the routeId
  // state hasn't updated yet at that point. Returns true when the stops are
  // in the state the caller asked for, false if a database write failed.
  async function persistStops(nextStops: StopRow[], forRouteId: string | null = routeId): Promise<boolean> {
    if (!forRouteId) {
      setStops(nextStops.map((s, index) => ({ ...s, sequence_order: index })));
      return true;
    }

    setSavingStops(true);
    setStopsError(null);

    const survivors = nextStops.filter((s) => !s.id.startsWith("temp-"));
    const newStops = nextStops.filter((s) => s.id.startsWith("temp-"));
    const survivorIds = new Set(survivors.map((s) => s.id));

    const removedIds = stops.filter((s) => !s.id.startsWith("temp-") && !survivorIds.has(s.id)).map((s) => s.id);

    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase.from("route_stops").delete().in("id", removedIds);
      if (deleteError) {
        setSavingStops(false);
        setStopsError(deleteError.message);
        return false;
      }
    }

    const renumberResult = await renumberSurvivors(survivors, nextStops);
    if ("error" in renumberResult) {
      setSavingStops(false);
      setStopsError(renumberResult.error);
      return false;
    }

    let insertedRows: { id: string; stop_type: string; stop_id: string; sequence_order: number }[] = [];
    if (newStops.length > 0) {
      // 4.5: "App layer must confirm the picked id actually exists in the
      // matching table before insert, no foreign key enforces this" —
      // route_stops.stop_id has no FK (0005, architecture-notes.md's Known
      // Fragile Areas), and the picker's list (place-business-picker.tsx)
      // is loaded once on open and can go stale while the picker or this
      // modal stays open. Re-verify each newly picked id against its own
      // table right before insert, same verified-only bar the picker
      // itself queries against, rather than trusting the payload handlePick
      // already had in hand. See insertNewStops above.
      const result = await insertNewStops(forRouteId, newStops, nextStops);
      if ("error" in result) {
        setSavingStops(false);
        setStopsError(result.error);
        return false;
      }
      insertedRows = result.rows;
    }

    setSavingStops(false);

    const nameByStopId = new Map(nextStops.map((s) => [s.stop_id, s.name]));
    const survivorRows = survivors.map((s) => ({
      id: s.id,
      stop_type: s.stop_type,
      stop_id: s.stop_id,
      sequence_order: nextStops.indexOf(s),
    }));

    setStops(
      [...survivorRows, ...insertedRows]
        .map((row) => ({
          id: row.id,
          stop_type: row.stop_type as "place" | "business",
          stop_id: row.stop_id,
          sequence_order: row.sequence_order,
          name: nameByStopId.get(row.stop_id) ?? "",
        }))
        .sort((a, b) => a.sequence_order - b.sequence_order)
    );
    return true;
  }

  function handlePick(location: PickedLocation) {
    setPickerOpen(false);
    const next = [
      ...stops,
      {
        id: `temp-${location.id}`,
        stop_type: location.type,
        stop_id: location.id,
        sequence_order: stops.length,
        name: location.name,
      },
    ];
    persistStops(next);
  }

  function handleRemoveStop(stopId: string) {
    persistStops(stops.filter((s) => s.id !== stopId));
  }

  function handleMoveStop(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stops.length) return;
    const next = [...stops];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    persistStops(next);
  }

  // 5.1: opens the per-stop modal, listing whatever discovery_content rows
  // already reference this route_stop_id. Starts on the list view
  // (editingEntryId null), not straight into a form, since a stop can have
  // more than one piece of content and jumping into a blank form would hide
  // what already exists.
  function openDiscoveryModal(stopId: string) {
    setDiscoveryModalStopId(stopId);
    setEditingEntryId(null);
    setDiscoveryError(null);
  }

  function closeDiscoveryModal() {
    setDiscoveryModalStopId(null);
    setEditingEntryId(null);
  }

  function startNewDiscoveryEntry(stop: StopRow) {
    // Auto-suggest the next sequence_order within this stop's own entries,
    // per data-model.md's Sequence Order field — staff can still override
    // it, this just saves re-typing the obvious next number.
    const entriesForStop = discoveryContent.filter((d) => d.route_stop_id === stop.id);
    const nextOrder = entriesForStop.length
      ? Math.max(...entriesForStop.map((d) => d.sequence_order)) + 1
      : 1;
    setDiscoveryForm({ ...EMPTY_DISCOVERY_FORM, sequence_order: String(nextOrder) });
    setDiscoveryError(null);
    setEditingEntryId("new");
  }

  function startEditDiscoveryEntry(entry: DiscoveryContentRow) {
    setDiscoveryForm({
      title: entry.title,
      content: entry.content,
      sequence_order: String(entry.sequence_order),
      unlock_radius: String(entry.unlock_radius),
    });
    setDiscoveryError(null);
    setEditingEntryId(entry.id);
  }

  const canSubmitDiscoveryEntry =
    discoveryForm.title.trim().length > 0 &&
    discoveryForm.content.trim().length > 0 &&
    discoveryForm.sequence_order.trim().length > 0 &&
    discoveryForm.unlock_radius.trim().length > 0 &&
    !discoverySaving;

  // 5.1: title, content, unlock_radius, sequence_order, tied to
  // related_location_type and related_location_id matching the parent
  // stop, per step-4-phases.md. related_location_type/id are read from the
  // StopRow the modal was opened for, never offered as form fields, so a
  // discovery entry can't drift from the stop it was attached through.
  // needs_place_review is intentionally absent from both the insert and
  // update payloads below: migration 0012's trigger computes it server
  // side on every write, per phase-5-decisions.md Decision 1, this
  // function must never set it.
  async function handleSaveDiscoveryEntry(stop: StopRow) {
    if (!canSubmitDiscoveryEntry || !routeId) return;

    const sequenceOrder = Number(discoveryForm.sequence_order);
    const unlockRadius = Number(discoveryForm.unlock_radius);
    if (!Number.isFinite(sequenceOrder) || !Number.isFinite(unlockRadius)) {
      setDiscoveryError("Sequence order and unlock radius must be numbers.");
      return;
    }

    setDiscoverySaving(true);
    setDiscoveryError(null);

    if (editingEntryId === "new") {
      const { data: inserted, error: insertError } = await supabase
        .from("discovery_content")
        .insert({
          route_id: routeId,
          title: discoveryForm.title.trim(),
          content: discoveryForm.content.trim(),
          related_location_type: stop.stop_type,
          related_location_id: stop.stop_id,
          related_route_stop_id: stop.id,
          sequence_order: sequenceOrder,
          unlock_radius: unlockRadius,
        })
        .select("id, related_route_stop_id, title, content, sequence_order, unlock_radius, needs_place_review")
        .single();

      setDiscoverySaving(false);
      if (insertError || !inserted) {
        setDiscoveryError(insertError?.message ?? "Could not save discovery content.");
        return;
      }
      setDiscoveryContent((prev) => [
        ...prev,
        {
          id: inserted.id,
          route_stop_id: inserted.related_route_stop_id as string,
          title: inserted.title,
          content: inserted.content,
          sequence_order: inserted.sequence_order,
          unlock_radius: inserted.unlock_radius,
          needs_place_review: inserted.needs_place_review,
        },
      ]);
      setEditingEntryId(null);
      return;
    }

    // Editing an existing entry. related_location_type/id and
    // related_route_stop_id are never part of this update, per this
    // function's header comment, an edit can only change the four fields
    // in the form, not what the entry is attached to.
    const { error: updateError } = await supabase
      .from("discovery_content")
      .update({
        title: discoveryForm.title.trim(),
        content: discoveryForm.content.trim(),
        sequence_order: sequenceOrder,
        unlock_radius: unlockRadius,
      })
      .eq("id", editingEntryId);

    setDiscoverySaving(false);
    if (updateError) {
      setDiscoveryError(updateError.message);
      return;
    }
    setDiscoveryContent((prev) =>
      prev.map((entry) =>
        entry.id === editingEntryId
          ? {
              ...entry,
              title: discoveryForm.title.trim(),
              content: discoveryForm.content.trim(),
              sequence_order: sequenceOrder,
              unlock_radius: unlockRadius,
            }
          : entry
      )
    );
    setEditingEntryId(null);
  }

  async function handleDeleteDiscoveryEntry(entryId: string) {
    setDiscoverySaving(true);
    setDiscoveryError(null);

    const { error: deleteError } = await supabase.from("discovery_content").delete().eq("id", entryId);

    setDiscoverySaving(false);
    if (deleteError) {
      setDiscoveryError(deleteError.message);
      return;
    }
    setDiscoveryContent((prev) => prev.filter((entry) => entry.id !== entryId));
  }

  // The gate is publishBlockedReason, shown beside the button while it applies.
  // The button is disabled while blocked, so the check here is only a guard.
  // Unpublishing a live trail is never blocked, matching the list page.
  const flaggedEntries = discoveryContent.filter((entry) => entry.needs_place_review);
  const blockedReason = publishBlockedReason(status, stops, flaggedEntries.length);

  async function handleTogglePublish() {
    if (!routeId || blockedReason) return;
    setPublishError(null);

    setPublishSaving(true);
    const nextStatus = status === "draft" ? "published" : "draft";

    const { error: updateError } = await supabase
      .from("routes")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", routeId);

    setPublishSaving(false);
    if (updateError) {
      setPublishError(updateError.message);
      return;
    }
    setStatus(nextStatus);
  }

  // Extracted from a nested ternary in the Publish button.
  function publishButtonLabel(): string {
    if (publishSaving) return "Saving…";
    return status === "published" ? "Unpublish" : "Publish";
  }

  // Extracted from a nested ternary (stopsLoading ? ... : stops.length
  // === 0 ? ... : ...) inline in the Stops step's list below.
  function stopsListBody(): ReactNode {
    if (stopsLoading) {
      return <p className="text-sm text-muted-foreground">Loading…</p>;
    }
    if (stops.length === 0) {
      return <p className="text-sm text-muted-foreground">No stops yet.</p>;
    }
    return (
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {stops.map((stop, index) => (
          <li key={stop.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {index + 1}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">{stop.name}</span>
                <Badge variant="secondary" className="mt-1 w-fit capitalize">
                  {stop.stop_type}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={savingStops || stop.id.startsWith("temp-")}
                title={stop.id.startsWith("temp-") ? "Save the trail first to add discovery content" : undefined}
                onClick={() => openDiscoveryModal(stop.id)}
              >
                <BookOpen className="h-4 w-4" />
                Discovery Content
                {discoveryContent.some((d) => d.route_stop_id === stop.id) && (
                  <Badge variant="secondary" className="ml-1">
                    {discoveryContent.filter((d) => d.route_stop_id === stop.id).length}
                  </Badge>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={index === 0 || savingStops}
                onClick={() => handleMoveStop(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Move up</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={index === stops.length - 1 || savingStops}
                onClick={() => handleMoveStop(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
                <span className="sr-only">Move down</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                disabled={savingStops}
                onClick={() => handleRemoveStop(stop.id)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove stop</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound) {
    return <p className="text-sm text-destructive">Could not load this trail.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Publish/Unpublish (the actions slot): top right, only once the trail
          exists. While it is unavailable the reason sits directly under it,
          never a silently disabled button. */}
      <AdminPageHeader
        breadcrumb={[{ label: "Trails", to: "/admin/trails" }]}
        title={isNew && !routeId ? "New Trail" : info.name || "Edit Trail"}
        badges={routeId && <Badge variant={status === "published" ? "default" : "outline"}>{status}</Badge>}
        actions={
          routeId && (
            <div className="flex max-w-sm flex-col items-end gap-1">
              <Button type="button" onClick={handleTogglePublish} disabled={publishSaving || blockedReason !== null}>
                {publishButtonLabel()}
              </Button>
              {blockedReason && <p className="text-right text-sm text-muted-foreground">{blockedReason}</p>}
              {publishError && <p className="text-right text-sm text-destructive">{publishError}</p>}
            </div>
          )
        }
      />

      <div className="flex flex-col gap-6">
        {/* Info fields and Stops share one card -- per ux-ui-guidelines.md's
            card fragmentation rule, this is one logical "edit this trail"
            context, not two. Stops used to be a separate no-card right
            column (a two-column split); it's now a section inside this
            same card, split off with a divider rather than nesting a
            second card. The error line and the Cancel/Save row stay
            outside the card, same split as before. */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Route Name</Label>
              <Input
                id="name"
                value={info.name}
                onChange={(e) => updateInfoField("name", e.target.value)}
                required
                maxLength={150}
              />
              <CharCount value={info.name} max={150} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Category</Label>
              <Select value={info.category_id} onValueChange={(v) => updateInfoField("category_id", v)}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoriesError && <p className="text-sm text-destructive">{categoriesError}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="estimated_duration">Estimated Duration</Label>
              <DurationField
                id="estimated_duration"
                value={info.estimated_duration}
                onChange={(next) => updateInfoField("estimated_duration", next)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="estimated_budget">Estimated Budget</Label>
              {/* estimated_budget is numeric (migration 0019): a single
                  peso amount, not a range, per admin-form-fields-plan.md
                  #4 -- drops the old "e.g. ₱300–500" range placeholder.
                  The ₱ sign is a fixed label beside the field, never
                  typed by the user; the number input's own up/down
                  arrows step the value. Same pattern as
                  admin-place-detail.tsx's entrance_fee field. */}
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₱
                </span>
                <Input
                  id="estimated_budget"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100000}
                  step={1}
                  placeholder="e.g. 300"
                  value={info.estimated_budget}
                  onChange={(e) => updateInfoField("estimated_budget", e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          {/* Recommended time is day chips plus a time range, too wide for
              the three column row it used to share with duration and
              budget, so it gets its own row. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="recommended_time">Recommended Time</Label>
            <RecommendedTimeField
              id="recommended_time"
              ariaLabel="Recommended time"
              value={info.recommended_time}
              onChange={(next) => updateInfoField("recommended_time", next)}
            />
          </div>

          <div className="flex flex-col gap-2 sm:w-60">
            <Label htmlFor="run_type">Run Type</Label>
            <Select value={info.run_type} onValueChange={(v) => updateInfoField("run_type", v)}>
              <SelectTrigger id="run_type">
                <SelectValue placeholder="Select a run type" />
              </SelectTrigger>
              <SelectContent>
                {RUN_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stops: a section inside the same card, not a second card and not
              a separate column. Available before the trail is created, stops
              picked now are saved together with the trail. */}
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <h2 className="text-base font-semibold text-foreground">Stops</h2>
            {stopsError && <p className="text-sm text-destructive">{stopsError}</p>}

            {stopsListBody()}

            {stops.some((s) => s.id.startsWith("temp-")) && (
              <p className="text-xs text-muted-foreground">
                {routeId
                  ? "Some stops are not saved yet. Press Save Changes to save them."
                  : "Stops are saved when you create the trail. Discovery content can be added after that."}
              </p>
            )}

            <div>
              <Button type="button" variant="outline" onClick={() => setPickerOpen(true)} disabled={savingStops}>
                Add Stop
              </Button>
            </div>

            <FlaggedForReview discoveryContent={discoveryContent} stops={stops} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          {infoSaved && <span className="text-sm text-muted-foreground">Saved</span>}
          <Button type="button" variant="outline" onClick={() => navigate("/admin/trails")}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSaveInfo} disabled={!canSaveInfo}>
            {saveInfoButtonLabel()}
          </Button>
        </div>

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a stop</DialogTitle>
            </DialogHeader>
            <PlaceBusinessPicker
              onPick={handlePick}
              excludeIds={new Set(stops.map((s) => s.stop_id))}
            />
          </DialogContent>
        </Dialog>

        {/* 5.1: centered modal per stop, per ux-ui-guidelines.md's modal rule,
            a focused task fitting one viewport, not a side panel. Reachable
            from the Discovery Content button on the same stop's row. */}
        <Dialog
          open={discoveryModalStopId !== null}
          onOpenChange={(open) => {
            if (!open) closeDiscoveryModal();
          }}
        >
          <DialogContent>
            {(() => {
              const activeStop = stops.find((s) => s.id === discoveryModalStopId);
              if (!activeStop) return null;
              const entriesForStop = discoveryContent
                .filter((d) => d.route_stop_id === activeStop.id)
                .sort((a, b) => a.sequence_order - b.sequence_order);

              return (
                <DiscoveryContentModalBody
                  activeStop={activeStop}
                  entriesForStop={entriesForStop}
                  discoveryError={discoveryError}
                  discoveryLoading={discoveryLoading}
                  discoverySaving={discoverySaving}
                  editingEntryId={editingEntryId}
                  discoveryForm={discoveryForm}
                  setDiscoveryForm={setDiscoveryForm}
                  canSubmitDiscoveryEntry={canSubmitDiscoveryEntry}
                  onStartNew={startNewDiscoveryEntry}
                  onStartEdit={startEditDiscoveryEntry}
                  onDelete={handleDeleteDiscoveryEntry}
                  onCancelEdit={() => setEditingEntryId(null)}
                  onSave={handleSaveDiscoveryEntry}
                />
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
