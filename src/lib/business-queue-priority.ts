// Phase 6.1: Business review queue priority.
//
// Per vendor-mode-spec.md: "Review queue priority, not flat order. New
// accounts, listings with no photos, generic or copy pasted descriptions,
// or accounts tied to multiple recent submissions get surfaced higher in
// the queue automatically."
//
// Mirrors the pattern already used for the Places queue in
// admin-places.tsx (a STATUS_PRIORITY map plus a client side sort): this is
// a pure function, no Supabase calls of its own. The Businesses list page
// (6.2) fetches rows and passes them through this.
//
// Two of the four signals, hasPhotos and accountCreatedAt, are optional
// inputs rather than fields this function fetches itself, since it stays a
// pure function with no Supabase calls of its own (see above). Both are
// backed by schema as of migration 0008_business_queue_priority_support.sql:
//
//   - "no photos": business_photos (0008) mirrors place_photos from
//     0003_places.sql, a business_photos.select() by business_id, or an
//     absence check, is what the caller passes in as hasPhotos.
//   - "new accounts": profiles.created_at (0001_profiles_and_roles.sql) is
//     now readable for a business's submitter by staff with
//     review_businesses or admin, via the
//     profiles_select_staff_business_submitters policy (0008). The caller
//     should select only created_at from that row, not the full profile,
//     see 0008's comment for why, and pass it in as accountCreatedAt.
//
// Omit either when the caller hasn't fetched it, the signal reports null
// (unknown) rather than being guessed as false.

export type BusinessVerificationStatus = "pending" | "verified" | "unverified";

export interface BusinessQueueCandidate {
  id: string;
  submittedBy: string;
  description: string | null;
  verificationStatus: BusinessVerificationStatus;
  updatedAt: string;
  /** profiles.created_at for submittedBy. Omit when the caller cannot read it (see file header). */
  accountCreatedAt?: string | null;
  /** Whether the listing has at least one photo. Omit until a photo store exists (see file header). */
  hasPhotos?: boolean;
}

export interface BusinessQueueSignals {
  /** null means the signal could not be evaluated, not that it's false. */
  newAccount: boolean | null;
  noPhotos: boolean | null;
  thinDescription: boolean;
  copyPastedDescription: boolean;
  multipleSubmissions: boolean;
}

export interface PrioritizedBusiness extends BusinessQueueCandidate {
  signals: BusinessQueueSignals;
  /** Count of true signals. Higher surfaces first within the same status tier. */
  riskScore: number;
}

// Same two-tier shape as STATUS_PRIORITY in admin-places.tsx: pending needs
// review, verified/unverified don't compete for queue attention.
const STATUS_PRIORITY: Record<BusinessVerificationStatus, 0 | 1> = {
  pending: 0,
  verified: 1,
  unverified: 1,
};

// Defaults below are first-pass thresholds, not values named in
// vendor-mode-spec.md or admin-panel-spec.md. Both docs name the signal
// ("new accounts", "thin ... descriptions") without a cutoff. Adjust here if
// CATO staff feedback says otherwise, this is the one place the numbers live.
const NEW_ACCOUNT_WINDOW_DAYS = 30;
const THIN_DESCRIPTION_MIN_WORDS = 8;
// vendor-mode-spec.md: "One business listing per account by default. A
// second listing attempt from the same account gets flagged for staff
// review." A second listing is already the case the doc calls out, so 2 is
// the threshold the doc itself implies, not a number invented here.
const MULTIPLE_SUBMISSIONS_THRESHOLD = 2;

function normalizeDescription(description: string | null): string {
  return (description ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isThinDescription(description: string | null): boolean {
  const normalized = normalizeDescription(description);
  if (normalized.length === 0) return true;
  const wordCount = normalized.split(" ").filter(Boolean).length;
  return wordCount < THIN_DESCRIPTION_MIN_WORDS;
}

function isNewAccount(accountCreatedAt: string | null | undefined, now: Date): boolean | null {
  if (!accountCreatedAt) return null;
  const created = new Date(accountCreatedAt);
  if (Number.isNaN(created.getTime())) return null;
  const ageDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= NEW_ACCOUNT_WINDOW_DAYS;
}

export interface ComputeQueuePriorityOptions {
  /**
   * Precomputed submission count per account, when the caller already has
   * an accurate count across all of an account's listings (e.g. a separate
   * aggregate query). Falls back to counting occurrences within
   * `candidates` itself when not provided, which only reflects whatever
   * batch was passed in.
   */
  submissionCountByAccount?: Record<string, number>;
  /** Injectable for deterministic testing. Defaults to the current time. */
  now?: Date;
}

/**
 * Sorts business rows for the review queue: pending first, then by number
 * of active risk signals (highest first), then oldest updated first as the
 * final tiebreaker, matching the oldest-pending-first default already used
 * for the Places queue in admin-places.tsx.
 */
export function computeBusinessQueuePriority(
  candidates: BusinessQueueCandidate[],
  options: ComputeQueuePriorityOptions = {}
): PrioritizedBusiness[] {
  const now = options.now ?? new Date();

  // Duplicate descriptions only count against a candidate if the same text
  // shows up more than once in this set. An empty description is already
  // covered by thinDescription, so it's excluded here to avoid counting
  // every blank description as "copy pasted" against every other one.
  const descriptionCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const normalized = normalizeDescription(candidate.description);
    if (normalized.length === 0) continue;
    descriptionCounts.set(normalized, (descriptionCounts.get(normalized) ?? 0) + 1);
  }

  const fallbackSubmissionCounts = new Map<string, number>();
  for (const candidate of candidates) {
    fallbackSubmissionCounts.set(
      candidate.submittedBy,
      (fallbackSubmissionCounts.get(candidate.submittedBy) ?? 0) + 1
    );
  }

  const prioritized = candidates.map((candidate) => {
    const normalizedDescription = normalizeDescription(candidate.description);
    const submissionCount =
      options.submissionCountByAccount?.[candidate.submittedBy] ??
      fallbackSubmissionCounts.get(candidate.submittedBy) ??
      1;

    const signals: BusinessQueueSignals = {
      newAccount: isNewAccount(candidate.accountCreatedAt, now),
      noPhotos: candidate.hasPhotos === undefined ? null : !candidate.hasPhotos,
      thinDescription: isThinDescription(candidate.description),
      copyPastedDescription:
        normalizedDescription.length > 0 && (descriptionCounts.get(normalizedDescription) ?? 0) > 1,
      multipleSubmissions: submissionCount >= MULTIPLE_SUBMISSIONS_THRESHOLD,
    };

    const riskScore = [
      signals.newAccount === true,
      signals.noPhotos === true,
      signals.thinDescription,
      signals.copyPastedDescription,
      signals.multipleSubmissions,
    ].filter(Boolean).length;

    return { ...candidate, signals, riskScore };
  });

  return prioritized.sort((a, b) => {
    const statusDiff = STATUS_PRIORITY[a.verificationStatus] - STATUS_PRIORITY[b.verificationStatus];
    if (statusDiff !== 0) return statusDiff;

    const riskDiff = b.riskScore - a.riskScore;
    if (riskDiff !== 0) return riskDiff;

    return a.updatedAt.localeCompare(b.updatedAt);
  });
}
