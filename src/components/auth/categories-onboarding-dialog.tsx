import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryChipGroup, useCategoryNames } from "@/components/category-chip-group";

// Recommendation onboarding for a brand new Google account. The email sign-up
// popup has its own categories step (signup-form.tsx), but Google sign-up has
// no form, so google-return-handler.tsx opens this one on the way back when the
// account turns out to be new. Same picker (category-chip-group.tsx) and same
// copy as that step.
//
// Unlike the email step, a session exists here, so the picks are written
// straight to profiles.preferred_categories, the same column and the same
// payload Profile saves, which is what the Home "For you" row reads. Closing the
// dialog by any route (Skip, X, outside click) saves nothing and does not ask
// again: the Google return handler only opens this once per sign in, and
// categories can still be set in Profile.
export function CategoriesOnboardingDialog({
  open,
  onClose,
}: Readonly<{ open: boolean; onClose: () => void }>) {
  const { session, refreshProfile } = useAuth();
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { placeList, businessList } = useCategoryNames(open);

  function toggleCategory(name: string) {
    setChosen((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  async function handleSave() {
    if (!session || saving || chosen.length === 0) return;

    setSaving(true);
    setError(null);

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ preferred_categories: chosen })
      .eq("id", session.user.id);

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    await refreshProfile();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preferred Categories</DialogTitle>
          <DialogDescription>
            Choose what you want to see first on Home. You can change this anytime in Profile.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex max-h-64 flex-col gap-4 overflow-y-auto px-1 py-1">
          <CategoryChipGroup label="Places" list={placeList} selected={chosen} onToggle={toggleCategory} />
          <CategoryChipGroup label="Businesses" list={businessList} selected={chosen} onToggle={toggleCategory} />
        </div>

        {error && <p className="text-base text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving || chosen.length === 0}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
