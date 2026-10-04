import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { BARANGAYS, MONTH_NAMES } from "@/lib/fiestas";
import { monthOfDate, spanLabel, spanProblem } from "@/lib/fiesta-dates";
import { DateField } from "@/components/ui/date-field";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CharCount } from "@/components/business/business-fields";

// Fiestas admin modal (migrations 0044 and 0045). Same shell as
// event-form-dialog.tsx: a controlled Dialog the list page owns, opened over
// the list, with the open/onOpenChange/onSaved contract. Gated by
// publish_events like Announcements, so no new permission exists.
//
// Barangay tags live in fiesta_barangays: none means city-wide, one a single
// barangay, several multi-barangay. Saving replaces the tag set (delete then
// insert), since the table is a plain join with nothing else on it.
//
// Publish means CATO confirmed the date, shown to residents as verified.
// New rows start as drafts. Required to publish: name, date label.
//
// Dates (migration 0044): a fixed-date fiesta takes a start date and, like an
// announcement, an optional end date, picked with the same DateField. The
// year is only a carrier and is never shown: a fiesta repeats every year. The
// Date text is then written from the two dates ("April 17-18"), so staff
// enter it once and the read-only field shows what residents will see, and
// the month is taken from the start date. A rule-based fiesta ("3rd Sunday of
// November") has no dates: staff pick the month and type the Date text.
// No time of day.

const NO_MONTH = "none";

interface FiestaFormState {
  name: string;
  patron_saint: string;
  community: string;
  month: string; // "1".."12", or NO_MONTH
  start_date: string; // "YYYY-MM-DD", or "" (the year is not shown anywhere)
  end_date: string; // "YYYY-MM-DD", or ""
  date_label: string;
  description: string;
  history: string;
  related_place_id: string;
  source_reference: string;
}

const EMPTY_FORM: FiestaFormState = {
  name: "",
  patron_saint: "",
  community: "",
  month: NO_MONTH,
  start_date: "",
  end_date: "",
  date_label: "",
  description: "",
  history: "",
  related_place_id: "",
  source_reference: "",
};

interface PlaceOption {
  id: string;
  name: string;
}

// The columns the form loads for an existing fiesta, any of which may be null.
interface FiestaRowData {
  name: string | null;
  patron_saint: string | null;
  community: string | null;
  month: number | null;
  start_date: string | null;
  end_date: string | null;
  date_label: string | null;
  description: string | null;
  history: string | null;
  related_place_id: string | null;
  source_reference: string | null;
}

// A loaded row as form state: every null becomes an empty string, and a
// missing month the "none" choice.
function formFromRow(data: FiestaRowData): FiestaFormState {
  return {
    name: data.name ?? "",
    patron_saint: data.patron_saint ?? "",
    community: data.community ?? "",
    month: data.month ? String(data.month) : NO_MONTH,
    start_date: data.start_date ?? "",
    end_date: data.end_date ?? "",
    date_label: data.date_label ?? "",
    description: data.description ?? "",
    history: data.history ?? "",
    related_place_id: data.related_place_id ?? "",
    source_reference: data.source_reference ?? "",
  };
}

const monthOf = (value: string): number | null => (value === NO_MONTH ? null : Number(value));

// The dates, the month they fix (the month picker's value when there is no
// start date), the text they write into date_label (null when the label is
// typed by hand), and what is wrong with them, if anything. hasEndDate is the
// "runs more than one day" checkbox, so an unchecked box ignores a stale end
// date.
function spanFor(form: FiestaFormState, hasEndDate: boolean) {
  const start = form.start_date;
  const end = hasEndDate && start ? form.end_date : "";
  return {
    start,
    end,
    month: start ? monthOfDate(start) : monthOf(form.month),
    derivedLabel: spanLabel(start, end),
    problem: spanProblem(start, end),
  };
}

function missingRequiredFieldsFor(form: FiestaFormState, hasEndDate: boolean): string[] {
  const missing: string[] = [];
  if (form.name.trim().length === 0) missing.push("Name");
  const label = spanFor(form, hasEndDate).derivedLabel ?? form.date_label.trim();
  if (label.length === 0) missing.push("Date");
  return missing;
}

interface FiestaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fiesta id being edited, or null for a new fiesta. */
  fiestaId: string | null;
  onSaved: () => void;
}

export default function FiestaFormDialog({
  open,
  onOpenChange,
  fiestaId,
  onSaved,
}: Readonly<FiestaFormDialogProps>) {
  const isNew = fiestaId === null;

  const [form, setForm] = useState<FiestaFormState>(EMPTY_FORM);
  const [barangays, setBarangays] = useState<Set<string>>(() => new Set());
  const [published, setPublished] = useState(false);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<PlaceOption[]>([]);

  // Reset to the fiesta being edited, or a clean slate for New, every time
  // the dialog opens: this component instance is reused across opens, same
  // as event-form-dialog.tsx.
  useEffect(() => {
    if (!open) return;
    setError(null);

    supabase
      .from("places")
      .select("id, name")
      .eq("verification_status", "verified")
      .order("name", { ascending: true })
      .then(({ data }) => setPlaces((data ?? []) as PlaceOption[]));

    if (isNew) {
      setForm(EMPTY_FORM);
      setBarangays(new Set());
      setPublished(false);
      setHasEndDate(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from("fiestas")
      .select(
        "name, patron_saint, community, month, start_date, end_date, date_label, description, history, related_place_id, source_reference, published, fiesta_barangays(barangay)"
      )
      .eq("id", fiestaId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError("Could not load this fiesta.");
          setLoading(false);
          return;
        }
        setForm(formFromRow(data));
        const tags = (data.fiesta_barangays ?? []) as { barangay: string }[];
        setBarangays(new Set(tags.map((t) => t.barangay)));
        setPublished(data.published);
        setHasEndDate(Boolean(data.end_date));
        setLoading(false);
      });
  }, [open, isNew, fiestaId]);

  function updateField<K extends keyof FiestaFormState>(key: K, value: FiestaFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleBarangay(name: string) {
    setBarangays((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const missingRequiredFields = missingRequiredFieldsFor(form, hasEndDate);
  const canPublish = missingRequiredFields.length === 0;
  const span = spanFor(form, hasEndDate);
  const canSubmit = form.name.trim().length > 0 && span.problem === null && !saving;

  // Back to a rule-based fiesta: DateField has no empty state of its own (a
  // blank typed value is ignored so half-typed dates survive), so this is how
  // staff remove the dates.
  function clearDates() {
    setForm((prev) => ({ ...prev, start_date: "", end_date: "", month: span.month ? String(span.month) : prev.month }));
    setHasEndDate(false);
  }

  // Replace the tag set. Delete-then-insert is two calls, so a failure on the
  // second leaves the fiesta untagged (city-wide) until the next save; the
  // error line tells staff to save again.
  async function saveBarangays(id: string): Promise<string | null> {
    const { error: deleteError } = await supabase.from("fiesta_barangays").delete().eq("fiesta_id", id);
    if (deleteError) return deleteError.message;
    if (barangays.size === 0) return null;
    const { error: insertError } = await supabase
      .from("fiesta_barangays")
      .insert([...barangays].map((barangay) => ({ fiesta_id: id, barangay })));
    return insertError ? insertError.message : null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      patron_saint: form.patron_saint.trim() || null,
      community: form.community.trim() || null,
      month: span.month,
      start_date: span.start || null,
      end_date: span.end || null,
      date_label: span.derivedLabel ?? form.date_label.trim(),
      description: form.description || null,
      history: form.history || null,
      related_place_id: form.related_place_id || null,
      source_reference: form.source_reference.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let id = fiestaId;
    if (isNew) {
      const { data, error: insertError } = await supabase.from("fiestas").insert(payload).select("id").single();
      if (insertError || !data) {
        setSaving(false);
        setError(insertError?.message ?? "Could not create this fiesta.");
        return;
      }
      id = data.id as string;
    } else {
      const { error: updateError } = await supabase.from("fiestas").update(payload).eq("id", fiestaId);
      if (updateError) {
        setSaving(false);
        setError(updateError.message);
        return;
      }
    }

    const tagError = id ? await saveBarangays(id) : null;
    setSaving(false);
    if (tagError) {
      setError(`Saved, but the barangays did not save: ${tagError}. Save again to retry.`);
      onSaved();
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  async function handleTogglePublished() {
    if (!fiestaId) return;
    const nextPublished = !published;

    const { error: updateError } = await supabase
      .from("fiestas")
      .update({ published: nextPublished, updated_at: new Date().toISOString() })
      .eq("id", fiestaId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPublished(nextPublished);
    onSaved();
  }

  let submitLabel = "Save Changes";
  if (saving) {
    submitLabel = "Saving…";
  } else if (isNew) {
    submitLabel = "Create Fiesta";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>{isNew ? "New Fiesta" : form.name || "Edit Fiesta"}</DialogTitle>
            {!isNew && !loading && (
              <Badge variant={published ? "default" : "outline"}>{published ? "Published" : "Draft"}</Badge>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {!isNew && (
              <div className="flex items-center gap-2">
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
                Add {missingRequiredFields.join(", ")} before publishing this fiesta.
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto_1fr]">
                {/* Left: what the fiesta is. Right: where it belongs. */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      required
                      maxLength={150}
                    />
                    <CharCount value={form.name} max={150} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="has_end_date" className="flex w-fit items-center gap-2 text-sm text-foreground">
                      <input
                        id="has_end_date"
                        type="checkbox"
                        checked={hasEndDate}
                        disabled={!form.start_date}
                        onChange={(e) => {
                          setHasEndDate(e.target.checked);
                          if (!e.target.checked) updateField("end_date", "");
                        }}
                        className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <span>This fiesta runs more than one day</span>
                    </label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="start_date">Start Date</Label>
                        <DateField
                          id="start_date"
                          value={form.start_date}
                          onChange={(v) => updateField("start_date", v)}
                        />
                      </div>
                      {hasEndDate && (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="end_date">End Date</Label>
                          <DateField
                            id="end_date"
                            value={form.end_date}
                            onChange={(v) => updateField("end_date", v)}
                            minDate={form.start_date ? new Date(`${form.start_date}T00:00`) : undefined}
                            aria-invalid={span.problem !== null}
                          />
                        </div>
                      )}
                      {!form.start_date && (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="month">Month (for a date rule)</Label>
                          <Select value={form.month} onValueChange={(v) => updateField("month", v)}>
                            <SelectTrigger id="month">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_MONTH}>Not set</SelectItem>
                              {MONTH_NAMES.map((m, i) => (
                                <SelectItem key={m} value={String(i + 1)}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="date_label">Date</Label>
                    {span.derivedLabel ? (
                      <>
                        <Input id="date_label" value={span.derivedLabel} disabled readOnly />
                        <p className="text-xs text-muted-foreground">
                          Written from the dates. The year is never shown, since a fiesta repeats every year.{" "}
                          <button type="button" onClick={clearDates} className="underline hover:text-foreground">
                            Use a date rule instead
                          </button>
                        </p>
                      </>
                    ) : (
                      <Input
                        id="date_label"
                        placeholder="e.g. 3rd Sunday of November. For a fixed date, pick the start date above."
                        value={form.date_label}
                        onChange={(e) => updateField("date_label", e.target.value)}
                        maxLength={100}
                      />
                    )}
                    {span.problem && <p className="text-xs text-destructive">{span.problem}</p>}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="patron_saint">Patron Saint</Label>
                    <Input
                      id="patron_saint"
                      value={form.patron_saint}
                      onChange={(e) => updateField("patron_saint", e.target.value)}
                      maxLength={150}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      className="min-h-[120px]"
                      value={form.description}
                      onChange={(e) => updateField("description", e.target.value)}
                      maxLength={2000}
                    />
                    <CharCount value={form.description} max={2000} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="history">History</Label>
                    <Textarea
                      id="history"
                      className="min-h-[120px]"
                      value={form.history}
                      onChange={(e) => updateField("history", e.target.value)}
                      maxLength={4000}
                    />
                    <CharCount value={form.history} max={4000} />
                  </div>
                </div>

                <div className="hidden w-px bg-border md:block" aria-hidden="true" />

                <div className="flex flex-col gap-4">
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-semibold text-foreground">Barangays</legend>
                    <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-md border border-border p-3">
                      {BARANGAYS.map((name) => (
                        <label key={name} className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={barangays.has(name)}
                            onChange={() => toggleBarangay(name)}
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span>{name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {barangays.size === 0
                        ? "No barangay selected, shown as city-wide."
                        : `${barangays.size} selected.`}
                    </p>
                  </fieldset>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="community">Community or Subdivision</Label>
                    <Input
                      id="community"
                      placeholder="Only if it is not a barangay, e.g. Napico"
                      value={form.community}
                      onChange={(e) => updateField("community", e.target.value)}
                      maxLength={150}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="related_place_id">Related Place</Label>
                    <Select
                      value={form.related_place_id || "none"}
                      onValueChange={(v) => updateField("related_place_id", v === "none" ? "" : v)}
                    >
                      <SelectTrigger id="related_place_id">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {places.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="source_reference">Source</Label>
                    <Input
                      id="source_reference"
                      value={form.source_reference}
                      onChange={(e) => updateField("source_reference", e.target.value)}
                      maxLength={300}
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

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
