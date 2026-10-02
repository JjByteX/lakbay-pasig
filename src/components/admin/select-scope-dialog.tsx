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
 * Asked by AdminDataTable when the header checkbox is ticked and the list
 * spans more than one table page: select only what is on screen, or every
 * row that matches the current search and filters. Shared so the wording is
 * the same on every admin list.
 */
export function SelectScopeDialog({
  open,
  shownCount,
  totalCount,
  onSelectShown,
  onSelectAll,
  onCancel,
}: Readonly<{
  open: boolean;
  shownCount: number;
  totalCount: number;
  onSelectShown: () => void;
  onSelectAll: () => void;
  onCancel: () => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select which rows?</DialogTitle>
          <DialogDescription>
            {totalCount} rows match your current search and filters across several pages. Select only
            the {shownCount} shown on this page, or all {totalCount}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onSelectShown}>
            Only the {shownCount} shown
          </Button>
          <Button onClick={onSelectAll}>All {totalCount} rows</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
