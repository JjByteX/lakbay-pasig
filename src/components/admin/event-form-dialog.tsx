import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { fetchActiveCategories, type EventCategory } from "@/lib/event-categories";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DateTimeField } from "@/components/ui/datetime-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isoToDateTimeLocalValue, parseDateTimeLocalValue } from "@/lib/datetime";
import { CharCount } from "@/components/business/business-fields";

// Announcements modal conversion: this dialog replaces the former
// admin-event-detail.tsx route (create + edit at /admin/events/new and
// /admin/events/:id). Same fields, same validation, same publish/
// lifecycle_status actions -- only the shell changes, from a full page
// (with its own usePageTitle/navigate) to a controlled Dialog matching
// slide-form-dialog.tsx's open/onOpenChange/onSaved contract, since that's
// this codebase's one existing "list page owns a create/edit modal"
// precedent (admin-landing.tsx + slide-form-dialog.tsx). category-form-
// dialog.tsx is the other precedent but has no date/place/toggle fields to
// borrow from, so this follows slide-form-dialog.tsx's shape instead.
//
// Publish/lifecycle_status stay inside this dialog (not lifted back onto
// the list row) because both actions read live, unsaved form state
// (canPublish's missingRequiredFieldsFor check) -- admin-events.tsx's row
// action for these two, sourced from the already-fetched, possibly-stale
// EventRow, is unaffected and stays as-is.

const LIFECYCLE_STATUSES = ["upcoming", "ongoing", "past"] as const;

const LIFECYCLE_VARIANT = {
  upcoming: "secondary",
  ongoing: "accent",
  past: "outline",
} as const;

interface EventFormState {
  title: string;
  description: string;
  category_id: string;
  related_program: string;
  date_time: string;
  end_date_time: string;
  location: string;
  related_place_id: string;
  enrollment_info: string;
}

const EMPTY_FORM: EventFormState = {
  title: "",
  description: "",
  category_id: "",
  related_program: "",
  date_time: "",
  end_date_time: "",
  location: "",
  related_place_id: "",
  enrollment_info: "",
};

interface PlaceOption {
  id: string;
  name: string;
}

// 2.4: "Disabled publish button if required fields are missing," per
// ux-ui-guidelines.md's Disabled/gated rule. Unchanged from the former
// page's own copy.
function missingRequiredFieldsFor(form: EventFormState): string[] {
  const missing: string[] = [];
  if (form.title.trim().length === 0) missing.push("Event Title");
  if (form.description.trim().length === 0) missing.push("Description");
  if (form.category_id.trim().length === 0) missing.push("Category");
  if (form.date_time.trim().length === 0) missing.push("Date and Time");
  return missing;
}

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Event id being edited, or null for a new event. */
  eventId: string | null;
  onSaved: () => void;
}

export default function EventFormDialog({
  open,
  onOpenChange,
  eventId,
  onSaved,
}: Readonly<EventFormDialogProps>) {
  const isNew = eventId === null;
  const { profile } = useAuth();

  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [hasEndDateTime, setHasEndDateTime] = useState(false);
  const [published, setPublished] = useState(false);
  const [lifecycleStatus, setLifecycleStatus] = useState<(typeof LIFECYCLE_STATUSES)[number]>("upcoming");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [places, setPlaces] = useState<PlaceOption[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Reset to the event being edited, or a clean slate for New, every time
  // the dialog opens -- same reasoning slide-form-dialog.tsx's own effect
  // comment gives, this component instance is reused across every open.
  useEffect(() => {
    if (!open) return;
    setError(null);

    supabase
      .from("places")
      .select("id, name")
      .eq("verification_status", "verified")
      .order("name", { ascending: true })
      .then(({ data }) => setPlaces((data ?? []) as PlaceOption[]));

    fetchActiveCategories()
      .then(setCategories)
      .catch((err: unknown) => {
        setCategoriesError(err instanceof Error ? err.message : "Could not load categories.");
      });

    if (isNew) {
      setForm(EMPTY_FORM);
      setHasEndDateTime(false);
      setPublished(false);
      setLifecycleStatus("upcoming");
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from("events")
      .select(
        "title, description, category_id, related_program, date_time, end_date_time, location, related_place_id, enrollment_info, published, lifecycle_status"
      )
      .eq("id", eventId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError("Could not load this event.");
          setLoading(false);
          return;
        }
        setForm({
          title: data.title ?? "",
          description: data.description ?? "",
          category_id: data.category_id ?? "",
          related_program: data.related_program ?? "",
          date_time: isoToDateTimeLocalValue(data.date_time),
          end_date_time: isoToDateTimeLocalValue(data.end_date_time),
          location: data.location ?? "",
          related_place_id: data.related_place_id ?? "",
          enrollment_info: data.enrollment_info ?? "",
        });
        setHasEndDateTime(Boolean(data.end_date_time));
        setPublished(data.published);
        setLifecycleStatus(data.lifecycle_status);
        setLoading(false);
      });
  }, [open, isNew, eventId]);

  function updateField<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const endBeforeStart =
    hasEndDateTime &&
    form.date_time.length > 0 &&
    form.end_date_time.length > 0 &&
    new Date(form.end_date_time) <= new Date(form.date_time);

  const canSubmit = form.title.trim().length > 0 && !saving && !endBeforeStart;

  const missingRequiredFields = missingRequiredFieldsFor(form);
  const canPublish = missingRequiredFields.length === 0 && !endBeforeStart;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !profile) return;

    setSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description || null,
      category_id: form.category_id || null,
      related_program: form.related_program || null,
      date_time: form.date_time ? new Date(form.date_time).toISOString() : null,
      end_date_time: hasEndDateTime && form.end_date_time ? new Date(form.end_date_time).toISOString() : null,
      location: form.location || null,
      related_place_id: form.related_place_id || null,
      enrollment_info: form.enrollment_info || null,
      updated_at: new Date().toISOString(),
    };

    if (isNew) {
      const { error: insertError } = await supabase
        .from("events")
        .insert({ ...payload, posted_by: profile.id });

      setSaving(false);
      if (insertError) {
        setError(insertError.message);
        return;
      }
      onSaved();
      onOpenChange(false);
      return;
    }

    const { error: updateError } = await supabase.from("events").update(payload).eq("id", eventId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  async function handleTogglePublished() {
    if (!eventId) return;
    const nextPublished = !published;

    const { error: updateError } = await supabase
      .from("events")
      .update({ published: nextPublished, updated_at: new Date().toISOString() })
      .eq("id", eventId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPublished(nextPublished);
    onSaved();
  }

  async function handleLifecycleChange(nextStatus: (typeof LIFECYCLE_STATUSES)[number]) {
    if (!eventId) return;

    const { error: updateError } = await supabase
      .from("events")
      .update({ lifecycle_status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", eventId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLifecycleStatus(nextStatus);
    onSaved();
  }

  let submitLabel = "Save Changes";
  if (saving) {
    submitLabel = "Saving…";
  } else if (isNew) {
    submitLabel = "Create Event";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than slide-form-dialog.tsx's max-w-lg: this form carries far
          more fields (title, category, description, program, two date/
          time fields, location, place, application info) than a slide's
          image+caption+toggle, and would cramp badly at max-w-lg. max-w-2xl
          matches the two-column field grid the former page used. No card
          wrapper around the fields (unlike the former page, which needed
          one to bound itself against the page background) -- DialogContent
          is already the bounded card surface here, so an inner card just
          nested one card inside another. */}
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>{isNew ? "New Event" : form.title || "Edit Event"}</DialogTitle>
            {!isNew && !loading && (
              <>
                <Badge variant={published ? "default" : "outline"}>
                  {published ? "Published" : "Draft"}
                </Badge>
                <Badge variant={LIFECYCLE_VARIANT[lifecycleStatus]}>{lifecycleStatus}</Badge>
              </>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {!isNew && (
              <div className="flex items-center gap-2">
                <Select value={lifecycleStatus} onValueChange={handleLifecycleChange}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIFECYCLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant={published ? "outline" : "default"}
                  onClick={handleTogglePublished}
                  disabled={!published && !canPublish}
                >
                  {published ? "Unpublish" : "Publish"}
                </Button>
              </div>
            )}

            {!isNew && !published && !canPublish && (
              <p className="text-sm text-destructive">
                Add {missingRequiredFields.join(", ")} before publishing this event.
              </p>
            )}

            {endBeforeStart && (
              <p className="text-sm text-destructive">
                End must be after the start date and time.
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="title">Event Title</Label>
                    <Input
                      id="title"
                      value={form.title}
                      onChange={(e) => updateField("title", e.target.value)}
                      required
                      maxLength={150}
                    />
                    <CharCount value={form.title} max={150} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={form.category_id} onValueChange={(v) => updateField("category_id", v)}>
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

                <div className="flex flex-col gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    maxLength={2000}
                  />
                  <CharCount value={form.description} max={2000} />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="related_program">Related Program</Label>
                  <Input
                    id="related_program"
                    placeholder="e.g. Pasig Creative Arts Academy, if recurring"
                    value={form.related_program}
                    onChange={(e) => updateField("related_program", e.target.value)}
                    maxLength={150}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="has_end_date_time" className="flex w-fit items-center gap-2 text-sm text-foreground">
                    <input
                      id="has_end_date_time"
                      type="checkbox"
                      checked={hasEndDateTime}
                      onChange={(e) => {
                        setHasEndDateTime(e.target.checked);
                        if (!e.target.checked) updateField("end_date_time", "");
                      }}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>This event has an end date and time</span>
                  </label>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="date_time">Date and Time</Label>
                      <DateTimeField
                        id="date_time"
                        value={form.date_time}
                        onChange={(v) => updateField("date_time", v)}
                      />
                    </div>
                    {hasEndDateTime && (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="end_date_time">End Date and Time</Label>
                        <DateTimeField
                          id="end_date_time"
                          value={form.end_date_time}
                          onChange={(v) => updateField("end_date_time", v)}
                          minDate={parseDateTimeLocalValue(form.date_time) ?? undefined}
                          aria-invalid={endBeforeStart}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={form.location}
                      onChange={(e) => updateField("location", e.target.value)}
                      maxLength={300}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="related_place_id">Related Place</Label>
                    <Select value={form.related_place_id} onValueChange={(v) => updateField("related_place_id", v)}>
                      <SelectTrigger id="related_place_id">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {places.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="enrollment_info">Application Info</Label>
                  <Textarea
                    id="enrollment_info"
                    placeholder="Slots available, how to join, if applicable"
                    value={form.enrollment_info}
                    onChange={(e) => updateField("enrollment_info", e.target.value)}
                    maxLength={1000}
                  />
                  <CharCount value={form.enrollment_info} max={1000} />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {submitLabel}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
