import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * "Discard your selection?" prompt, shown by AdminDataTable when someone
 * with rows checked tries to leave the page they were checked on (another
 * route). Paging, sorting and filtering inside the page keep the selection.
 * Its own component so the wording is the same on every admin list.
 */
export function DiscardSelectionDialog({
  open,
  count,
  keepLabel = "Keep selecting",
  discardLabel = "Discard selection",
  onKeep,
  onDiscard,
}: Readonly<{
  open: boolean;
  count: number;
  keepLabel?: string;
  discardLabel?: string;
  onKeep: () => void;
  onDiscard: () => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onKeep()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard your selection?</DialogTitle>
          <DialogDescription>
            You have {count} {count === 1 ? "row" : "rows"} checked. Continuing will clear{" "}
            {count === 1 ? "it" : "them"}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onKeep}>
            {keepLabel}
          </Button>
          <Button onClick={onDiscard}>{discardLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
