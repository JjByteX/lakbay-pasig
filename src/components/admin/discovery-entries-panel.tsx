import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BookOpen, Pencil, QrCode, Trash } from "@phosphor-icons/react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { DEFAULT_UNLOCK_RADIUS } from "@/lib/trail-unlock";
import { discardUnsavedPhoto, removeDiscoveryPhotoFile } from "@/lib/discovery-photo";
import type { Profile } from "@/lib/auth-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharCount } from "@/components/business/business-fields";
import { AdminFormCard } from "./admin-form-card";
import { DiscoveryPhotoField } from "./discovery-photo-field";

/**
 * Who may write place entries: the same set migration 0013 grants
 * discovery_content writes to (manage_places, build_trails, admin). A
 * review_businesses staffer can open a business page but not edit this, so
 * the tab is hidden for them rather than shown and refused.
 */
export function canEditDiscoveryContent(profile: Profile | null): boolean {
  if (!profile?.staff_role) return false;
  if (profile.staff_role === "admin") return true;
  const permissions = profile.system_permission ?? [];
  return permissions.includes("manage_places") || permissions.includes("build_trails");
}

/**
 * The Discovery content tab on a place or business page. A place entry is a
 * discovery_content row with no trail (migration 0050): written once here,
 * shown on every published trail that has this place as a stop. The trail
 * builder edits trail notes, the other kind. docs/discovery-content-plan.md.
 *
 * Staff only type the entry's text. Order is automatic (new entries go last,
 * up and down buttons reorder), the radius is prefilled, and the QR token is
 * made by the app when "Unlock by QR scan" is ticked. needs_place_review is
 * set by the database trigger (0012) and never written from here.
 */
interface EntryRow {
  id: string;
  title: string;
  content: string;
  sequence_order: number;
  unlock_radius: number;
  qr_token: string | null;
  needs_place_review: boolean;
  photo_url: string | null;
}

interface EntryForm {
  title: string;
  content: string;
  unlock_radius: string;
  requires_scan: boolean;
  // "" means no photo. The file is already uploaded once this holds a url.
  photo_url: string;
}

const EMPTY_FORM: EntryForm = {
  title: "",
  content: "",
  unlock_radius: String(DEFAULT_UNLOCK_RADIUS),
  requires_scan: false,
  photo_url: "",
};

const SELECT_COLUMNS =
  "id, title, content, sequence_order, unlock_radius, qr_token, needs_place_review, photo_url";

// The link the QR code holds. A phone's own camera opens it (trail-scan.tsx).
// The host is VITE_SITE_URL when set, so a code downloaded from localhost or
// a preview link still points at the live site. Without it, the address
// staff are on is used, which is only right on the live site.
function scanUrl(token: string): string {
  const host = import.meta.env.VITE_SITE_URL?.replace(/\/+$/, "") || window.location.origin;
  return `${host}/scan/${token}`;
}

// File name for the downloaded code: the entry title, lowercased and
// reduced to letters, numbers and dashes.
function qrFileName(title: string): string {
  const slug = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
  return `${slug || "discovery-entry"}-qr.png`;
}

async function downloadQr(entry: EntryRow): Promise<void> {
  if (!entry.qr_token) return;
  const dataUrl = await QRCode.toDataURL(scanUrl(entry.qr_token), { width: 768, margin: 2 });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = qrFileName(entry.title);
  link.click();
}

export function DiscoveryEntriesPanel({
  locationType,
  locationId,
}: Readonly<{ locationType: "place" | "business"; locationId: string }>) {
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // null = list view, "new" = adding, otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoadError(null);
    const { data, error: fetchError } = await supabase
      .from("discovery_content")
      .select(SELECT_COLUMNS)
      .is("route_id", null)
      .eq("related_location_type", locationType)
      .eq("related_location_id", locationId)
      .order("sequence_order", { ascending: true });

    if (fetchError || !data) {
      setLoadError("Couldn't load discovery content. Check your connection and try again.");
      return;
    }
    setEntries(data as EntryRow[]);
  }, [locationType, locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit =
    form.title.trim().length > 0 && form.content.trim().length > 0 && form.unlock_radius.trim().length > 0 && !saving;

  function startNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditingId("new");
  }

  function startEdit(entry: EntryRow) {
    setForm({
      title: entry.title,
      content: entry.content,
      unlock_radius: String(entry.unlock_radius),
      requires_scan: entry.qr_token !== null,
      photo_url: entry.photo_url ?? "",
    });
    setError(null);
    setEditingId(entry.id);
  }

  // Leaving the form without saving: a photo uploaded in this edit is not
  // wanted, so its file goes. The entry's saved photo is untouched.
  function handleCancel() {
    discardUnsavedPhoto(form.photo_url, entries?.find((e) => e.id === editingId)?.photo_url ?? null);
    setEditingId(null);
  }

  async function handleSave() {
    if (!canSubmit || !entries) return;
    const unlockRadius = Number(form.unlock_radius);
    if (!Number.isFinite(unlockRadius)) {
      setError("Unlock radius must be a number.");
      return;
    }

    setSaving(true);
    setError(null);
    const fields = {
      title: form.title.trim(),
      content: form.content.trim(),
      unlock_radius: unlockRadius,
      photo_url: form.photo_url || null,
    };

    if (editingId === "new") {
      const nextOrder = entries.length ? Math.max(...entries.map((e) => e.sequence_order)) + 1 : 1;
      const { data, error: insertError } = await supabase
        .from("discovery_content")
        .insert({
          ...fields,
          route_id: null,
          related_location_type: locationType,
          related_location_id: locationId,
          related_route_stop_id: null,
          sequence_order: nextOrder,
          qr_token: form.requires_scan ? crypto.randomUUID() : null,
        })
        .select(SELECT_COLUMNS)
        .single();

      setSaving(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "Could not save discovery content.");
        return;
      }
      setEntries([...entries, data as EntryRow]);
      setEditingId(null);
      return;
    }

    // Editing. Ticking the box on an entry that has no code makes a token,
    // unticking removes it, and an entry that keeps its tick keeps its
    // token, so a printed code stays valid across edits.
    const current = entries.find((e) => e.id === editingId);
    let qrToken: string | null = null;
    if (form.requires_scan) qrToken = current?.qr_token ?? crypto.randomUUID();

    const { error: updateError } = await supabase
      .from("discovery_content")
      .update({ ...fields, qr_token: qrToken })
      .eq("id", editingId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // The photo was replaced or removed, so the old file is now unused.
    if (current?.photo_url && current.photo_url !== fields.photo_url) {
      void removeDiscoveryPhotoFile(current.photo_url);
    }
    setEntries(entries.map((e) => (e.id === editingId ? { ...e, ...fields, qr_token: qrToken } : e)));
    setEditingId(null);
  }

  async function handleDelete(entryId: string) {
    if (!entries) return;
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase.from("discovery_content").delete().eq("id", entryId);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    const removed = entries.find((e) => e.id === entryId);
    if (removed?.photo_url) void removeDiscoveryPhotoFile(removed.photo_url);
    setEntries(entries.filter((e) => e.id !== entryId));
  }

  // Renumbers 1..n in the current order first, then swaps, so rows that
  // share a number still move. Writes only the rows whose number changed.
  // sequence_order writes are on log_activity's ignore list.
  async function handleMove(entry: EntryRow, direction: "up" | "down") {
    if (!entries) return;
    const from = entries.findIndex((e) => e.id === entry.id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= entries.length) return;

    const reordered = [...entries];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    const nextOrderById = new Map(reordered.map((e, index) => [e.id, index + 1]));
    const changed = reordered.filter((e) => nextOrderById.get(e.id) !== e.sequence_order);

    setSaving(true);
    setError(null);
    const results = await Promise.all(
      changed.map((e) =>
        supabase.from("discovery_content").update({ sequence_order: nextOrderById.get(e.id) }).eq("id", e.id)
      )
    );
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setError(failed.error.message);
      // Some rows may have saved and some not, so show what is stored.
      void load();
      return;
    }
    setEntries(reordered.map((e) => ({ ...e, sequence_order: nextOrderById.get(e.id) as number })));
  }

  async function handleDownload(entry: EntryRow) {
    setError(null);
    try {
      await downloadQr(entry);
    } catch {
      setError("Couldn't make the QR code. Try again.");
    }
  }

  // Same frame as the Current Info tab (admin-form-card.tsx): the tab fills
  // the height under the heading, the card grows and scrolls its own
  // content, and the action buttons sit pinned beneath it, so the page
  // itself never scrolls. The parent TabsContent only has to be a flex
  // column that can shrink.
  let body: ReactNode;
  let footer: ReactNode = null;

  if (loadError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  } else if (!entries) {
    body = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (editingId !== null) {
    // The entry being edited, if it already has a code. Unticking the QR box
    // removes the code, and ticking it later makes a new one, which breaks
    // printed codes, so the form says so before staff save.
    const editingEntry = entries.find((e) => e.id === editingId);

    body = (
      <div className="flex max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="entry_title">Title</Label>
          <Input
            id="entry_title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            required
            maxLength={150}
          />
          <CharCount value={form.title} max={150} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="entry_content">Content</Label>
          <Textarea
            id="entry_content"
            className="min-h-30"
            value={form.content}
            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            required
            maxLength={2000}
          />
          <CharCount value={form.content} max={2000} />
        </div>
        <DiscoveryPhotoField
          url={form.photo_url}
          savedUrl={editingEntry?.photo_url ?? null}
          onChange={(photoUrl) => setForm((prev) => ({ ...prev, photo_url: photoUrl }))}
          onError={setError}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="entry_unlock_radius">Unlock Radius (meters)</Label>
          <Input
            id="entry_unlock_radius"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={form.unlock_radius}
            onChange={(e) => setForm((prev) => ({ ...prev, unlock_radius: e.target.value }))}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="entry_requires_scan" className="flex w-fit items-center gap-2 text-sm text-foreground">
            <Checkbox
              id="entry_requires_scan"
              checked={form.requires_scan}
              onChange={(e) => setForm((prev) => ({ ...prev, requires_scan: e.target.checked }))}
            />
            <span>Unlock by QR scan</span>
          </label>
          {editingEntry?.qr_token && !form.requires_scan && (
            <p className="text-xs text-destructive">
              Saving removes this entry&apos;s code. Ticking the box again later makes a new code, and printed
              codes stop working.
            </p>
          )}
        </div>
      </div>
    );
    footer = (
      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={!canSubmit}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    );
  } else {
    // Rows sit directly in the card, divided by lines. No border of their
    // own, since a bordered list inside a card is a card inside a card.
    body =
      entries.length === 0 ? (
        <EmptyState icon={BookOpen}>Discovery content will appear here.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">{entry.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">Unlocks within {entry.unlock_radius}m</p>
                  {entry.qr_token && <Badge variant="secondary">QR scan</Badge>}
                  {entry.needs_place_review && <Badge variant="outline">Needs review</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={index === 0 || saving}
                  onClick={() => void handleMove(entry, "up")}
                >
                  <ArrowUp className="h-4 w-4" />
                  <span className="sr-only">Move up</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={index === entries.length - 1 || saving}
                  onClick={() => void handleMove(entry, "down")}
                >
                  <ArrowDown className="h-4 w-4" />
                  <span className="sr-only">Move down</span>
                </Button>
                {entry.qr_token && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void handleDownload(entry)}>
                    <QrCode className="h-4 w-4" />
                    <span className="sr-only">Download QR</span>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(entry)}>
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Edit</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  disabled={saving}
                  onClick={() => void handleDelete(entry.id)}
                >
                  <Trash className="h-4 w-4" />
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      );
    footer = (
      <div className="flex justify-end">
        <Button type="button" onClick={startNew}>
          Add Discovery Content
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 grow flex-col gap-6">
      <AdminFormCard>{body}</AdminFormCard>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {footer}
    </div>
  );
}
