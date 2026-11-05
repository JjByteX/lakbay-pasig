import { useEffect } from "react";
import type { SetURLSearchParams } from "react-router-dom";

type ReviewRequest = "verify" | "reject";

/**
 * The Places and Businesses tables link to a detail page with ?review=verify
 * or ?review=reject so Verify/Reject is one click from the list. This opens
 * the review dialog for that request and removes the param so a refresh does
 * not open it again. Extracted from both detail pages to keep their cognitive
 * complexity under Sonar's limit.
 */
export function useReviewParam(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
  openReviewDialog: (action: ReviewRequest) => void,
): void {
  useEffect(() => {
    const requested = searchParams.get("review");
    if (requested !== "verify" && requested !== "reject") return;
    openReviewDialog(requested);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("review");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
