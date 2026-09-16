import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SlideFormDialog from "@/components/admin/slide-form-dialog";
import {
  fetchAllSlides,
  deleteSlide,
  reorderSlides,
  removeSlideFile,
  type LandingSlide,
} from "@/lib/landing-slides";
import { usePageTitle } from "@/lib/page-title";

/**
 * landing-hero-phases.md Phase 3.3-3.6, 3.13-3.14. The hero carousel
 * shown on the public landing page. A simple row list, not
 * AdminDataTable: a landing carousel holds a handful of slides, and
 * ux-ui-guidelines.md's Component Sizing Rules rule out a data table for
 * under 5 rows. The thumbnail is each row's real content, which a table
 * column serves badly.
 *
 * Reorder follows admin-trail-builder.tsx's existing up/down icon-button
 * pattern (handleMoveStop), not a drag library -- no drag dependency is
 * installed anywhere in the app, and Categories' own reorder control was
 * already removed in favor of a plain fetch order, so this page and
 * admin-trail-builder.tsx are now the two places manual reorder lives,
 * both the same shape.
 */
export default function AdminLandingPage() {
  usePageTitle("Landing Page");

  const [slides, setSlides] = useState<LandingSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<LandingSlide | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LandingSlide | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSlides(await fetchAllSlides());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load slides.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditingSlide(null);
    setDialogOpen(true);
  }

  function openEdit(slide: LandingSlide) {
    setEditingSlide(slide);
    setDialogOpen(true);
  }

  // Reorder local state first, then persist, same optimistic-then-persist
  // shape architecture-notes.md's Current State Notes already documents
  // for admin reorder controls. Revert on failure so the visible order
  // never lies about what's actually saved.
  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= slides.length || reordering) return;

    const reordered = [...slides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const previous = slides;
    setSlides(reordered);
    setReordering(true);
    try {
      await reorderSlides(reordered.map((s) => s.id));
    } catch (reorderError) {
      setSlides(previous);
      setError(reorderError instanceof Error ? reorderError.message : "Could not save the new order.");
    } finally {
      setReordering(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSlide(deleteTarget.id);
      // Row first, then the storage object, best effort, same order and
      // failure handling as admin-place-detail.tsx's handleRemovePhoto.
      void removeSlideFile(deleteTarget.image_url);
      setSlides((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this slide.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Landing Page</h1>
        <Button onClick={openNew}>Add Slide</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && slides.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input py-16 text-center">
          <ImagePlus className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No slides yet.</p>
        </div>
      )}

      {!loading && slides.length > 0 && (
        <ul className="flex flex-col gap-2">
          {slides.map((slide, index) => (
            <li
              key={slide.id}
              className="flex items-center gap-4 rounded-md border border-border bg-card p-3"
            >
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-border">
                <img src={slide.image_url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-sm text-foreground">{slide.caption}</p>
                <Badge variant={slide.active ? "default" : "outline"} className="w-fit">
                  {slide.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={index === 0 || reordering}
                onClick={() => handleMove(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Move up</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={index === slides.length - 1 || reordering}
                onClick={() => handleMove(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
                <span className="sr-only">Move down</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Open actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(slide)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteTarget(slide)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <SlideFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        slide={editingSlide}
        slideCount={slides.length}
        onSaved={load}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this slide?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes it from the landing page carousel. This can't be undone.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
