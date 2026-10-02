import { supabase } from "@/lib/supabase";

/**
 * Verify or reject many Places-queue rows in one go. Writes exactly what
 * the single-row flows write (use-place-review.ts for places,
 * admin-discovery-content-review.tsx for trail content), just batched:
 *
 *  - one place_reviews audit row per item (reviewed_type 'place' or
 *    'discovery_content'), same as one single review each;
 *  - for places only, the status update (verified_at only on the transition
 *    into 'verified', reviewed_by, updated_at). Trail content reviews are
 *    log-only on purpose, see the note in the discovery review page:
 *    needs_place_review is trigger-computed and the app never sets it.
 *
 * Same order as the single flow: log first, then the status update. A
 * reject needs notes, same rule as the single dialog.
 */
export async function bulkReviewPlaces({
  action,
  notes,
  staffId,
  placeIds,
  discoveryIds,
}: Readonly<{
  action: "verify" | "reject";
  notes: string;
  staffId: string;
  placeIds: string[];
  discoveryIds: string[];
}>): Promise<void> {
  const trimmed = notes.trim();
  if (action === "reject" && trimmed.length === 0) {
    throw new Error("Rejecting requires a note explaining why.");
  }
  if (placeIds.length === 0 && discoveryIds.length === 0) return;

  const logRows = [
    ...placeIds.map((id) => ({ reviewed_type: "place", reviewed_id: id })),
    ...discoveryIds.map((id) => ({ reviewed_type: "discovery_content", reviewed_id: id })),
  ].map((r) => ({ ...r, staff_id: staffId, action, notes: trimmed || null }));

  const { error: logError } = await supabase.from("place_reviews").insert(logRows);
  if (logError) throw new Error(logError.message);

  if (placeIds.length === 0) return;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("places")
    .update({
      verification_status: action === "verify" ? "verified" : "rejected",
      reviewed_by: staffId,
      updated_at: now,
      ...(action === "verify" ? { verified_at: now } : {}),
    })
    .in("id", placeIds);
  if (updateError) throw new Error(updateError.message);
}

export type BulkBusinessAction = "verify" | "reject" | "feature" | "unfeature";

/**
 * Bulk version of admin-business-detail.tsx's Verify / Reject and Feature
 * toggle, writing what those write, batched. Same order as the single flow:
 * audit rows in business_reviews first, then the businesses update.
 *
 *  - verify: verification_status 'verified', reviewed_by, review_notes
 *    cleared, verified_at set (only on the transition into verified).
 *  - reject: verification_status 'unverified' (businesses have no
 *    'rejected' value, migration 0004), and the note is written to both the
 *    audit row and review_notes on the business, as the single dialog does.
 *  - feature / unfeature: featured_status 'featured' / 'listed'. Both log
 *    the one 'feature' action the audit table allows, as the single toggle
 *    does for either direction.
 *
 * The caller passes only the ids the action applies to (pending ones for
 * verify/reject, not-yet-featured for feature, and so on).
 */
export async function bulkReviewBusinesses({
  action,
  notes,
  staffId,
  ids,
}: Readonly<{
  action: BulkBusinessAction;
  notes: string;
  staffId: string;
  ids: string[];
}>): Promise<void> {
  const trimmed = notes.trim();
  if (action === "reject" && trimmed.length === 0) {
    throw new Error("Rejecting requires a note explaining why.");
  }
  if (ids.length === 0) return;

  const logAction = action === "unfeature" ? "feature" : action;
  const { error: logError } = await supabase.from("business_reviews").insert(
    ids.map((id) => ({
      business_id: id,
      staff_id: staffId,
      action: logAction,
      notes: action === "reject" ? trimmed : null,
    }))
  );
  if (logError) throw new Error(logError.message);

  const now = new Date().toISOString();
  let changes: Record<string, unknown>;
  if (action === "verify") {
    changes = {
      verification_status: "verified",
      reviewed_by: staffId,
      review_notes: null,
      verified_at: now,
    };
  } else if (action === "reject") {
    changes = { verification_status: "unverified", reviewed_by: staffId, review_notes: trimmed };
  } else {
    changes = { featured_status: action === "feature" ? "featured" : "listed" };
  }

  const { error: updateError } = await supabase
    .from("businesses")
    .update({ ...changes, updated_at: now })
    .in("id", ids);
  if (updateError) throw new Error(updateError.message);
}

export type BulkEventAction = "publish" | "unpublish" | "upcoming" | "ongoing" | "past";

/**
 * Bulk version of the Announcements list's row actions, writing what those
 * write, batched. Announcements have no audit table, so the single flow is
 * just one column plus updated_at, and so is this:
 *
 *  - publish / unpublish: `published` true / false.
 *  - upcoming / ongoing / past: `lifecycle_status`. Staff set it by hand, it
 *    is not computed from date_time, same as the single Set status control.
 *
 * The caller passes only the ids the action applies to.
 */
export async function bulkUpdateEvents({
  action,
  ids,
}: Readonly<{
  action: BulkEventAction;
  ids: string[];
}>): Promise<void> {
  if (ids.length === 0) return;

  let changes: Record<string, unknown>;
  if (action === "publish" || action === "unpublish") {
    changes = { published: action === "publish" };
  } else {
    changes = { lifecycle_status: action };
  }

  const { error } = await supabase
    .from("events")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
}
