import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, X } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { usePageTitle } from "@/lib/page-title";
import { fetchTrailDetail } from "@/lib/trail-query";
import { fetchSavedPlaceIds } from "@/lib/saved-places";
import { fetchSavedBusinessIds } from "@/lib/saved-businesses";
import { getOpenStatus } from "@/lib/hours";
import {
  PERSONAL_STOP_LIMIT,
  DEFAULT_PERSONAL_TRAIL_NAME,
  PersonalTrailError,
  cleanTrailName,
  createPersonalTrail,
  deletePersonalTrail,
  fetchLocationsWithEntries,
  fetchStopHours,
  orderNearestNext,
  renamePersonalTrail,
  savePersonalTrailStops,
  type LocatedPersonalStop,
} from "@/lib/personal-trails";
import { PlaceBusinessPicker, type PickedLocation } from "@/components/admin/place-business-picker";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageContainer } from "@/components/public/page-container";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ADMIN_SCROLL_CLASS } from "@/components/admin/admin-form-card";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BuilderStop extends LocatedPersonalStop {
  name: string;
}

const sameStop = (a: BuilderStop, b: BuilderStop) => a.type === b.type && a.id === b.id;

function NameField({ name, onChange }: Readonly<{ name: string; onChange: (value: string) => void }>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="trail-name">Name</Label>
      <Input
        id="trail-name"
        value={name}
        maxLength={60}
        placeholder={DEFAULT_PERSONAL_TRAIL_NAME}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">Only you can see this trail.</p>
    </div>
  );
}

function StopRow({
  stop,
  index,
  hours,
  now,
  onRemove,
}: Readonly<{ stop: BuilderStop; index: number; hours: string | null | undefined; now: Date; onRemove: (stop: BuilderStop) => void }>) {
  const status = getOpenStatus(hours, now);
  return (
    <li className="flex items-center gap-3 p-3">
      <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">{stop.name}</span>
        {status && (
          <span className={`truncate text-xs ${status.open ? "text-primary" : "text-destructive"}`}>
            {status.label}
            {status.detail && ` · ${status.detail}`}
          </span>
        )}
      </div>
      <Badge variant="secondary" className="shrink-0">
        {stop.type === "place" ? "Place" : "Business"}
      </Badge>
      <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(stop)} aria-label={`Remove ${stop.name}`}>
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}

// plain: the stops sit inside a card already (desktop), so the list drops its
// own border and fill instead of nesting a card in a card.
function StopsSection({
  stops,
  hoursById,
  now,
  onRemove,
  plain = false,
}: Readonly<{
  stops: BuilderStop[];
  hoursById: Map<string, string | null>;
  now: Date;
  onRemove: (stop: BuilderStop) => void;
  plain?: boolean;
}>) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground">Stops</h2>
        <span className="text-xs text-muted-foreground">
          {stops.length} of {PERSONAL_STOP_LIMIT}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Stops are put in order for you, nearest next, starting from the first one you pick.
      </p>
      {stops.length === 0 ? (
        <EmptyState icon={MapPin}>Stops you add will appear here.</EmptyState>
      ) : (
        <ol
          className={cn(
            "flex flex-col divide-y divide-border",
            !plain && "rounded-lg border border-border bg-card"
          )}
        >
          {stops.map((stop, index) => (
            <StopRow
              key={`${stop.type}-${stop.id}`}
              stop={stop}
              index={index}
              hours={hoursById.get(stop.id)}
              now={now}
              onRemove={onRemove}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function PickerSection({
  stops,
  atLimit,
  savedIds,
  markedIds,
  onPick,
}: Readonly<{
  stops: BuilderStop[];
  atLimit: boolean;
  savedIds: Set<string>;
  markedIds: Set<string>;
  onPick: (location: PickedLocation) => void;
}>) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">Add stops</h2>
      {atLimit ? (
        <p className="text-sm text-muted-foreground">You have {PERSONAL_STOP_LIMIT} stops. Remove one to add another.</p>
      ) : (
        <PlaceBusinessPicker
          onPick={onPick}
          excludeIds={new Set(stops.map((s) => s.id))}
          includePending
          variant="cards"
          savedIds={savedIds}
          markedIds={markedIds}
        />
      )}
    </section>
  );
}

// What sits under Save: why it is disabled, or why the save failed.
function SaveNotes({ empty, error }: Readonly<{ empty: boolean; error: string | null }>) {
  return (
    <>
      {empty && <p className="text-xs text-muted-foreground">Add at least one stop to save.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}

function DeleteTrailDialog({
  open,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: Readonly<{
  open: boolean;
  deleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this trail?</DialogTitle>
          <DialogDescription>This removes the trail and your progress on it. It can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A signed-in user's own trail builder: /trails/new makes one, /trails/:id/edit
 * changes one. docs/user-trails-plan.md. Both routes sit behind ProtectedRoute
 * in App.tsx, so a direct visit signed out goes to /login. The "Make a trail"
 * button (next phase) asks a signed-out visitor to sign in in place.
 *
 * The person picks stops with the same PlaceBusinessPicker the staff builder
 * uses (saved ones listed first, pending businesses allowed). They never order
 * stops by hand: the list is kept nearest-next, starting from their first pick
 * (orderNearestNext), so what they see is what is saved. Name is optional and
 * becomes "My trail". Saving goes through personal-trails.ts, then opens the
 * trail page, which is the same player an official trail uses.
 *
 * A stop that stays on the trail keeps its saved row (savePersonalTrailStops),
 * so editing does not wipe walk progress for stops that remain.
 *
 * Two states, the same split profile.tsx and vendor-dashboard.tsx use (useIsMobile).
 * Mobile: one stacked column with a back button, stops, then the picker, then
 * Save. Desktop: a Trails > title breadcrumb and two cards side by side, the
 * name and stops with Save on the left, the picker on the right, so a person
 * sees what they have while they search for more.
 *
 * Each stop shows open or closed as of now (getOpenStatus, from the stop's
 * stored hours), so nobody plans a walk to a closed door. A stop with no hours,
 * or hours only in old free text, shows nothing rather than a guess.
 */
export default function TrailBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id !== undefined;
  usePageTitle(editing ? "Edit trail" : "Make a trail");
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id;
  const isMobile = useIsMobile();

  const [name, setName] = useState("");
  // The stored name, to rename only when it changed.
  const [savedName, setSavedName] = useState("");
  const [stops, setStops] = useState<BuilderStop[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // Places and businesses that hold a secret (locations_with_entries, 0055).
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  // Stored opening hours by stop id, read once per stop (fetchStopHours).
  const [hoursById, setHoursById] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit mode: load the trail. fetchTrailDetail returns a personal trail only
  // to its owner, and anything else (an official trail, someone else's id)
  // reads as not found here.
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    fetchTrailDetail(id)
      .then((detail) => {
        if (!detail?.personal) {
          setNotFound(true);
          return;
        }
        setName(detail.name);
        setSavedName(detail.name);
        setStops(
          detail.stops.map((s) => ({
            type: s.stop_type,
            id: s.stop_id,
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
          }))
        );
      })
      .catch(() => setLoadError("Couldn't load this trail. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [id, reload]);

  // What the person saved, so the picker can list it first. A failed read just
  // means no "Saved" shortcut, the search still works.
  useEffect(() => {
    if (!userId) return;
    Promise.all([fetchSavedPlaceIds(userId), fetchSavedBusinessIds(userId)])
      .then(([places, businesses]) => setSavedIds(new Set([...places, ...businesses])))
      .catch(() => setSavedIds(new Set()));
  }, [userId]);

  // Which places hold a secret, so the picker can mark them. Same fallback: no
  // marks if the read fails, the picker still works.
  useEffect(() => {
    if (!userId) return;
    fetchLocationsWithEntries()
      .then(setMarkedIds)
      .catch(() => setMarkedIds(new Set()));
  }, [userId]);

  // Reads hours for any stop not read yet, whether just picked or loaded from a
  // saved trail. A failed read leaves those stops without a mark, and the next
  // pick tries them again.
  useEffect(() => {
    const missing = stops.filter((s) => !hoursById.has(s.id));
    if (missing.length === 0) return;
    let cancelled = false;
    fetchStopHours(missing)
      .then((found) => {
        if (cancelled) return;
        setHoursById((current) => {
          const next = new Map(current);
          for (const s of missing) next.set(s.id, found.get(s.id) ?? null);
          return next;
        });
      })
      .catch(() => {
        // No open or closed mark for these stops, the builder still works.
      });
    return () => {
      cancelled = true;
    };
  }, [stops, hoursById]);

  const now = new Date();
  const atLimit = stops.length >= PERSONAL_STOP_LIMIT;

  function handlePick(location: PickedLocation) {
    if (atLimit) return;
    setStops((current) =>
      orderNearestNext([
        ...current,
        {
          type: location.type,
          id: location.id,
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      ])
    );
  }

  function handleRemove(stop: BuilderStop) {
    setStops((current) => orderNearestNext(current.filter((s) => !sameStop(s, stop))));
  }

  async function handleSave() {
    if (!userId || saving || stops.length === 0) return;
    setSaving(true);
    setSaveError(null);
    const list = stops.map((s) => ({ type: s.type, id: s.id }));
    try {
      if (id) {
        await savePersonalTrailStops(userId, id, list);
        if (cleanTrailName(name) !== savedName) await renamePersonalTrail(userId, id, name);
        navigate(`/trails/${id}`);
      } else {
        const newId = await createPersonalTrail(userId, name, list);
        navigate(`/trails/${newId}`, { replace: true });
      }
    } catch (err) {
      setSaveError(
        err instanceof PersonalTrailError ? err.message : "Couldn't save your trail. Check your connection and try again."
      );
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!userId || !id || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePersonalTrail(userId, id);
      navigate("/trails", { replace: true });
    } catch {
      setDeleteError("Couldn't delete this trail. Try again.");
      setDeleting(false);
    }
  }

  const title = editing ? "Edit trail" : "Make a trail";
  // Mobile: the back button every detail page uses. Desktop: the breadcrumb
  // heading the other desktop states use (AdminPageHeader).
  const header = isMobile ? (
    <div className="flex items-center">
      <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Button>
    </div>
  ) : (
    <AdminPageHeader breadcrumb={[{ label: "Trails", to: "/trails" }]} title={title} />
  );

  if (loadError) {
    return (
      <PageContainer width="form">
        {header}
        <ErrorState onRetry={() => setReload((n) => n + 1)}>{loadError}</ErrorState>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer width="form">
        {header}
        <p className="text-base text-muted-foreground">Loading…</p>
      </PageContainer>
    );
  }

  if (notFound) {
    return (
      <PageContainer width="form">
        {header}
        <p className="text-base text-muted-foreground">This trail couldn&apos;t be found.</p>
      </PageContainer>
    );
  }

  const nameField = <NameField name={name} onChange={setName} />;
  const stopsSection = <StopsSection stops={stops} hoursById={hoursById} now={now} onRemove={handleRemove} />;
  const desktopStopsSection = (
    <StopsSection stops={stops} hoursById={hoursById} now={now} onRemove={handleRemove} plain />
  );
  const pickerSection = (
    <PickerSection stops={stops} atLimit={atLimit} savedIds={savedIds} markedIds={markedIds} onPick={handlePick} />
  );
  const saveButton = (
    <Button type="button" onClick={handleSave} disabled={saving || stops.length === 0}>
      {saving ? "Saving…" : "Save trail"}
    </Button>
  );
  const deleteButton = editing ? (
    <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)}>
      Delete trail
    </Button>
  ) : null;
  const saveNotes = <SaveNotes empty={stops.length === 0} error={saveError} />;
  const deleteDialog = (
    <DeleteTrailDialog
      open={deleteOpen}
      deleting={deleting}
      error={deleteError}
      onOpenChange={setDeleteOpen}
      onConfirm={handleDelete}
    />
  );

  // Mobile state: one stacked column, Save and Delete full width at the end.
  if (isMobile) {
    return (
      <PageContainer width="form" className="gap-6">
        {header}
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {nameField}
        {stopsSection}
        {pickerSection}
        <div className="flex flex-col gap-1">
          {saveButton}
          {saveNotes}
        </div>
        {deleteButton}
        {deleteDialog}
      </PageContainer>
    );
  }

  // Desktop state, fit to the viewport like the stepped forms (vendor-dashboard.tsx,
  // admin pages): the page never scrolls. h-full bounds it, the left card
  // (name and stops) and the picker on the right scroll their own content
  // (ADMIN_SCROLL_CLASS), and Delete and Save stay pinned under the left card.
  // The picker has no card around it: its photo cards are the surface.
  return (
    <PageContainer width="wide" className="h-full min-h-0">
      {header}
      <div className="grid min-h-0 grow grid-cols-[minmax(0,2fr)_minmax(0,3fr)] grid-rows-[minmax(0,1fr)] gap-6">
        <div className="flex min-h-0 flex-col gap-4">
          <div
            className={cn(
              "flex flex-col gap-6 rounded-lg border border-border bg-card p-4",
              ADMIN_SCROLL_CLASS
            )}
          >
            {nameField}
            {desktopStopsSection}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              {deleteButton ?? <span />}
              {saveButton}
            </div>
            {saveNotes}
          </div>
        </div>
        {/* -m-2 p-2: room inside the scroll area so a card's lift and focus ring are not clipped. */}
        <div className={cn(ADMIN_SCROLL_CLASS, "-m-2 p-2")}>{pickerSection}</div>
      </div>
      {deleteDialog}
    </PageContainer>
  );
}
