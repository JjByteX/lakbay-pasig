import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { fetchActiveCategories, type EventCategory } from "@/lib/event-categories";
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
import { usePageTitle } from "@/lib/page-title";
import { isoToDateTimeLocalValue, parseDateTimeLocalValue } from "@/lib/datetime";

// Phase 2.2-2.4: create/edit form, publish and lifecycle_status actions,
// and form/save states, per step-4-phases.md. No photos, no review dialog,
// events have no review queue per admin-panel-spec.md, so this stays a
// single form, not the tabbed shape admin-place-detail.tsx uses.
//
// Category Directory Phase 7.1: migration 0024 dropped events.category.
// The hardcoded CATEGORIES const and its Select are replaced with
// fetchActiveCategories() (event-categories.ts, Phase 1.8), same
// fetch/effect/Select shape admin-place-detail.tsx's Phase 5.1 and
// admin-trail-builder.tsx's Phase 6.1 already established for their own
// category_id fields, reused rather than reinvented per constraints.md's
// Inventory Before Suggesting rule. Form state and the save payload move
// from category: string to category_id: string. This closes 1.10's
// flagged gap ("this is Phase 7's real work, done here instead of twice").

const LANGUAGES = ["English", "Filipino", "Both"] as const;
const LIFECYCLE_STATUSES = ["upcoming", "ongoing", "past"] as const;

const LIFECYCLE_VARIANT = {
  upcoming: "secondary",
  ongoing: "accent",
  past: "outline",
} as const;

// admin-form-fields-plan.md #2: every maxLength needs a visible counter
// nearby so the cap isn't a silent wall. Page-local copy, same as
// admin-place-detail.tsx and admin-business-detail.tsx's own CharCount.
function CharCount({ value, max }: Readonly<{ value: string; max: number }>) {
  return (
    <span className="self-end text-xs text-muted-foreground">
      {value.length}/{max}
    </span>
  );
}

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
  language: string;
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
  language: "",
};

interface PlaceOption {
  id: string;
  name: string;
}

export default function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  usePageTitle(isNew ? "New Event" : form.title || "Edit Event");
  const [hasEndDateTime, setHasEndDateTime] = useState(false);
  const [published, setPublished] = useState(false);
  const [lifecycleStatus, setLifecycleStatus] = useState<(typeof LIFECYCLE_STATUSES)[number]>("upcoming");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [places, setPlaces] = useState<PlaceOption[]>([]);

  useEffect(() => {
    // 2.2: related_place_id picker limited to verified places only, per
    // step-4-phases.md, matching the public-facing verification bar.
    supabase
      .from("places")
      .select("id, name")
      .eq("verification_status", "verified")
      .order("name", { ascending: true })
      .then(({ data }) => setPlaces((data ?? []) as PlaceOption[]));
  }, []);

  // Category Directory Phase 7.1: category picker source, active rows
  // only, same fetchActiveCategories/effect shape admin-place-detail.tsx's
  // Phase 5.1 and admin-trail-builder.tsx's Phase 6.1 already established.
  // Loaded once on mount, independent of isNew/id, since a new event's
  // form needs the picker just as much as an existing one's does.
  const [categories, setCategories] = useState<EventCategory[]>([]);
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

  useEffect(() => {
    if (isNew) return;

    setLoading(true);
    supabase
      .from("events")
      // Category Directory Phase 7.1: category (migration 0024) is gone,
      // category_id selected directly off events -- this form never
      // displays the category's name here, only writes/reads the id, same
      // flat-select reasoning admin-place-detail.tsx's and admin-trail-
      // builder.tsx's own category_id selects already established.
      .select(
        "title, description, category_id, related_program, date_time, end_date_time, location, related_place_id, enrollment_info, language, published, lifecycle_status"
      )
      .eq("id", id)
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
          language: data.language ?? "",
        });
        setHasEndDateTime(Boolean(data.end_date_time));
        setPublished(data.published);
        setLifecycleStatus(data.lifecycle_status);
        setLoading(false);
      });
  }, [id, isNew]);

  function updateField<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Toggle-driven optional field (0020: events.end_date_time). Only
  // validated when the toggle is on and both dates are present, same
  // "don't block on an optional field" posture data-model.md already uses
  // for related_program/location/enrollment_info/language on this form.
  const endBeforeStart =
    hasEndDateTime &&
    form.date_time.length > 0 &&
    form.end_date_time.length > 0 &&
    new Date(form.end_date_time) <= new Date(form.date_time);

  const canSubmit = form.title.trim().length > 0 && !saving && !endBeforeStart;

  // 2.4: "Disabled publish button if required fields are missing," per
  // ux-ui-guidelines.md's Disabled/gated rule ("must be visibly disabled
  // with a clear reason when conditions aren't met... do not clearly
  // communicate what the user must do to enable it" is the failure mode
  // being avoided). title is already the DB's own not-null field (0006);
  // description, category, and date_time are the remaining fields that
  // make an announcement meaningful once public, per data-model.md and
  // the Home tab's "what CATO just published" (navigation-and-access-
  // control.md). related_program, location, related_place_id, enrollment_info,
  // and language stay optional here, same as data-model.md marks them
  // ("if applicable" / "if held at a listed heritage site or venue").
  const missingRequiredFields: string[] = [];
  if (form.title.trim().length === 0) missingRequiredFields.push("Event Title");
  if (form.description.trim().length === 0) missingRequiredFields.push("Description");
  if (form.category_id.trim().length === 0) missingRequiredFields.push("Category");
  if (form.date_time.trim().length === 0) missingRequiredFields.push("Date and Time");
  const canPublish = missingRequiredFields.length === 0 && !endBeforeStart;
  // Note: this reads live form state, not the last-saved row. An edit made
  // after load but not yet saved can flip canPublish before Save Changes is
  // clicked; handleTogglePublished only ever writes the published column,
  // so Publish always reflects what's currently in the DB regardless. Out
  // of scope for 2.4 (field-completeness gating) — flagging per
  // constraints.md's No Silent Overrides rather than building unsaved-
  // changes tracking, which doesn't exist anywhere else in this codebase.

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !profile) return;

    setSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description || null,
      // Category Directory Phase 7.1: writes category_id (migration 0024),
      // same nullable-if-blank shape the old category field had.
      category_id: form.category_id || null,
      related_program: form.related_program || null,
      date_time: form.date_time ? new Date(form.date_time).toISOString() : null,
      end_date_time: hasEndDateTime && form.end_date_time ? new Date(form.end_date_time).toISOString() : null,
      location: form.location || null,
      related_place_id: form.related_place_id || null,
      enrollment_info: form.enrollment_info || null,
      language: form.language || null,
      updated_at: new Date().toISOString(),
    };

    if (isNew) {
      const { data, error: insertError } = await supabase
        .from("events")
        .insert({ ...payload, posted_by: profile.id })
        .select("id")
        .single();

      setSaving(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "Could not create this event.");
        return;
      }
      navigate(`/admin/events/${data.id}`, { replace: true });
      return;
    }

    const { error: updateError } = await supabase.from("events").update(payload).eq("id", id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate("/admin/events");
  }

  async function handleTogglePublished() {
    if (!id) return;
    const nextPublished = !published;

    const { error: updateError } = await supabase
      .from("events")
      .update({ published: nextPublished, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPublished(nextPublished);
  }

  async function handleLifecycleChange(nextStatus: (typeof LIFECYCLE_STATUSES)[number]) {
    if (!id) return;

    const { error: updateError } = await supabase
      .from("events")
      .update({ lifecycle_status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLifecycleStatus(nextStatus);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Extracted from a nested ternary (saving ? ... : isNew ? ... : ...)
  // inline in the submit button below.
  let submitLabel = "Save Changes";
  if (saving) {
    submitLabel = "Saving…";
  } else if (isNew) {
    submitLabel = "Create Event";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {isNew ? "New Event" : form.title || "Edit Event"}
          </h1>
          {!isNew && (
            <>
              <Badge variant={published ? "default" : "outline"}>
                {published ? "Published" : "Draft"}
              </Badge>
              <Badge variant={LIFECYCLE_VARIANT[lifecycleStatus]}>{lifecycleStatus}</Badge>
            </>
          )}
        </div>
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
              variant={published ? "outline" : "default"}
              onClick={handleTogglePublished}
              disabled={!published && !canPublish}
            >
              {published ? "Unpublish" : "Publish"}
            </Button>
          </div>
        )}
      </div>

      {/* 2.4: visible reason, per ux-ui-guidelines.md's Disabled/gated rule
          ("do not disable a primary action without clearly communicating
          what the user must do to enable it"). Only shown while blocked and
          only for the draft -> published direction, matching the button's
          own gate above; unpublishing a live event is never blocked. */}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label htmlFor="date_time">Date and Time</Label>
            <DateTimeField
              id="date_time"
              value={form.date_time}
              onChange={(v) => updateField("date_time", v)}
            />
          </div>
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
          {hasEndDateTime && (
            <div className="flex flex-col gap-2 sm:w-1/2 sm:pr-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="enrollment_info">Enrollment Info</Label>
            <Textarea
              id="enrollment_info"
              placeholder="Slots available, how to join, if applicable"
              value={form.enrollment_info}
              onChange={(e) => updateField("enrollment_info", e.target.value)}
              maxLength={1000}
            />
            <CharCount value={form.enrollment_info} max={1000} />
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/events")}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
