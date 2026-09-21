import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/auth-types";

/**
 * usePlaceReview -- the Verify/Reject dialog's own state (open action,
 * notes, submitting, error) and its submit logic, pulled out of
 * admin-place-detail.tsx per a SonarCloud cognitive-complexity finding on
 * that page's top-level component (21 against a 15 limit): this cluster
 * of state and its one handler had no reads or writes outside itself and
 * the dialog JSX, so it moves as a unit with no behavior change.
 *
 * id and profile come from the caller (AdminPlaceDetailPage already reads
 * both via useParams/useAuth). onReviewed fires only after a successful
 * submit, so the page can update its own verification_status and reviews
 * list exactly as it did inline before.
 */

export interface PlaceReviewEntry {
  id: string;
  staff_id: string;
  staff_name: string | null;
  action: "verify" | "reject";
  notes: string | null;
  created_at: string;
}

interface UsePlaceReviewOptions {
  id: string | undefined;
  profile: Profile | null;
  // Fires on every successful review submit, matching the original
  // inline logic exactly: setStatus ran unconditionally once the DB
  // update succeeded, while the review-list entry was only ever added
  // when the insert also returned a row. entry is undefined in that
  // (never observed in practice, but previously handled) edge case.
  onReviewed: (nextStatus: "verified" | "rejected", entry: PlaceReviewEntry | undefined) => void;
}

export function usePlaceReview({ id, profile, onReviewed }: Readonly<UsePlaceReviewOptions>) {
  const [reviewAction, setReviewAction] = useState<"verify" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
    // (phase-5-decisions.md Decision 3) -- this page always writes
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

    // Phase 1 (step-6-phases.md): verified_at (migration 0017) only set on
    // the transition into 'verified', not on every save, so an edit to an
    // already-verified row (handleSubmit's own update, on the page) never
    // moves it. Home's "recently verified" section sorts on this column,
    // not on updated_at, which would also move on an unrelated edit.
    const { error: updateError } = await supabase
      .from("places")
      .update({
        verification_status: nextStatus,
        reviewed_by: profile.id,
        updated_at: new Date().toISOString(),
        ...(nextStatus === "verified" ? { verified_at: new Date().toISOString() } : {}),
      })
      .eq("id", id);

    setReviewSubmitting(false);

    if (updateError) {
      setReviewError(updateError.message);
      return;
    }

    onReviewed(
      nextStatus,
      insertedReview
        ? {
            id: insertedReview.id,
            staff_id: insertedReview.staff_id,
            staff_name: profile.display_name ?? null,
            action: insertedReview.action,
            notes: insertedReview.notes,
            created_at: insertedReview.created_at,
          }
        : undefined,
    );
    setReviewAction(null);
  }

  return {
    reviewAction,
    reviewNotes,
    reviewSubmitting,
    reviewError,
    setReviewNotes,
    setReviewAction,
    openReviewDialog,
    handleReviewSubmit,
  };
}
