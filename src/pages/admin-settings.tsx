import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  handleDarkModeChange,
  handleFontSizeChange,
  FONT_SIZE_LABELS,
  FONT_SIZES,
  type FontSizePreference,
} from "@/lib/preferences";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/lib/page-title";

/**
 * Staff/Admin Settings, sidebar item at /admin/settings. Added because
 * profiles.theme_preference/font_size_preference (migration 0021,
 * settings-personalization-plan.md) always applied to every signed-in
 * session, staff included -- auth-context.tsx's applyTheme/applyFontSize
 * calls in its session-load effect are not gated on role -- but the only
 * UI that ever wrote to either column was settings.tsx, nested under
 * Profile, which is a public-shell-only route no staff session can reach
 * (the sidebar has no Profile item and PublicShell is never mounted
 * inside /admin). Staff have been able to have the columns set for them
 * (e.g. by using a Registered User account on the same browser profile)
 * but never had a way to set them from inside the admin panel itself.
 *
 * This page is the same mechanism settings.tsx already established
 * (same preferences.ts functions, same optimistic-write-then-persist
 * shape, same revert-on-failure behavior) with two differences, both
 * matching this shell rather than the public one:
 *   - No Guest branch: every route under /admin is already wrapped in
 *     ProtectedRoute requireStaff (App.tsx), so a signed-out or
 *     non-staff session never reaches this component at all, unlike
 *     settings.tsx which owns its own signed-out check as a public-
 *     shell page.
 *   - Visible to every staff member, Admin and Staff alike, no
 *     permission gate and no adminOnly flag on its sidebar entry --
 *     confirmed directly rather than assumed, since Dashboard is the
 *     only other sidebar item with this same "always visible" shape
 *     (admin-panel-spec.md's Access Rule scopes permission gating to
 *     content sections, a personal display preference isn't content).
 *   - Heading and label sizing follow this shell's own convention
 *     (text-xl/text-sm, no icon-plus-label heading treatment), not
 *     settings.tsx's public-surface gear-icon heading, matching every
 *     other admin page's plain text-xl h1 (admin-dashboard.tsx,
 *     admin-staff.tsx, etc.), not profile.tsx's icon-label pattern
 *     Settings borrowed for its own Profile-nested context.
 *
 * Step 8 cleanup: this page's own handleDarkModeChange/handleFontSizeChange
 * closures and its own FONT_SIZE_LABELS/FONT_SIZES were byte-identical
 * (apart from settings.tsx's extra ctx plumbing, itself only there for a
 * Cognitive Complexity reason that file's comment explains) to settings.
 * tsx's copies. Both now come from preferences.ts, the file that already
 * owns FontSizePreference and the two apply* functions underneath them --
 * this page just supplies its own state and refreshProfile through the
 * same ctx shape settings.tsx already calls with, rather than keeping a
 * second hand-written copy of the same optimistic-write-then-persist
 * logic in sync by hand.
 */
export default function AdminSettingsPage() {
  usePageTitle("Settings");
  const { session, profile, refreshProfile } = useAuth();

  const [darkMode, setDarkMode] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDarkMode(profile.theme_preference === "dark");
  }, [profile]);

  const [fontSize, setFontSize] = useState<Exclude<FontSizePreference, null>>("default");
  const [fontSizeSaving, setFontSizeSaving] = useState(false);
  const [fontSizeError, setFontSizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFontSize(profile.font_size_preference ?? "default");
  }, [profile]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      {/* Same native-checkbox-styled-as-a-toggle fallback settings.tsx and
          admin-event-detail.tsx already established (decision-log.md
          entry #8, no Switch primitive in src/components/ui), text-sm
          here to match this shell's own type scale rather than the
          public surface's text-base. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="admin_dark_mode" className="flex w-fit items-center gap-2 text-sm text-foreground">
          <input
            id="admin_dark_mode"
            type="checkbox"
            checked={darkMode}
            onChange={(e) =>
              handleDarkModeChange(e.target.checked, {
                session,
                themeSaving,
                darkMode,
                setDarkMode,
                setThemeError,
                setThemeSaving,
                refreshProfile,
              })
            }
            disabled={themeSaving}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span>Dark mode</span>
        </label>
        {themeError && <p className="text-sm text-destructive">{themeError}</p>}
      </div>

      <div className="flex max-w-xs flex-col gap-2">
        <label htmlFor="admin_font_size" className="text-sm text-foreground">
          Font size
        </label>
        <Select
          value={fontSize}
          onValueChange={(v) =>
            handleFontSizeChange(v as Exclude<FontSizePreference, null>, {
              session,
              fontSizeSaving,
              fontSize,
              setFontSize,
              setFontSizeError,
              setFontSizeSaving,
              refreshProfile,
            })
          }
          disabled={fontSizeSaving}
        >
          <SelectTrigger id="admin_font_size">
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
        {fontSizeError && <p className="text-sm text-destructive">{fontSizeError}</p>}
      </div>
    </div>
  );
}
