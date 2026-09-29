import { useEffect, useState, type FormEvent } from "react";
import { type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, categoryColor } from "@/lib/category-colors";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * category-form-dialog.tsx — Category Directory, Phase 3.1. One shared
 * dialog for all three tables (place_categories, trail_categories,
 * event_categories), not three near-duplicate modals: same controlled
 * open/onOpenChange/onSaved shape staff-form-dialog.tsx already
 * established (reused directly, per constraints.md's Inventory Before
 * Suggesting rule), parameterized by a small `config` object instead of a
 * `table` string, since each table's create/update functions and icon
 * shortlist are already three separate typed modules (place-categories.ts/
 * trail-categories.ts/event-categories.ts, place-category-icons.ts/trail-
 * category-icons.ts/event-category-icons.ts, Phase 1) -- passing the
 * functions themselves is one prop, passing a table name would still need
 * a lookup back to the same functions somewhere.
 *
 * No fetchOne / per-row network call on open: the caller (admin-
 * categories.tsx) already has every row in memory from the tab's own
 * fetchAllCategories load the moment an Edit action is clicked, so the row
 * being edited is passed straight in as `initialValue` instead of adding a
 * new lib function and a second round trip per table, per ponytail's
 * reuse-what-you-have rung.
 *
 * 3.2 fields: name, icon picker, active toggle. 3.3 icon picker: grid of
 * buttons, icon plus label, selected state highlighted, same Button-toggle
 * pattern admin-place-detail.tsx's facilities field and staff-form-
 * dialog.tsx's permission toggles already use, extended with an icon
 * alongside the label. 3.4 validation: name required and unique within
 * that table (client-side check against `existingNames`, the tab's
 * already-fetched list, no extra round trip -- DB unique constraint,
 * confirmed in each table's own migration, is still the source of truth,
 * this is a UX guard in front of it, not a replacement). Icon required.
 * Submit gated with a visible reason per ux-ui-guidelines.md's
 * Disabled/gated rule. 3.5's dialogTarget state lives in the caller
 * (admin-categories.tsx), same null/"new"/id shape admin-staff.tsx uses.
 *
 * Category Colors: `config.colors` (Places and Business tabs only) adds a
 * row of round swatches after the icon grid and sends `color` with the
 * payload. Off for the other three tables, which have no `color` column,
 * so the payload never carries the key there.
 */

export interface CategoryFormValue {
  name: string;
  icon: string;
  active: boolean;
  // Palette key (category-colors.ts). Only used when config.colors.
  color?: string | null;
}

interface IconOption {
  value: string;
  label: string;
  component: PhosphorIcon;
}

export interface CategoryFormConfig {
  /** Shown in the dialog title, e.g. "Place Category". */
  label: string;
  icons: IconOption[];
  /** Show the color swatch row and send `color`. Places and Business only. */
  colors?: boolean;
  create: (input: CategoryFormValue) => Promise<void>;
  update: (id: string, input: CategoryFormValue) => Promise<void>;
}

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Category row id being edited, or null for a new category. */
  categoryId: string | null;
  /**
   * The row being edited, already in memory from the tab's own
   * fetchAllCategories load (admin-categories.tsx) -- no separate fetch
   * function here, per ponytail's reuse-what-you-have rung: the caller
   * already has the full row set the moment a row's Edit action is
   * clicked, a fetchOne round trip would be new code fetching data that's
   * already sitting in the tab's own state. Undefined only while isNew.
   */
  initialValue?: CategoryFormValue;
  config: CategoryFormConfig;
  /** Every other category's name already in this table, for the 3.4 client-side uniqueness check. Excludes the row being edited. */
  existingNames: string[];
  /** Called after a successful create or save, so the caller can refresh its list. */
  onSaved: () => void;
}

const EMPTY_FORM: CategoryFormValue = { name: "", icon: "", active: true, color: DEFAULT_CATEGORY_COLOR };

// Swatch states: selected gets a full ring, the rest a hover ring. Focus
// ring is always on for keyboard users.
const SWATCH_BASE =
  "h-10 w-10 rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SWATCH_SELECTED = "ring-2 ring-ring";
const SWATCH_IDLE = "hover:ring-2 hover:ring-muted-foreground";

export default function CategoryFormDialog({
  open,
  onOpenChange,
  categoryId,
  initialValue,
  config,
  existingNames,
  onSaved,
}: Readonly<CategoryFormDialogProps>) {
  const isNew = categoryId === null;

  const [form, setForm] = useState<CategoryFormValue>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    // Reset to a clean slate every time the dialog opens, since the same
    // component instance is reused across New and every Edit invocation,
    // same reasoning staff-form-dialog.tsx's own reset effect uses.
    setError(null);
    const base = isNew || !initialValue ? EMPTY_FORM : initialValue;
    // A null color on an existing row reads as blue in the app, so blue is
    // what shows selected here. Depends on config.colors, not config:
    // admin-categories.tsx builds a new config object every render.
    setForm(config.colors ? { ...base, color: base.color ?? DEFAULT_CATEGORY_COLOR } : base);
  }, [open, isNew, initialValue, config.colors]);

  function updateField<K extends keyof CategoryFormValue>(key: K, value: CategoryFormValue[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const trimmedName = form.name.trim();
  const isDuplicateName = existingNames.some(
    (name) => name.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  // Disabled/gated rule (ux-ui-guidelines.md): every reason submit is
  // blocked has to be visible, not just an inert disabled button. Each
  // condition below maps to its own message shown next to the submit
  // button, checked in the same order as this list.
  let blockedReason: string | null = null;
  if (trimmedName.length === 0) {
    blockedReason = "Name is required.";
  } else if (isDuplicateName) {
    blockedReason = "A category with this name already exists.";
  } else if (!form.icon) {
    blockedReason = "Choose an icon.";
  }

  const canSubmit = blockedReason === null && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      // Send color only when this table has the column.
      const { color, ...rest } = form;
      const payload: CategoryFormValue = {
        ...rest,
        name: trimmedName,
        ...(config.colors ? { color } : {}),
      };
      if (isNew) {
        await config.create(payload);
      } else if (categoryId) {
        await config.update(categoryId, payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      // DB unique constraint (each table's migration) is the source of
      // truth behind the 3.4 client-side check above; this surfaces
      // whatever it reports if a race slips past the in-memory check,
      // same plain error.message convention staff-form-dialog.tsx uses.
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  let submitLabel = "Save Changes";
  if (saving) {
    submitLabel = "Saving…";
  } else if (isNew) {
    submitLabel = "Create Category";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? `New ${config.label}` : `Edit ${config.label}`}</DialogTitle>
        </DialogHeader>

        {!isNew && !initialValue ? (
          <p className="text-sm text-destructive">Could not load this category.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="category_name">Name</Label>
              <Input
                id="category_name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
                maxLength={60}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {config.icons.map((option) => {
                  const active = form.icon === option.value;
                  const Icon = option.component;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className="h-auto flex-col gap-1 py-2"
                      onClick={() => updateField("icon", option.value)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-xs font-normal">{option.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {config.colors && (
              <div className="flex flex-col gap-2">
                <Label>Color</Label>
                <div role="group" aria-label="Color" className="grid w-fit grid-cols-5 gap-2">
                  {CATEGORY_COLORS.map((option) => {
                    const selected = form.color === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-label={option.label}
                        title={option.label}
                        aria-pressed={selected}
                        className={`${SWATCH_BASE} ${selected ? SWATCH_SELECTED : SWATCH_IDLE}`}
                        style={{ backgroundColor: categoryColor(option.value) }}
                        onClick={() => updateField("color", option.value)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <label htmlFor="category_active" className="flex w-fit items-center gap-2 text-sm text-foreground">
              <input
                id="category_active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => updateField("active", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span>Active</span>
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {blockedReason && !saving ? (
                  <p className="text-sm text-muted-foreground">{blockedReason}</p>
                ) : (
                  <span />
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!canSubmit}>
                    {submitLabel}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
