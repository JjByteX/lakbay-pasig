import { useEffect, useState } from "react";
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

// Phase 4.2 (step-4-phases.md): stepper layout, not sidebar-style, per
// ux-ui-guidelines.md's Layout Pattern Rules ("linear flow ... never use a
// sidebar"). No existing stepper component in this codebase
// (grep confirmed), so this is a plain index-based control built from
// existing Button/Badge primitives rather than repurposing Tabs, which
// this codebase already uses for non-linear content switching
// (admin-place-detail.tsx's Current Info / Review History) — reusing it
// here would blur that distinction rather than reuse a pattern.
//
// Four steps named in step-4-phases.md 4.2: Info, Stops, Discovery
// Content, Review and Publish. Info (4.3) and Stops (4.5) are built here.
// Discovery Content is 5.1 scope, built below: a centered modal per
// stop, per ux-ui-guidelines.md's modal rule (focused task, fits one
// viewport), not a side panel. needs_place_review (5.2) is computed by
// migration 0012's trigger on every insert/update to discovery_content,
// this page never sets it on a write — see the insert/update calls below.
// The Places queue extension (5.3) that surfaces flagged rows is built in
// admin-places.tsx / admin-discovery-content-review.tsx.
// Review and Publish (5.4) is now built: a trail-wide summary (stop count,
// discovery content count, any flagged entries with a link to
// admin-discovery-content-review.tsx) plus the same publish/unpublish gate
// admin-trails.tsx's list page already applies (Phase 5.4, partial, per
// architecture-notes.md) — no stops, or any linked discovery_content still
// needs_place_review, blocks draft -> published with a visible reason, per
// ux-ui-guidelines.md's Disabled/gated rule and admin-panel-spec.md's Trail
// Publishing exception. Unpublishing a live trail is never blocked, same as
// the list page.

const STEPS = ["Info", "Stops", "Discovery Content", "Review and Publish"] as const;
type Step = (typeof STEPS)[number];

const THEMES = ["heritage walk", "food crawl", "cultural tour"] as const;
const RUN_TYPES = ["CATO guided", "self guided"] as const;

interface TrailInfoFormState {
  name: string;
  theme: string;
  estimated_duration: string;
  estimated_budget: string;
  recommended_time: string;
  run_type: string;
}

const EMPTY_INFO: TrailInfoFormState = {
  name: "",
  theme: "",
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

export default function AdminTrailBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [step, setStep] = useState<Step>("Info");
  const [routeId, setRouteId] = useState<string | null>(isNew ? null : id ?? null);
  const [status, setStatus] = useState<"draft" | "published">("draft");

  const [info, setInfo] = useState<TrailInfoFormState>(EMPTY_INFO);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [stops, setStops] = useState<StopRow[]>([]);
  const [stopsLoading, setStopsLoading] = useState(!isNew);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [savingStops, setSavingStops] = useState(false);

  // 5.1: discovery content, loaded once per trail alongside stops (both
  // read from routeId), not lazily per stop, so the Stops step's own list
  // (see the "content count" badge below) and the Discovery Content step
  // share one source of truth instead of two independent fetches drifting.
  const [discoveryContent, setDiscoveryContent] = useState<DiscoveryContentRow[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(!isNew);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoverySaving, setDiscoverySaving] = useState(false);
  // Which stop's modal is open, null when closed. Set to a stop id to open
  // the list-for-that-stop view; editingEntryId then narrows to the add/edit
  // form within it.
  const [discoveryModalStopId, setDiscoveryModalStopId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | "new" | null>(null);
  const [discoveryForm, setDiscoveryForm] = useState<DiscoveryContentFormState>(EMPTY_DISCOVERY_FORM);

  // 5.4: Review and Publish. Mirrors admin-trails.tsx's publish gate exactly
  // (same two blocking conditions, same message/link shape), per constraints.md's
  // Inventory Before Suggesting rule — this is the same gate, reached from
  // inside the builder instead of the list row.
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishError, setPublishError] = useState<{ message: string; link: { href: string; label: string } | null } | null>(null);

  useEffect(() => {
    if (isNew || !routeId) return;

    setLoading(true);
    setNotFound(false);
    supabase
      .from("routes")
      .select("id, name, theme, estimated_duration, estimated_budget, recommended_time, run_type, status")
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
          theme: data.theme ?? "",
          estimated_duration: data.estimated_duration ?? "",
          estimated_budget: data.estimated_budget ?? "",
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
  }

  const canSaveInfo = info.name.trim().length > 0 && !saving;

  // 4.3: saves as a routes row with status = draft, per step-4-phases.md.
  // Info step only ever creates/updates the routes row itself — stops and
  // publish status are handled by their own steps.
  async function handleSaveInfo() {
    if (!canSaveInfo || !profile) return;

    setSaving(true);
    setError(null);

    const payload = {
      name: info.name.trim(),
      theme: info.theme || null,
      estimated_duration: info.estimated_duration || null,
      estimated_budget: info.estimated_budget || null,
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
      setStops([]);
      setStopsLoading(false);
      navigate(`/admin/trails/${data.id}`, { replace: true });
      setStep("Stops");
      return;
    }

    const { error: updateError } = await supabase.from("routes").update(payload).eq("id", routeId!);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStep("Stops");
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
  async function persistStops(nextStops: StopRow[]) {
    if (!routeId) return;

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
        return;
      }
    }

    // Phase 1: push every survivor out of the (route_id, sequence_order)
    // range any row could currently hold, so phase 2's real values can
    // never collide with a survivor still sitting at its old position.
    for (const [index, s] of survivors.entries()) {
      const { error: offsetError } = await supabase
        .from("route_stops")
        .update({ sequence_order: -1 * (index + 1) })
        .eq("id", s.id);
      if (offsetError) {
        setSavingStops(false);
        setStopsError(offsetError.message);
        return;
      }
    }

    // Phase 2: set every survivor's real final sequence_order, matching
    // its position in nextStops.
    for (const s of survivors) {
      const { error: finalizeError } = await supabase
        .from("route_stops")
        .update({ sequence_order: nextStops.indexOf(s) })
        .eq("id", s.id);
      if (finalizeError) {
        setSavingStops(false);
        setStopsError(finalizeError.message);
        return;
      }
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
      // already had in hand.
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
        setSavingStops(false);
        setStopsError(
          `"${invalidStop.name}" is no longer available to add — it may have been removed or is no longer verified. Refresh and try again.`
        );
        return;
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
        setSavingStops(false);
        setStopsError(insertError?.message ?? "Could not save stop order.");
        return;
      }
      insertedRows = inserted;
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

  // 5.4: same two blocking conditions as admin-trails.tsx's handleTogglePublish
  // — no stops, or any linked discovery_content still needs_place_review —
  // per admin-panel-spec.md's Trail Publishing exception and
  // ux-ui-guidelines.md's Disabled/gated rule (visible reason, link to the
  // blocking content). Unpublishing a live trail is never blocked, matching
  // the list page. flaggedEntries below (computed at render) supplies the
  // first flagged entry the same way blockingEntry does there.
  async function handleTogglePublish() {
    if (!routeId) return;
    setPublishError(null);

    if (status === "draft" && stops.length === 0) {
      setPublishError({ message: "Add at least one stop before publishing this trail.", link: null });
      return;
    }

    const firstFlagged = discoveryContent.find((entry) => entry.needs_place_review);
    if (status === "draft" && firstFlagged) {
      setPublishError({
        message: `"${firstFlagged.title}" still needs review before this trail can publish.`,
        link: { href: `/admin/places/discovery/${firstFlagged.id}`, label: "Review it" },
      });
      return;
    }

    setPublishSaving(true);
    const nextStatus = status === "draft" ? "published" : "draft";

    const { error: updateError } = await supabase
      .from("routes")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", routeId);

    setPublishSaving(false);
    if (updateError) {
      setPublishError({ message: updateError.message, link: null });
      return;
    }
    setStatus(nextStatus);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound) {
    return <p className="text-sm text-destructive">Could not load this trail.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {isNew && !routeId ? "New Trail" : info.name || "Edit Trail"}
          </h1>
          {routeId && <Badge variant={status === "published" ? "default" : "outline"}>{status}</Badge>}
        </div>
      </div>

      <StepIndicator
        currentStep={step}
        onSelect={setStep}
        // Stops, Discovery Content, and Review and Publish all need a
        // saved routes row to attach to, per 4.3's "saves as a routes row"
        // — a brand new trail can't jump ahead until Info is saved once.
        disabledSteps={routeId ? new Set() : new Set<Step>(["Stops", "Discovery Content", "Review and Publish"])}
      />

      {step === "Info" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Route Name</Label>
              <Input id="name" value={info.name} onChange={(e) => updateInfoField("name", e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="theme">Theme</Label>
              <Select value={info.theme} onValueChange={(v) => updateInfoField("theme", v)}>
                <SelectTrigger id="theme">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="estimated_duration">Estimated Duration</Label>
              <Input
                id="estimated_duration"
                placeholder="e.g. 2 hours"
                value={info.estimated_duration}
                onChange={(e) => updateInfoField("estimated_duration", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="estimated_budget">Estimated Budget</Label>
              <Input
                id="estimated_budget"
                placeholder="e.g. ₱300–500"
                value={info.estimated_budget}
                onChange={(e) => updateInfoField("estimated_budget", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recommended_time">Recommended Time</Label>
              <Input
                id="recommended_time"
                placeholder="e.g. Weekend mornings"
                value={info.recommended_time}
                onChange={(e) => updateInfoField("recommended_time", e.target.value)}
              />
            </div>
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/admin/trails")}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveInfo} disabled={!canSaveInfo}>
              {saving ? "Saving…" : routeId ? "Save and Continue" : "Create Trail"}
            </Button>
          </div>
        </div>
      )}

      {step === "Stops" && routeId && (
        <div className="flex flex-col gap-4">
          {stopsError && <p className="text-sm text-destructive">{stopsError}</p>}

          {stopsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : stops.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stops yet.</p>
          ) : (
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
                      disabled={savingStops}
                      onClick={() => openDiscoveryModal(stop.id)}
                    >
                      <BookOpen className="h-4 w-4" />
                      Discovery Content
                      {discoveryContent.filter((d) => d.route_stop_id === stop.id).length > 0 && (
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
          )}

          <div>
            <Button type="button" variant="outline" onClick={() => setPickerOpen(true)} disabled={savingStops}>
              Add Stop
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

          {/* 5.1: centered modal per stop, per ux-ui-guidelines.md's modal
              rule — a focused task fitting one viewport, not a side panel.
              Reachable from the Discovery Content button above, on the same
              stop's row, so staff never has to remember which numbered stop
              they meant once they reach the separate Discovery Content step. */}
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
                  <>
                    <DialogHeader>
                      <DialogTitle>Discovery Content: {activeStop.name}</DialogTitle>
                    </DialogHeader>

                    {discoveryError && <p className="text-sm text-destructive">{discoveryError}</p>}

                    {editingEntryId === null ? (
                      <div className="flex flex-col gap-3">
                        {discoveryLoading ? (
                          <p className="text-sm text-muted-foreground">Loading…</p>
                        ) : entriesForStop.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No discovery content yet.</p>
                        ) : (
                          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
                            {entriesForStop.map((entry) => (
                              <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
                                <div className="flex min-w-0 flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                                      {entry.sequence_order}
                                    </span>
                                    <span className="truncate text-sm font-semibold text-foreground">
                                      {entry.title}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Unlocks within {entry.unlock_radius}m
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => startEditDiscoveryEntry(entry)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    <span className="sr-only">Edit</span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    disabled={discoverySaving}
                                    onClick={() => handleDeleteDiscoveryEntry(entry.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Delete</span>
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div>
                          <Button type="button" variant="outline" onClick={() => startNewDiscoveryEntry(activeStop)}>
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
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="discovery_content_text">Content</Label>
                          <Textarea
                            id="discovery_content_text"
                            className="min-h-30"
                            value={discoveryForm.content}
                            onChange={(e) => setDiscoveryForm((prev) => ({ ...prev, content: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="discovery_sequence_order">Sequence Order</Label>
                            <Input
                              id="discovery_sequence_order"
                              type="number"
                              min={1}
                              value={discoveryForm.sequence_order}
                              onChange={(e) =>
                                setDiscoveryForm((prev) => ({ ...prev, sequence_order: e.target.value }))
                              }
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="discovery_unlock_radius">Unlock Radius (meters)</Label>
                            <Input
                              id="discovery_unlock_radius"
                              type="number"
                              min={1}
                              value={discoveryForm.unlock_radius}
                              onChange={(e) =>
                                setDiscoveryForm((prev) => ({ ...prev, unlock_radius: e.target.value }))
                              }
                              required
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setEditingEntryId(null)}>
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleSaveDiscoveryEntry(activeStop)}
                            disabled={!canSubmitDiscoveryEntry}
                          >
                            {discoverySaving ? "Saving…" : editingEntryId === "new" ? "Add" : "Save Changes"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {step === "Discovery Content" && (
        <p className="text-sm text-muted-foreground">
          Discovery content is managed per stop from the Stops step above —
          open a stop's "Discovery Content" button to add, edit, or remove
          its content. See the Review and Publish step for a trail-wide
          summary, including anything still flagged for review.
        </p>
      )}

      {step === "Review and Publish" && routeId && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Stops</span>
              <span className="text-sm text-muted-foreground">{stops.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Discovery content</span>
              <span className="text-sm text-muted-foreground">{discoveryContent.length}</span>
            </div>
          </div>

          {/* 5.4: "any discovery content still flagged," per step-4-phases.md —
              needs_place_review comes from migration 0012's trigger, this step
              only reads it. Each row names which stop it's attached to, per
              step-4-plan.md's "show which stop's content is blocking," and
              links to admin-discovery-content-review.tsx, the same review
              destination admin-trails.tsx's list-page gate already links to
              (Phase 5.3). */}
          {(() => {
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
                      <Link
                        to={`/admin/places/discovery/${entry.id}`}
                        className="text-sm underline underline-offset-2"
                      >
                        Review it
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {publishError && (
            <p className="text-sm text-destructive">
              {publishError.message}
              {publishError.link && (
                <>
                  {" "}
                  <Link to={publishError.link.href} className="underline underline-offset-2">
                    {publishError.link.label}
                  </Link>
                </>
              )}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Badge variant={status === "published" ? "default" : "outline"}>{status}</Badge>
            <Button
              type="button"
              onClick={handleTogglePublish}
              disabled={
                publishSaving ||
                (status === "draft" &&
                  (stops.length === 0 || discoveryContent.some((entry) => entry.needs_place_review)))
              }
            >
              {publishSaving ? "Saving…" : status === "published" ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({
  currentStep,
  onSelect,
  disabledSteps,
}: {
  currentStep: Step;
  onSelect: (step: Step) => void;
  disabledSteps: Set<Step>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {STEPS.map((s, index) => {
        const isActive = s === currentStep;
        const isDisabled = disabledSteps.has(s);
        return (
          <Button
            key={s}
            type="button"
            variant={isActive ? "default" : "outline"}
            size="sm"
            disabled={isDisabled}
            onClick={() => onSelect(s)}
            className="gap-2"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/20 text-[10px]">
              {index + 1}
            </span>
            {s}
          </Button>
        );
      })}
    </div>
  );
}
