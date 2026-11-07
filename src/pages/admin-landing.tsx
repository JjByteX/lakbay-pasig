import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { DotsSixVertical, Pencil, Slideshow, Trash, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AdminIconAction, AdminIconActions } from "@/components/admin/admin-icon-action";
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
import { cn } from "@/lib/utils";

/**
 * landing-hero-phases.md Phase 3.3-3.6, 3.13-3.14. The hero carousel
 * shown on the public landing page. A simple row list, not
 * AdminDataTable: a landing carousel holds a handful of slides, and
 * ux-ui-guidelines.md's Component Sizing Rules rule out a data table for
 * under 5 rows. The thumbnail is each row's real content, which a table
 * column serves badly.
 *
 * Reorder is drag and drop with motion's Reorder (already a dependency, no
 * new package). Rows move on the vertical axis only, grabbed by the handle so
 * the buttons on a row stay clickable, and the new order is saved when the
 * row is dropped. The handle also takes the up and down arrow keys, so
 * reordering still works without a pointer.
 */
interface SlideRowProps {
  slide: LandingSlide;
  disabled: boolean;
  onDragEnd: () => void;
  onKeyboardMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SlideRow({ slide, disabled, onDragEnd, onKeyboardMove, onEdit, onDelete }: Readonly<SlideRowProps>) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onKeyboardMove(event.key === "ArrowUp" ? -1 : 1);
  }

  return (
    <Reorder.Item
      as="li"
      value={slide}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd();
      }}
      // The row lifts above its neighbours while held (scale here, shadow-lg
      // below). Neighbours slide aside on a spring, and reduced motion drops
      // the animation.
      whileDrag={reduceMotion ? undefined : { scale: 1.015, zIndex: 10 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 45 }}
      className={cn(
        "relative flex select-none items-center gap-4 rounded-md border border-border bg-card p-3 transition-shadow",
        dragging && !reduceMotion && "shadow-lg"
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label="Drag to reorder. Use the up and down arrow keys to move this slide."
        onPointerDown={(event) => controls.start(event)}
        onKeyDown={handleKeyDown}
        className="-ml-1 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
      >
        <DotsSixVertical weight="bold" className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-border">
        <img src={slide.image_url} alt="" draggable={false} className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm text-foreground">{slide.caption}</p>
        <Badge variant={slide.active ? "default" : "outline"} className="w-fit">
          {slide.active ? "Active" : "Inactive"}
        </Badge>
      </div>
      <AdminIconActions>
        <AdminIconAction icon={Pencil} label="Edit" onClick={onEdit} />
        <AdminIconAction icon={Trash} label="Delete" destructive onClick={onDelete} />
      </AdminIconActions>
    </Reorder.Item>
  );
}

export default function AdminLandingPage() {
  usePageTitle("Landing Page");

  const [slides, setSlides] = useState<LandingSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  // The order last saved, to tell a real move from a drop in the same place
  // and to put the list back if saving fails.
  const savedOrder = useRef<LandingSlide[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<LandingSlide | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LandingSlide | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchAllSlides();
      savedOrder.current = loaded;
      setSlides(loaded);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load slides.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openNew() {
    setEditingSlide(null);
    setDialogOpen(true);
  }

  function openEdit(slide: LandingSlide) {
    setEditingSlide(slide);
    setDialogOpen(true);
  }

  // The list is already in its new order on screen (drag or keyboard), so
  // save it, and put the saved order back if that fails so the page never
  // shows an order that isn't stored.
  async function saveOrder(next: LandingSlide[]) {
    const previous = savedOrder.current;
    if (next.every((slide, i) => slide.id === previous[i]?.id)) return;
    setReordering(true);
    try {
      await reorderSlides(next.map((slide) => slide.id));
      savedOrder.current = next;
    } catch (reorderError) {
      setSlides(previous);
      setError(reorderError instanceof Error ? reorderError.message : "Could not save the new order.");
    } finally {
      setReordering(false);
    }
  }

  function handleKeyboardMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= slides.length || reordering) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setSlides(reordered);
    void saveOrder(reordered);
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
      savedOrder.current = savedOrder.current.filter((s) => s.id !== deleteTarget.id);
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
        <Button onClick={openNew} className="gap-1 pl-3.5">
          <Plus weight="bold" className="h-3.5 w-3.5" aria-hidden="true" />
          Add Slide
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && slides.length === 0 && (
        <div className="rounded-lg border border-dashed border-input">
          <EmptyState icon={Slideshow} className="py-16">Slides will appear here.</EmptyState>
        </div>
      )}

      {!loading && slides.length > 0 && (
        <Reorder.Group
          as="ul"
          axis="y"
          values={slides}
          onReorder={setSlides}
          className="flex flex-col gap-2"
        >
          {slides.map((slide, index) => (
            <SlideRow
              key={slide.id}
              slide={slide}
              disabled={reordering}
              onDragEnd={() => void saveOrder(slides)}
              onKeyboardMove={(direction) => handleKeyboardMove(index, direction)}
              onEdit={() => openEdit(slide)}
              onDelete={() => setDeleteTarget(slide)}
            />
          ))}
        </Reorder.Group>
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
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting} loading={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
