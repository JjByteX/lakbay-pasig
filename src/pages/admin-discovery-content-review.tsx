import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ClipboardText } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePageTitle } from "@/lib/page-title";
import { formatDateTimeNoSeconds } from "@/lib/datetime";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminFormCard, ADMIN_SCROLL_CLASS } from "@/components/admin/admin-form-card";

// Phase 5.3 (step-4-phases.md, step-4-plan.md's review exception): the
// Places queue (admin-places.tsx) reuses "the same table and verify/reject
// actions" for flagged discovery_content rows, rather than building a
// second queue. This page is the "View" destination for a Trail Content
// row from that queue — admin-place-detail.tsx is specifically the Place
// edit page (name, category, historical fields, photos), none of which
// apply to a discovery_content row, so this is a small dedicated view
// instead of stretching that form to cover a second, unrelated shape.
// Editing the entry itself (title, content, sequence, radius) still only
// happens in the trail builder (5.1) — this page is review only, per
// step-4-plan.md's "Publishing... except the review exception... route it
// through the Places review queue," which describes a review gate, not an
// edit surface.

interface DiscoveryContentDetail {
  id: string;
  title: string;
  content: string;
  unlock_radius: number;
  sequence_order: number;
  // Both null for a place entry (no trail), set for a trail note.
  route_id: string | null;
  trail_name: string | null;
  related_location_type: "place" | "business";
  related_location_id: string;
  related_location_name: string;
  related_location_verification_status: string | null;
}

interface ReviewEntry {
  id: string;
  staff_id: string;
  staff_name: string | null;
  action: "verify" | "reject";
  notes: string | null;
  created_at: string;
}

interface ReviewRow {
  id: string;
  staff_id: string;
  action: "verify" | "reject";
  notes: string | null;
  created_at: string;
  profiles: { display_name: string | null }[];
}

// Raw shape of the discovery_content + routes(name) join below, before
// mapping into DiscoveryContentDetail. supabase.ts creates the client with
// no Database generic, so a joined relation like routes(name) isn't typed
// against the schema and TS can't resolve .routes on the inferred result —
// same root cause and same fix as admin-dashboard.tsx's ReviewActivityRow:
// declare the row shape locally, cast at the query boundary. Supabase
// always returns a to-one join as an array here (confirmed in
// admin-dashboard.tsx's own comment), never a bare object, so routes is
// typed as an array only, not the leftover object-or-array union that was
// here before.
interface DiscoveryContentQueryRow {
  id: string;
  title: string;
  content: string;
  unlock_radius: number;
  sequence_order: number;
  route_id: string | null;
  related_location_type: "place" | "business";
  related_location_id: string;
  routes: { name: string }[] | null;
}

// The line under the dialog title (migration 0053). Verify clears a business
// entry's flag until its text, photo or video changes, and a place entry's
// flag follows its place. A rejection changes nothing on the content itself,
// so it says where to fix it, and that the flag holds publishing back.
function reviewDescription(
  action: "verify" | "reject" | null,
  onTrail: boolean,
  locationType: "place" | "business"
): string {
  if (action === "verify") {
    return locationType === "business"
      ? "This logs your approval and clears the flag. It comes back if the text, photo or video changes."
      : "This logs your approval. The flag clears when the related place is verified.";
  }
  const editFrom = onTrail ? "the trail builder" : "its place";
  const waitNote = locationType === "place" ? ", or wait for the related place to be verified" : "";
  const publishNote = onTrail
    ? " The trail can't publish while this stays flagged."
    : " Trails that stop here can't publish while this stays flagged.";
  return `This logs a rejection and keeps it flagged. It doesn't change the content itself. Edit it from ${editFrom}${waitNote}.${publishNote}`;
}

export default function AdminDiscoveryContentReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [entry, setEntry] = useState<DiscoveryContentDetail | null>(null);
  usePageTitle(entry?.title ?? "Places");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reviews, setReviews] = useState<ReviewEntry[] | null>(null);

  const [reviewAction, setReviewAction] = useState<"verify" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    setLoading(true);
    setNotFound(false);

    supabase
      .from("discovery_content")
      .select("id, title, content, unlock_radius, sequence_order, route_id, related_location_type, related_location_id, routes(name)")
      .eq("id", id)
      .single()
      .then(async ({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const row = data as unknown as DiscoveryContentQueryRow;

        // related_location_id has no foreign key (0005's type-plus-id
        // pattern), resolved with a second query the same way
        // admin-places.tsx's queue list does for the same pair of columns.
        const table = row.related_location_type === "place" ? "places" : "businesses";
        const { data: location } = await supabase
          .from(table)
          .select("name, verification_status")
          .eq("id", row.related_location_id)
          .maybeSingle();

        if (cancelled) return;

        const routeName = row.routes?.[0]?.name;

        setEntry({
          id: row.id,
          title: row.title,
          content: row.content,
          unlock_radius: row.unlock_radius,
          sequence_order: row.sequence_order,
          route_id: row.route_id,
          trail_name: row.route_id ? (routeName ?? "Untitled trail") : null,
          related_location_type: row.related_location_type,
          related_location_id: row.related_location_id,
          related_location_name: location?.name ?? "Unknown",
          related_location_verification_status: location?.verification_status ?? null,
        });
        setLoading(false);
      });

    // Review history for this specific discovery_content row, same
    // place_reviews table widened by migration 0014 (phase-5-decisions.md
    // Decision 3), filtered to reviewed_type = 'discovery_content' so a
    // places.id that happens to collide with this id can't leak in.
    supabase
      .from("place_reviews")
      .select("id, staff_id, action, notes, created_at, profiles(display_name)")
      .eq("reviewed_type", "discovery_content")
      .eq("reviewed_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setReviews(
          ((data ?? []) as ReviewRow[]).map((r) => ({
            id: r.id,
            staff_id: r.staff_id,
            staff_name: r.profiles[0]?.display_name ?? null,
            action: r.action,
            notes: r.notes,
            created_at: r.created_at,
          }))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Same one-click pattern as admin-place-detail.tsx: the queue's row menu
  // links here with ?review=verify or ?review=reject.
  useEffect(() => {
    const requested = searchParams.get("review");
    if (requested === "verify" || requested === "reject") {
      openReviewDialog(requested);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("review");
          return next;
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

    // Logs to place_reviews with reviewed_type = 'discovery_content', per
    // migration 0014 / phase-5-decisions.md Decision 3, same table
    // Place reviews use, not a parallel log.
    const { data: insertedReview, error: reviewInsertError } = await supabase
      .from("place_reviews")
      .insert({
        reviewed_type: "discovery_content",
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

    // This page never writes needs_place_review, unlike the Place/Business
    // review pages. It is trigger-computed (migration 0012) and the app layer
    // must never set it directly, per Decision 1. Since migration 0053 the
    // review row inserted above does the clearing: Verify clears a business
    // entry's flag and Reject sets it again, and a place entry follows its
    // place's verification_status.
    //
    // Reject does NOT touch discovery_content.status. An earlier version
    // of this page set status = 'inactive' on reject, which silently
    // pulled a stop's content out of a live sequence — competitive-
    // positioning.md and build-priorities.md both define a heritage walk
    // as a narrative arc where "each stop references the last one and
    // sets up the next," not standalone trivia; auto-removing one stop's
    // beat breaks that arc with no review UI ever surfacing the sequence
    // impact. admin-panel-spec.md's Trail Publishing exception exists to
    // gate PUBLISH, not to police content already live ("route it through
    // the Places review queue before the Trail goes live") — the actual
    // fix belongs at the publish gate (5.4, see admin-trails.tsx's
    // handleTogglePublish), not as a side effect here. step-4-plan.md's
    // own wording is "reuse the same table and verify/reject actions,"
    // meaning the logged action admin-panel-spec.md's Review Action Log
    // rule asks for, not an unrequested mutation on discovery_content
    // itself. The actual correction (editing the content, or waiting for
    // the related place to get verified) happens in the trail builder
    // (5.1), where discovery_content is already editable.
    setReviewSubmitting(false);

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

  if (notFound || !entry) {
    return <p className="text-sm text-destructive">Could not load this discovery content entry.</p>;
  }

  // Extracted from a nested ternary (reviewSubmitting ? ... : reviewAction
  // === "verify" ? ... : ...) inline in the Verify/Reject dialog button below.
  let reviewSubmitLabel = "Reject";
  if (reviewSubmitting) {
    reviewSubmitLabel = "Submitting…";
  } else if (reviewAction === "verify") {
    reviewSubmitLabel = "Verify";
  }

  return (
    <div className="flex min-h-0 grow flex-col gap-6">
      {/* Reached from the Places review queue (this route lives under
          /admin/places/discovery), so Places is the parent crumb. */}
      <AdminPageHeader
        breadcrumb={[{ label: "Places", to: "/admin/places" }]}
        title={entry.title}
        badges={
          <>
            <Badge variant="secondary">Discovery content</Badge>
            <Badge variant="outline">pending</Badge>
          </>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openReviewDialog("reject")}>
              Reject
            </Button>
            <Button onClick={() => openReviewDialog("verify")}>Verify</Button>
          </div>
        }
      />

      <AdminFormCard>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* A place entry has no trail, so there is nothing to link to. */}
          {entry.route_id && (
            <div className="flex flex-col gap-1">
              <Label>Trail</Label>
              <button
                type="button"
                className="text-left text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                onClick={() => navigate(`/admin/trails/${entry.route_id}`)}
              >
                {entry.trail_name}
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label>Related {entry.related_location_type === "place" ? "Place" : "Business"}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{entry.related_location_name}</span>
              {entry.related_location_verification_status && (
                <Badge variant="outline">{entry.related_location_verification_status}</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Sequence Order</Label>
            <span className="text-sm text-foreground">{entry.sequence_order}</span>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Unlock Radius</Label>
            <span className="text-sm text-foreground">{entry.unlock_radius}m</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label>Content</Label>
          <p className="whitespace-pre-wrap text-sm text-foreground">{entry.content}</p>
        </div>

        <p className="text-xs text-muted-foreground">
          {entry.related_location_type === "business"
            ? "Tied to a business, so it needs a Places review. Verify clears it until the text, photo or video changes."
            : "Flagged because the related place is not yet verified."}
        </p>
      </AdminFormCard>

      <div className="flex min-h-0 flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Review History</h2>
        <ReviewHistoryList reviews={reviews} />
      </div>

      <Dialog open={reviewAction !== null} onOpenChange={(open) => !open && setReviewAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "verify" ? "Verify this discovery content?" : "Reject this discovery content?"}
            </DialogTitle>
            <DialogDescription>
              {reviewDescription(reviewAction, Boolean(entry.route_id), entry.related_location_type)}
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
              loading={reviewSubmitting}
            >
              {reviewSubmitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewHistoryList({ reviews }: Readonly<{ reviews: ReviewEntry[] | null }>) {
  if (reviews === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (reviews.length === 0) {
    return <EmptyState icon={ClipboardText}>Review history will appear here.</EmptyState>;
  }

  return (
    <ul className={`flex flex-col divide-y divide-border rounded-lg border border-border bg-card ${ADMIN_SCROLL_CLASS}`}>
      {reviews.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{r.staff_name ?? "Staff"}</span>
            <Badge variant={r.action === "verify" ? "default" : "destructive"}>
              {r.action === "verify" ? "Verified" : "Rejected"}
            </Badge>
          </div>
          {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
          <p className="text-xs text-muted-foreground">{formatDateTimeNoSeconds(r.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}
