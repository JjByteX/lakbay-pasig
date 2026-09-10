import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DiscoverResult } from "@/lib/discover-types";

// Phase 6.1 (step-5-phases.md), pulled forward because Phase 4.4 requires
// it to exist: "the same result card component Phase 6 defines." Scoped
// here to exactly what 4.4 needs to open on a marker tap: name, category,
// and the verification label. Full record fields (6.3-6.4: description,
// hours, item list, etc.) live on the separate detail route (6.2) this
// modal links out to below, not duplicated into the preview itself.
//
// Verification label per navigation-and-access-control.md's v1 scope:
// "Verified by Pasig Tourism Office" only, no named contributor credit.
// Pending business gets a visually distinct "Pending Verification" badge,
// per vendor-mode-spec.md, so an unreviewed listing never borrows the look
// of institutional trust it has not earned yet. Badge variant mapping
// reuses admin-places.tsx's STATUS_VARIANT convention (verified: default,
// pending: outline) for the same visual meaning across staff and public
// surfaces, rather than inventing a new pair of tokens.
// Exported since Phase 5.2: list rows need the identical badge treatment
// per step-5-plan.md's "every result card shows a verification label,"
// reused here rather than a second copy of the same status-to-label
// mapping, per constraints.md's Inventory Before Suggesting rule.
export function VerificationBadge({ status }: { status: DiscoverResult["verification_status"] }) {
  if (status === "pending") {
    return <Badge variant="outline">Pending Verification</Badge>;
  }
  return <Badge variant="default">Verified by Pasig Tourism Office</Badge>;
}

interface ResultCardProps {
  result: DiscoverResult | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal preview opened from a marker tap (Phase 4.4) or a list row tap
 * (Phase 5.2). Centered modal per ux-ui-guidelines.md's modal-vs-panel
 * rule: a focused preview that fits comfortably in a single viewport, not
 * a side panel.
 *
 * Phase 6.2 closes the loop this card left open: "View full details" links
 * to the dedicated detail route (discover-place-detail.tsx / discover-
 * business-detail.tsx, App.tsx's discover/place/:id and discover/
 * business/:id), branching on the same `kind` discriminator Phase 3.2
 * defined for exactly this. `asChild` on the Button lets react-router-
 * dom's Link own the actual anchor element instead of nesting an anchor
 * inside a button, matching the pattern already used for row actions
 * elsewhere in this codebase (e.g. admin-trails.tsx's Link-based row
 * links). Link variant, not default, since this is a secondary
 * navigation action inside a preview, not the modal's primary action.
 */
export function ResultCard({ result, onOpenChange }: ResultCardProps) {
  return (
    <Dialog open={result !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {result && (
          <>
            <DialogHeader>
              <DialogTitle>{result.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{result.category}</p>
              {result.description && (
                <p className="text-base text-foreground">{result.description}</p>
              )}
              <VerificationBadge status={result.verification_status} />
            </div>
            <DialogFooter>
              <Button asChild variant="link" className="px-0">
                <Link to={`/discover/${result.kind}/${result.id}`} onClick={() => onOpenChange(false)}>
                  View full details
                </Link>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
