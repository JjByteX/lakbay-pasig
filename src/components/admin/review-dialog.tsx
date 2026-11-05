import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharCount } from "@/components/business/business-fields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ReviewDialogAction = "verify" | "reject";

const NOTES_MAX = 1000;

// Verify/Reject dialog shared by the Places and Businesses admin detail pages,
// which rendered the same markup twice and differed only in the noun.
// Extracted to keep both pages under Sonar's cognitive complexity limit.
// Reject requires notes (the submit button stays disabled until there are
// some); verify has no notes field.
function submitLabelFor(submitting: boolean, action: ReviewDialogAction | null): string {
  if (submitting) return "Submitting…";
  return action === "verify" ? "Verify" : "Reject";
}

export function ReviewDialog({
  noun,
  action,
  notes,
  submitting,
  error,
  onNotesChange,
  onSubmit,
  onClose,
}: Readonly<{
  /** "place" or "business", used in the title and description. */
  noun: string;
  action: ReviewDialogAction | null;
  notes: string;
  submitting: boolean;
  error: string | null;
  onNotesChange: (notes: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}>) {
  const isReject = action === "reject";
  // Matches the pre-extraction pages: anything but "verify" reads as Reject.
  const isVerify = action === "verify";
  const verb = isVerify ? "Verify" : "Reject";
  const description = isVerify
    ? `This ${noun} will be marked verified and visible to the public.`
    : "Explain what needs to change. The submitter's record stays visible in the review history.";

  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`${verb} this ${noun}?`}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isReject && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-notes">Review Notes</Label>
            <Textarea
              id="review-notes"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Reason for rejection"
              required
              maxLength={NOTES_MAX}
            />
            <CharCount value={notes} max={NOTES_MAX} />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={isReject ? "destructive" : "default"}
            onClick={onSubmit}
            disabled={submitting || (isReject && notes.trim().length === 0)}
            loading={submitting}
          >
            {submitLabelFor(submitting, action)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
