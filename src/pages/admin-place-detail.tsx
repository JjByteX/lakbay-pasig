import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Storage bucket for place photos. Not yet created by any migration in this
// repo, per architecture-notes.md's "what must never be touched without
// approval" (schema changes) — bucket creation is a Supabase dashboard/
// migration step outside this phase's file scope. Flagging here rather than
// silently inventing infra: create a public bucket named "place-photos"
// before this upload flow can succeed end to end.
const PHOTO_BUCKET = "place-photos";

// Supabase public URLs look like
// ".../storage/v1/object/public/<bucket>/<path>". place_photos only stores
// the public URL (see handlePhotoSelected), not the raw path, so deleting
// the file requires recovering <path> from it.
function getStoragePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

const CATEGORIES = ["Heritage Site", "Museum", "Monument", "Church", "Cultural Site"] as const;
const LANGUAGES = ["English", "Filipino", "Both"] as const;
const FACILITY_OPTIONS = ["Restrooms", "Parking", "Info Desk", "Waiting Area"] as const;

interface PlaceFormState {
  name: string;
  category: string;
  description: string;
  historical_background: string;
  historical_significance: string;
  year_or_period: string;
  source_reference: string;
  address: string;
  operating_hours: string;
  entrance_fee: string;
  visit_duration: string;
  accessibility_info: string;
  facilities: string[];
  nearby_places: string;
  language: string;
}

const EMPTY_FORM: PlaceFormState = {
  name: "",
  category: "",
  description: "",
  historical_background: "",
  historical_significance: "",
  year_or_period: "",
  source_reference: "",
  address: "",
  operating_hours: "",
  entrance_fee: "",
  visit_duration: "",
  accessibility_info: "",
  facilities: [],
  nearby_places: "",
  language: "",
};

interface PlacePhoto {
  id: string;
  photo_url: string;
  photo_type: "historical" | "current";
  sort_order: number;
}

interface PlaceReviewEntry {
  id: string;
  staff_id: string;
  staff_name: string | null;
  action: "verify" | "reject";
  notes: string | null;
  created_at: string;
}

// Raw shape returned by the place_reviews select below, before mapping into
// PlaceReviewEntry. Supabase types a select(...profiles(display_name)) join
// as an array even for a one-to-one relationship, so profiles comes back as
// a (possibly empty) array here, not a single nullable object.
interface PlaceReviewRow {
  id: string;
  staff_id: string;
  action: "verify" | "reject";
  notes: string | null;
  created_at: string;
  profiles: { display_name: string | null }[];
}

interface PlaceRecord extends PlaceFormState {
  id: string;
  verification_status: "pending" | "verified" | "rejected";
  reviewed_by: string | null;
}

const STATUS_VARIANT = {
  pending: "outline",
  verified: "default",
  rejected: "destructive",
} as const;

export default function AdminPlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [form, setForm] = useState<PlaceFormState>(EMPTY_FORM);
  const [status, setStatus] = useState<PlaceRecord["verification_status"] | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historicalPhotos, setHistoricalPhotos] = useState<PlacePhoto[]>([]);
  const [currentPhotos, setCurrentPhotos] = useState<PlacePhoto[]>([]);
  const [uploading, setUploading] = useState<"historical" | "current" | null>(null);

  const [reviews, setReviews] = useState<PlaceReviewEntry[] | null>(null);

  const [reviewAction, setReviewAction] = useState<"verify" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;

    setLoading(true);
    supabase
      .from("places")
      .select(
        "id, name, category, description, historical_background, historical_significance, year_or_period, source_reference, address, operating_hours, entrance_fee, visit_duration, accessibility_info, facilities, nearby_places, language, verification_status, reviewed_by"
      )
      .eq("id", id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError("Could not load this place.");
          setLoading(false);
          return;
        }
        setForm({
          name: data.name ?? "",
          category: data.category ?? "",
          description: data.description ?? "",
          historical_background: data.historical_background ?? "",
          historical_significance: data.historical_significance ?? "",
          year_or_period: data.year_or_period ?? "",
          source_reference: data.source_reference ?? "",
          address: data.address ?? "",
          operating_hours: data.operating_hours ?? "",
          entrance_fee: data.entrance_fee ?? "",
          visit_duration: data.visit_duration ?? "",
          accessibility_info: data.accessibility_info ?? "",
          facilities: data.facilities ?? [],
          nearby_places: data.nearby_places ?? "",
          language: data.language ?? "",
        });
        setStatus(data.verification_status);
        setLoading(false);
      });

    supabase
      .from("place_photos")
      .select("id, photo_url, photo_type, sort_order")
      .eq("place_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setHistoricalPhotos((data ?? []).filter((p) => p.photo_type === "historical"));
        setCurrentPhotos((data ?? []).filter((p) => p.photo_type === "current"));
      });

    // 5.6: full review history, staff id, action, notes, timestamp, newest
    // first, per admin-panel-spec.md's Review Action Log. place_reviews
    // widened in migration 0014 (phase-5-decisions.md Decision 3) to a
    // type-plus-id pair so Trail Content reviews can reuse this table too
    // — this page is specifically the Place detail page, so it must filter
    // on reviewed_type = 'place' explicitly, not just reviewed_id, or a
    // discovery_content.id that happens to collide with this place's id
    // would incorrectly show up here.
    supabase
      .from("place_reviews")
      .select("id, staff_id, action, notes, created_at, profiles(display_name)")
      .eq("reviewed_type", "place")
      .eq("reviewed_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setReviews(
          (data ?? []).map((r: PlaceReviewRow) => ({
            id: r.id,
            staff_id: r.staff_id,
            staff_name: r.profiles[0]?.display_name ?? null,
            action: r.action,
            notes: r.notes,
            created_at: r.created_at,
          }))
        );
      });
  }, [id, isNew]);

  // Row action menu in the Places table (5.2) links here with ?review=verify
  // or ?review=reject so Verify/Reject is a single click from the list,
  // instead of forcing View then Verify as two separate steps.
  useEffect(() => {
    const requested = searchParams.get("review");
    if (requested === "verify" || requested === "reject") {
      openReviewDialog(requested);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("review");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function updateField<K extends keyof PlaceFormState>(key: K, value: PlaceFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFacility(facility: string) {
    setForm((prev) => ({
      ...prev,
      facilities: prev.facilities.includes(facility)
        ? prev.facilities.filter((f) => f !== facility)
        : [...prev.facilities, facility],
    }));
  }

  const canSubmit = form.name.trim().length > 0 && form.category.length > 0 && form.address.trim().length > 0 && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    const payload = { ...form, updated_at: new Date().toISOString() };

    if (isNew) {
      const { data, error: insertError } = await supabase
        .from("places")
        .insert(payload)
        .select("id")
        .single();

      setSaving(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "Could not create this place.");
        return;
      }
      navigate(`/admin/places/${data.id}`, { replace: true });
      return;
    }

    const { error: updateError } = await supabase.from("places").update(payload).eq("id", id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate("/admin/places");
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>, photoType: "historical" | "current") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;

    setUploading(photoType);
    setError(null);

    const path = `${id}/${photoType}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file);

    if (uploadError) {
      setUploading(null);
      setError(`Photo upload failed: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    const list = photoType === "historical" ? historicalPhotos : currentPhotos;

    const { data: inserted, error: insertError } = await supabase
      .from("place_photos")
      .insert({
        place_id: id,
        photo_url: publicUrlData.publicUrl,
        photo_type: photoType,
        sort_order: list.length,
      })
      .select("id, photo_url, photo_type, sort_order")
      .single();

    setUploading(null);

    if (insertError || !inserted) {
      setError(insertError?.message ?? "Could not save the uploaded photo.");
      return;
    }

    if (photoType === "historical") {
      setHistoricalPhotos((prev) => [...prev, inserted]);
    } else {
      setCurrentPhotos((prev) => [...prev, inserted]);
    }
  }

  async function handleRemovePhoto(photo: PlacePhoto, photoType: "historical" | "current") {
    const { error: deleteError } = await supabase.from("place_photos").delete().eq("id", photo.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    // Remove the underlying file too, not just the place_photos row, or the
    // object is orphaned in the bucket. photo_url is the public URL from
    // handlePhotoSelected's getPublicUrl call above; the storage-relative
    // path is everything after the bucket name segment in that URL. A
    // failure here is logged, not surfaced, since the DB row (the part the
    // rest of the app reads) is already gone and correct either way.
    const storagePath = getStoragePathFromPublicUrl(photo.photo_url);
    if (storagePath) {
      const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
      if (storageError) {
        console.error("Failed to remove photo from storage:", storageError.message);
      }
    }

    if (photoType === "historical") {
      setHistoricalPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } else {
      setCurrentPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    }
  }

  function openReviewDialog(action: "verify" | "reject") {
    setReviewAction(action);
    setReviewNotes("");
    setReviewError(null);
  }

  async function handleReviewSubmit() {
    if (!id || !profile) return;
    if (reviewAction === "reject" && reviewNotes.trim().length === 0) {
      setReviewError("Rejecting requires a note explaining why.");
      return;
    }

    setReviewSubmitting(true);
    setReviewError(null);

    const nextStatus = reviewAction === "verify" ? "verified" : "rejected";

    // Same submit writes both the audit log row and the record's current
    // state, per admin-panel-spec.md Review Action Log and plan 5.5.
    // place_id widened to reviewed_type/reviewed_id in migration 0014
    // (phase-5-decisions.md Decision 3) — this page always writes
    // reviewed_type = 'place', since it only ever reviews a places row.
    const { data: insertedReview, error: reviewInsertError } = await supabase
      .from("place_reviews")
      .insert({
        reviewed_type: "place",
        reviewed_id: id,
        staff_id: profile.id,
        action: reviewAction,
        notes: reviewNotes.trim() || null,
      })
      .select("id, staff_id, action, notes, created_at")
      .single();

    if (reviewInsertError) {
      setReviewSubmitting(false);
      setReviewError(reviewInsertError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("places")
      .update({
        verification_status: nextStatus,
        reviewed_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setReviewSubmitting(false);

    if (updateError) {
      setReviewError(updateError.message);
      return;
    }

    setStatus(nextStatus);
    if (insertedReview) {
      setReviews((prev) => [
        {
          id: insertedReview.id,
          staff_id: insertedReview.staff_id,
          staff_name: profile.display_name ?? null,
          action: insertedReview.action,
          notes: insertedReview.notes,
          created_at: insertedReview.created_at,
        },
        ...(prev ?? []),
      ]);
    }
    setReviewAction(null);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {isNew ? "New Place" : form.name || "Edit Place"}
          </h1>
          {status && <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>}
        </div>
        {!isNew && status === "pending" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openReviewDialog("reject")}>
              Reject
            </Button>
            <Button onClick={() => openReviewDialog("verify")}>Verify</Button>
          </div>
        )}
      </div>

      {isNew ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <PlaceFormFields
            form={form}
            updateField={updateField}
            toggleFacility={toggleFacility}
          />

          <p className="text-sm text-muted-foreground">
            Save this place before adding historical or current photos.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/admin/places")}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? "Saving…" : "Create Place"}
            </Button>
          </div>
        </form>
      ) : (
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Current Info</TabsTrigger>
            <TabsTrigger value="history">Review History</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <PlaceFormFields
                form={form}
                updateField={updateField}
                toggleFacility={toggleFacility}
              />

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <PhotoUploadArea
                  label="Historical Photos"
                  photos={historicalPhotos}
                  uploading={uploading === "historical"}
                  onSelect={(e) => handlePhotoSelected(e, "historical")}
                  onRemove={(photo) => handleRemovePhoto(photo, "historical")}
                />
                <PhotoUploadArea
                  label="Current Photos"
                  photos={currentPhotos}
                  uploading={uploading === "current"}
                  onSelect={(e) => handlePhotoSelected(e, "current")}
                  onRemove={(photo) => handleRemovePhoto(photo, "current")}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => navigate("/admin/places")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="history">
            <ReviewHistoryList reviews={reviews} />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={reviewAction !== null} onOpenChange={(open) => !open && setReviewAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "verify" ? "Verify this place?" : "Reject this place?"}</DialogTitle>
            <DialogDescription>
              {reviewAction === "verify"
                ? "This place will be marked verified and visible to the public."
                : "Explain what needs to change. The submitter's record stays visible in the review history."}
            </DialogDescription>
          </DialogHeader>

          {reviewAction === "reject" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="review-notes">Review Notes</Label>
              <Textarea
                id="review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Reason for rejection"
                required
              />
            </div>
          )}

          {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewAction(null)} disabled={reviewSubmitting}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === "reject" ? "destructive" : "default"}
              onClick={handleReviewSubmit}
              disabled={reviewSubmitting || (reviewAction === "reject" && reviewNotes.trim().length === 0)}
            >
              {reviewSubmitting ? "Submitting…" : reviewAction === "verify" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlaceFormFields({
  form,
  updateField,
  toggleFacility,
}: {
  form: PlaceFormState;
  updateField: <K extends keyof PlaceFormState>(key: K, value: PlaceFormState[K]) => void;
  toggleFacility: (facility: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Place Name</Label>
          <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} required />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Category</Label>
          <Select value={form.category} onValueChange={(v) => updateField("category", v)}>
            <SelectTrigger id="category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="One line, what visitors can see or do there"
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="historical_background">Historical Background</Label>
        <Textarea
          id="historical_background"
          placeholder="The longer origin and development story"
          value={form.historical_background}
          onChange={(e) => updateField("historical_background", e.target.value)}
          className="min-h-30"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="historical_significance">Historical Significance</Label>
        <Textarea
          id="historical_significance"
          value={form.historical_significance}
          onChange={(e) => updateField("historical_significance", e.target.value)}
          className="min-h-30"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="year_or_period">Year Built or Historical Period</Label>
          <Input
            id="year_or_period"
            value={form.year_or_period}
            onChange={(e) => updateField("year_or_period", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="source_reference">Source or Reference</Label>
          <Input
            id="source_reference"
            value={form.source_reference}
            onChange={(e) => updateField("source_reference", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          placeholder="Source of truth, map coordinates are generated from this"
          value={form.address}
          onChange={(e) => updateField("address", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="operating_hours">Operating Hours</Label>
          <Input
            id="operating_hours"
            value={form.operating_hours}
            onChange={(e) => updateField("operating_hours", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="entrance_fee">Entrance Fee</Label>
          <Input
            id="entrance_fee"
            value={form.entrance_fee}
            onChange={(e) => updateField("entrance_fee", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="visit_duration">Estimated Visit Duration</Label>
          <Input
            id="visit_duration"
            value={form.visit_duration}
            onChange={(e) => updateField("visit_duration", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="language">Language</Label>
          <Select value={form.language} onValueChange={(v) => updateField("language", v)}>
            <SelectTrigger id="language">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="accessibility_info">Accessibility Info</Label>
        <Textarea
          id="accessibility_info"
          value={form.accessibility_info}
          onChange={(e) => updateField("accessibility_info", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Available Facilities</Label>
        <div className="flex flex-wrap gap-2">
          {FACILITY_OPTIONS.map((facility) => {
            const active = form.facilities.includes(facility);
            return (
              <Button
                key={facility}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => toggleFacility(facility)}
              >
                {facility}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="nearby_places">Nearby Places</Label>
        <Textarea
          id="nearby_places"
          value={form.nearby_places}
          onChange={(e) => updateField("nearby_places", e.target.value)}
        />
      </div>
    </>
  );
}

// 5.6: full place_reviews history, staff id (via display name), action,
// notes, timestamp. Lives in the Review History tab, separate from the
// Current Info tab per plan 5.6's no-fragmentation instruction.
function ReviewHistoryList({ reviews }: { reviews: PlaceReviewEntry[] | null }) {
  if (reviews === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">No review history yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {reviews.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {entry.staff_name ?? "Staff"}
            </span>
            <Badge variant={entry.action === "verify" ? "default" : "destructive"}>
              {entry.action === "verify" ? "Verified" : "Rejected"}
            </Badge>
          </div>
          {entry.notes && <p className="text-sm text-muted-foreground">{entry.notes}</p>}
          <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}

function PhotoUploadArea({
  label,
  photos,
  uploading,
  onSelect,
  onRemove,
}: {
  label: string;
  photos: PlacePhoto[];
  uploading: boolean;
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (photo: PlacePhoto) => void;
}) {
  const inputId = `photo-upload-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="flex flex-col gap-3">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-md border border-border">
            <img src={photo.photo_url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(photo)}
              className="absolute right-1 top-1 rounded-md bg-foreground/60 p-1 text-background opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove photo</span>
            </button>
          </div>
        ))}
        <label
          htmlFor={inputId}
          className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-muted-foreground hover:bg-muted"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-xs">{uploading ? "Uploading…" : "Add"}</span>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onSelect}
            disabled={uploading}
          />
        </label>
      </div>
      {photos.length === 0 && !uploading && (
        <p className="text-xs text-muted-foreground">No {label.toLowerCase()} yet.</p>
      )}
    </div>
  );
}
