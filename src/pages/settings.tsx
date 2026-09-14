import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { applyTheme, applyFontSize, type FontSizePreference } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/lib/page-title";

// 4.1: three fixed options, single-select -- a Select reads better here
// than a three-button toggle group (profile.tsx's own multi-select Button
// row is for Preferred Categories, a genuine multi-select; font size is a
// single choice among three, closer to profile.tsx's own Preferred
// Language Select, which this reuses the same composition for). No new
// primitive: src/components/ui/select.tsx already exists and is already
// used elsewhere in this codebase, per constraints.md's Inventory Before
// Suggesting rule.
const FONT_SIZE_LABELS: Record<Exclude<FontSizePreference, null>, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
};
const FONT_SIZES = Object.keys(FONT_SIZE_LABELS) as Exclude<FontSizePreference, null>[];

/**
 * Settings: Personalization, Phase 2. Settings sub-page, reached from
 * Profile (Phase 2.4's link). Lives inside Profile per settings-
 * personalization-plan.md's "Where it lives" section -- a real page, not
 * a modal, since this is a sub-page with room to grow, not a focused
 * single task.
 *
 * 2.1: route is profile/settings, nested under PublicShell next to the
 * existing profile route in App.tsx, same un-wrapped pattern saved,
 * profile, and vendor already use -- navigation-and-access-control.md's
 * Profile is "locked, prompt to sign in" for a Guest, not redirected
 * away, so this page owns its own guest check rather than reusing
 * protected-route.tsx's redirect-away behavior.
 *
 * 2.2: guest branch copies profile.tsx's own signed-out block structure
 * (heading, one line, a Sign in button) but not its wording, per the
 * Label Rules' one-message empty state and per this file's own Phase
 * 6.2 requirement that Settings' signed-out message reads as distinct
 * from Profile's and Saved's, not an unexplained duplicate on the same
 * nested route pair.
 *
 * 2.3: loading guard identical to profile.tsx's `if (loading) return
 * null` -- session starts null even for an already-signed-in user until
 * auth-context.tsx's initial getSession() resolves, so this page must
 * not render the guest message and then flash to the real content a
 * moment later.
 *
 * 2.5: gear icon (lucide-react's Settings, aliased to avoid colliding
 * with this component's own name) on the page heading, paired with a
 * visible "Settings" text label per the Icon Rules -- gear is not one of
 * the icons ux-ui-guidelines.md exempts from a label (home, search,
 * close, back, play, pause), so the label stays regardless.
 *
 * Phase 3: dark mode control. 3.1 checked src/components/ui first --
 * no Switch primitive exists, same gap admin-event-detail.tsx's own
 * end-date toggle already hit, so this reuses that file's exact fallback
 * (a native checkbox styled with accent-primary) rather than adding a
 * new dependency or building a Switch component for one control. See
 * decision-log.md entry #8. 3.2 seeds from profile.theme_preference.
 * 3.3 is optimistic: applyTheme fires immediately, then the write, no
 * separate Save button per the Automation First rule. 3.4 reverts both
 * the switch and the applied class on write failure, plus an inline
 * text-destructive error line. 3.5 calls refreshProfile() on success.
 *
 * Phase 4: font size control. 4.1 checked src/components/ui/select.tsx
 * first (already exists, already used by profile.tsx's Preferred
 * Language field) rather than a three-button toggle group -- font size is
 * a single-select of three fixed options, matching that existing Select
 * usage more closely than profile.tsx's Preferred Categories row, which
 * is a genuine multi-select. 4.2 seeds from profile.font_size_preference,
 * null reading as "default" (Phase 1.2's null-means-default resolution,
 * not blank). 4.3 is optimistic, same shape as Phase 3.3: applyFontSize
 * fires immediately, then the write, no separate Save button. 4.4 reverts
 * both the selection and the applied size on write failure, same inline
 * text-destructive treatment as Phase 3.4. 4.5 calls refreshProfile() on
 * success, same as Phase 3.5.
 */
export default function SettingsPage() {
  usePageTitle("Settings");
  const { session, profile, loading, refreshProfile } = useAuth();

  // 3.2: seeded from profile.theme_preference on load, same pattern
  // profile.tsx's own form fields seed from profile in its load effect.
  // Re-seeds whenever profile changes (including after this page's own
  // refreshProfile call), not just once on mount.
  const [darkMode, setDarkMode] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDarkMode(profile.theme_preference === "dark");
  }, [profile]);

  // 4.2: seeded from profile.font_size_preference on load, null reading
  // as "default" per Phase 1.2's null-means-default resolution (the new
  // baseline, not "small"/today's-look). Same re-seed-on-profile-change
  // shape as the dark mode state above.
  const [fontSize, setFontSize] = useState<Exclude<FontSizePreference, null>>("default");
  const [fontSizeSaving, setFontSizeSaving] = useState(false);
  const [fontSizeError, setFontSizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFontSize(profile.font_size_preference ?? "default");
  }, [profile]);

  // 3.3/3.4: optimistic update -- applyTheme fires immediately for
  // instant feedback, then the write. On failure, revert both the
  // switch and the applied class back to the prior state and show an
  // inline error, same text-destructive treatment profile.tsx's
  // saveError and vendorError already use. No separate Save button,
  // per the Automation First rule, a two-state preference needs no
  // confirmation step.
  async function handleDarkModeChange(checked: boolean) {
    if (!session || themeSaving) return;

    const previous = darkMode;
    const nextTheme = checked ? "dark" : "light";

    setDarkMode(checked);
    setThemeError(null);
    applyTheme(nextTheme);
    setThemeSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ theme_preference: nextTheme })
      .eq("id", session.user.id);

    setThemeSaving(false);

    if (error) {
      setDarkMode(previous);
      applyTheme(previous ? "dark" : "light");
      setThemeError(error.message);
      return;
    }

    // 3.5: profile.tsx's Phase 0.8 refreshProfile, so context (and any
    // other open tab reading it) reflects the write without a reload.
    await refreshProfile();
  }

  // 4.3/4.4: same optimistic-then-persist shape as handleDarkModeChange
  // above. applyFontSize fires immediately, then the write; on failure,
  // revert both the selection and the applied size, show the same inline
  // text-destructive error line.
  async function handleFontSizeChange(next: Exclude<FontSizePreference, null>) {
    if (!session || fontSizeSaving) return;

    const previous = fontSize;

    setFontSize(next);
    setFontSizeError(null);
    applyFontSize(next);
    setFontSizeSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ font_size_preference: next })
      .eq("id", session.user.id);

    setFontSizeSaving(false);

    if (error) {
      setFontSize(previous);
      applyFontSize(previous);
      setFontSizeError(error.message);
      return;
    }

    // 4.5: same refreshProfile() call as Phase 3.5.
    await refreshProfile();
  }

  if (loading) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-10">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <SettingsIcon className="h-5 w-5 shrink-0" />
          Settings
        </h1>
        <p className="text-base text-muted-foreground">
          Sign in to change your theme and font size.
        </p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <SettingsIcon className="h-5 w-5 shrink-0" />
        Settings
      </h1>

      {/* 3.1: no Switch primitive exists in src/components/ui (confirmed
          before writing this), same gap admin-event-detail.tsx's own
          end-date toggle hit. Same fallback that file already
          established for this exact situation: a native checkbox styled
          with accent-primary, not a new dependency and not a from-
          scratch Switch component for one control, per constraints.md's
          Inventory Before Suggesting rule. See decision-log.md entry #8. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="dark_mode" className="flex w-fit items-center gap-2 text-base text-foreground">
          <input
            id="dark_mode"
            type="checkbox"
            checked={darkMode}
            onChange={(e) => handleDarkModeChange(e.target.checked)}
            disabled={themeSaving}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span>Dark mode</span>
        </label>
        {themeError && <p className="text-base text-destructive">{themeError}</p>}
      </div>

      {/* 4.1: Select, not a three-button group -- see the import comment
          above for why. Single-select of three fixed options, same
          optimistic write shape as the dark mode row above. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="font_size" className="text-base text-foreground">
          Font size
        </label>
        <Select
          value={fontSize}
          onValueChange={(v) => handleFontSizeChange(v as Exclude<FontSizePreference, null>)}
          disabled={fontSizeSaving}
        >
          <SelectTrigger id="font_size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {FONT_SIZE_LABELS[size]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fontSizeError && <p className="text-base text-destructive">{fontSizeError}</p>}
      </div>
    </div>
  );
}
