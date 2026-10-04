import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { Button } from "@/components/ui/button";
import { CategoryChipGroup, useCategoryNames } from "@/components/category-chip-group";

/**
 * Recommendation onboarding: a fullscreen Preferred Categories screen, on
 * desktop and mobile, shown once on a person's first signed in visit so the
 * Home "For you" row has something to go on.
 *
 * One screen for every way in. A Google sign up and an email sign up (after
 * the confirmation link) both land here the same way, so there is no categories
 * step inside the sign-up popup and no hand-off through the account's metadata.
 * Flow type (ux-ui-guidelines.md, Layout Pattern Rules): single-purpose, so a
 * centered minimal layout with no navigation, outside PublicShell like
 * /welcome. It is a fullscreen overlay rather than a route so the page the
 * person was on (a Discover result, a trail) is still there, untouched, when
 * they finish. Radix Dialog supplies the focus trap and screen reader
 * semantics; Escape is disabled because Skip is the way out.
 *
 * Who sees it: a resident (staff are skipped) with no categories whose account
 * has not been through it yet. "Been through it" is `onboarding_done` in the
 * account's own user_metadata (no schema change), written by both Done and Skip
 * so the screen is never asked twice. That includes accounts that existed
 * before this screen did and never set categories: they get it once.
 *
 * Decided once per account per page load, when the profile first loads, not
 * live. A person who later clears their categories in Profile is not shown the
 * screen again by that save.
 */
export function CategoriesOnboarding() {
  const { session, profile, loading } = useAuth();
  const [pendingFor, setPendingFor] = useState<string | null>(null);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !session || !profile) return;
    const userId = session.user.id;
    if (checkedFor.current === userId) return;
    checkedFor.current = userId;

    if (profile.staff_role) return;
    if (session.user.user_metadata?.onboarding_done === true) return;
    if ((profile.preferred_categories?.length ?? 0) > 0) return;
    setPendingFor(userId);
  }, [loading, session, profile]);

  if (!session || pendingFor !== session.user.id) return null;
  return <OnboardingScreen userId={session.user.id} onDone={() => setPendingFor(null)} />;
}

function OnboardingScreen({ userId, onDone }: Readonly<{ userId: string; onDone: () => void }>) {
  const { refreshProfile } = useAuth();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<"skip" | "done" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { placeList, businessList } = useCategoryNames(true);

  function toggleCategory(name: string) {
    setChosen((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  // Called from a click, never from onAuthStateChange, which must not await
  // auth calls (auth-context.tsx). A failed write only means the screen is
  // offered once more next load, so it is not surfaced.
  async function markDone() {
    await supabase.auth.updateUser({ data: { onboarding_done: true } });
  }

  async function handleSkip() {
    if (busy) return;
    setBusy("skip");
    await markDone();
    onDone();
  }

  // Same column and the same payload as Profile's save, so profiles_update_own
  // is all it needs and no protected column is ever sent.
  async function handleDone() {
    if (busy || chosen.length === 0) return;
    setBusy("done");
    setError(null);

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ preferred_categories: chosen })
      .eq("id", userId);

    if (saveError) {
      setBusy(null);
      setError(saveError.message);
      return;
    }

    await markDone();
    await refreshProfile();
    onDone();
  }

  const count = chosen.length;
  let status = count === 0 ? "Pick at least one to continue" : `${count} selected`;
  if (error) status = error;

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
            <img src={logo} alt="Lakbay Pasig" className="h-8 w-8" />
            <Button variant="ghost" onClick={handleSkip} disabled={busy !== null}>
              Skip
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-6">
              <div className="flex flex-col gap-2">
                <DialogPrimitive.Title className="text-4xl font-semibold text-foreground">
                  Preferred Categories
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-base text-muted-foreground">
                  Choose what you want to see first on Home. You can change this anytime in Profile.
                </DialogPrimitive.Description>
              </div>

              <CategoryChipGroup
                variant="tile"
                label="Places"
                list={placeList}
                selected={chosen}
                onToggle={toggleCategory}
              />
              <CategoryChipGroup
                variant="tile"
                label="Businesses"
                list={businessList}
                selected={chosen}
                onToggle={toggleCategory}
              />
            </div>
          </div>

          <footer className="border-t border-border bg-card">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p
                aria-live="polite"
                className={`text-center text-sm sm:text-left ${error ? "text-destructive" : "text-muted-foreground"}`}
              >
                {status}
              </p>
              <Button size="lg" className="h-11 sm:h-9" onClick={handleDone} disabled={busy !== null || count === 0}>
                {busy === "done" ? "Saving..." : "Done"}
              </Button>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
