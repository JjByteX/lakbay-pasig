import { useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharCount } from "@/components/business/business-fields";
import {
  createSlide,
  updateSlide,
  uploadSlideImage,
  removeSlideFile,
  validateSlideFile,
  type LandingSlide,
} from "@/lib/landing-slides";

/**
 * landing-hero-phases.md Phase 3.7-3.11. Controlled dialog matching
 * staff-form-dialog.tsx's open/onOpenChange shape. Not built on
 * category-form-dialog.tsx's shape either -- that dialog has no image
 * field at all, so there's nothing there to reuse for this one's actual
 * new surface (the upload target).
 *
 * Image field reuses PhotoUploadArea's dashed-drop-target styling from
 * admin-place-detail.tsx, single-image instead of a grid since a slide
 * carries exactly one image, not a photo collection.
 */

const CAPTION_MAX = 120;

interface SlideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Slide being edited, or null for a new slide. */
  slide: LandingSlide | null;
  /** Current slide count, used to place a new slide at the end of the order. */
  slideCount: number;
  onSaved: () => void;
}

export default function SlideFormDialog({
  open,
  onOpenChange,
  slide,
  slideCount,
  onSaved,
}: Readonly<SlideDialogProps>) {
  const isNew = slide === null;

  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [active, setActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to the slide being edited, or a clean slate for New, every time
  // the dialog opens -- same reasoning staff-form-dialog.tsx's own effect
  // comment gives, this component instance is reused across every open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setUploading(false);
    if (slide) {
      setImageUrl(slide.image_url);
      setCaption(slide.caption);
      setActive(slide.active);
    } else {
      setImageUrl("");
      setCaption("");
      setActive(true);
    }
  }, [open, slide]);

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateSlideFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const previousUrl = imageUrl;
      const publicUrl = await uploadSlideImage(file);
      setImageUrl(publicUrl);
      // Replacing an existing image on an already-saved slide: the old
      // file is now orphaned in storage, remove it best-effort, same
      // "don't block the UI on a cleanup failure" reasoning as
      // handleRemovePhoto.
      if (previousUrl) {
        void removeSlideFile(previousUrl);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Save stays disabled until both fields are present, and names which
  // one is missing rather than leaving a bare disabled button, per
  // ux-ui-guidelines.md's state rules.
  const missing: string[] = [];
  if (!imageUrl) missing.push("an image");
  if (!caption.trim()) missing.push("a caption");
  const canSubmit = missing.length === 0 && !uploading && !saving;
  let submitLabel = "Save Changes";
  if (saving) submitLabel = "Saving…";
  else if (isNew) submitLabel = "Add Slide";

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const input = { image_url: imageUrl, caption: caption.trim(), active };
      if (isNew) {
        await createSlide(input, slideCount);
      } else {
        await updateSlide(slide.id, input);
      }
      onSaved();
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this slide.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Slide" : "Edit Slide"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Label>Image</Label>
            <div className="grid grid-cols-3 gap-2">
              {imageUrl && (
                <div className="group relative aspect-square overflow-hidden rounded-md border border-border">
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="absolute right-1 top-1 rounded-md bg-foreground/60 p-1 text-background opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Remove image</span>
                  </button>
                </div>
              )}
              {!imageUrl && (
                <label
                  htmlFor="slide-image-upload"
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-muted-foreground hover:bg-muted"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  <span className="text-xs">{uploading ? "Uploading…" : "Add"}</span>
                  <input
                    id="slide-image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelected}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="slide-caption">Caption</Label>
            <Input
              id="slide-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
              maxLength={CAPTION_MAX}
              required
            />
            <CharCount value={caption} max={CAPTION_MAX} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Active</Label>
            {/* Styled native checkbox per decision-log #8: no Switch
                primitive exists in this app, every toggle uses this same
                pattern. */}
            <label className="flex w-fit items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span>Shown in the carousel</span>
            </label>
          </div>

          {missing.length > 0 && !saving && (
            <p className="text-sm text-muted-foreground">
              Needs {missing.join(" and ")} before this can be saved.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
