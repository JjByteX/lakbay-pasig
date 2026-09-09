import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

// Phase 2.2-2.4: create/edit form, publish and lifecycle_status actions,
// and form/save states, per step-4-phases.md. No photos, no review dialog,
// events have no review queue per admin-panel-spec.md, so this stays a
// single form, not the tabbed shape admin-place-detail.tsx uses.

const CATEGORIES = ["workshop", "festival", "heritage walk", "program enrollment", "general announcement"] as const;
const LANGUAGES = ["English", "Filipino", "Both"] as const;
const LIFECYCLE_STATUSES = ["upcoming", "ongoing", "past"] as const;

const LIFECYCLE_VARIANT = {
  upcoming: "secondary",
  ongoing: "accent",
  past: "outline",
} as const;

interface EventFormState {
  title: string;
  description: string;
  category: string;
  related_program: string;
  date_time: string;
  location: string;
  related_place_id: string;
  enrollment_info: string;
  language: string;
}

const EMPTY_FORM: EventFormState = {
  title: "",
  description: "",
  category: "",
  related_program: "",
  date_time: "",
  location: "",
  related_place_id: "",
  enrollment_info: "",
  language: "",
};

interface PlaceOption {
  id: string;
  name: string;
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" with no timezone suffix.
// events.date_time is timestamptz, stored and returned as a full ISO
// string, so reading a record back needs trimming to what the input
// accepts. Native input, no date picker dependency, per ponytail's ladder.
function toDatetimeLocalValue(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
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

  useEffect(() => {
    if (isNew) return;

    setLoading(true);
    supabase
      .from("events")
      .select(
        "title, description, category, related_program, date_time, location, related_place_id, enrollment_info, language, published, lifecycle_status"
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
          category: data.category ?? "",
          related_program: data.related_program ?? "",
          date_time: toDatetimeLocalValue(data.date_time),
          location: data.location ?? "",
          related_place_id: data.related_place_id ?? "",
          enrollment_info: data.enrollment_info ?? "",
          language: data.language ?? "",
        });
        setPublished(data.published);
        setLifecycleStatus(data.lifecycle_status);
        setLoading(false);
      });
  }, [id, isNew]);

  function updateField<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.title.trim().length > 0 && !saving;

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
  if (form.category.trim().length === 0) missingRequiredFields.push("Category");
  if (form.date_time.trim().length === 0) missingRequiredFields.push("Date and Time");
  const canPublish = missingRequiredFields.length === 0;
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
      category: form.category || null,
      related_program: form.related_program || null,
      date_time: form.date_time ? new Date(form.date_time).toISOString() : null,
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Event Title</Label>
            <Input id="title" value={form.title} onChange={(e) => updateField("title", e.target.value)} required />
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
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="related_program">Related Program</Label>
            <Input
              id="related_program"
              placeholder="e.g. Pasig Creative Arts Academy, if recurring"
              value={form.related_program}
              onChange={(e) => updateField("related_program", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="date_time">Date and Time</Label>
            <Input
              id="date_time"
              type="datetime-local"
              value={form.date_time}
              onChange={(e) => updateField("date_time", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={form.location} onChange={(e) => updateField("location", e.target.value)} />
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/events")}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Saving…" : isNew ? "Create Event" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
