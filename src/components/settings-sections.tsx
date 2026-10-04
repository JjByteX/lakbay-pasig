import { useEffect, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import {
  handleDarkModeChange,
  handleFontSizeChange,
  FONT_SIZE_LABELS,
  FONT_SIZES,
  type FontSizePreference,
} from "@/lib/preferences";
import { fetchHidden, itemKey, unhideItem, type HiddenItem } from "@/lib/recommendations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PasswordInput } from "@/components/ui/password-input";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { SettingsSection } from "@/lib/settings-modal";
import { withThemeTransition } from "@/lib/theme-transition";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";

// 8.6: same minimum this repo already enforces at signup (signup.tsx),
// so "too short" reads the same reason in both places a password is ever
// set.
const MIN_PASSWORD_LENGTH = 8;

// 4.1: three fixed options, single-select -- a Select reads better here
// than a three-button toggle group (profile.tsx's own multi-select Button
// row is for Preferred Categories, a genuine multi-select; font size is a
// single choice among three, closer to a plain single-select Select
// usage). No new primitive: src/components/ui/select.tsx already exists
// and is already used elsewhere in this codebase, per constraints.md's
// Inventory Before Suggesting rule.
//
// Step 8 cleanup: FONT_SIZE_LABELS/FONT_SIZES and the handleDarkModeChange/
// handleFontSizeChange module-scope handlers below were byte-identical
// (apart from ctx plumbing) to admin-settings.tsx's own copies -- all
// four now live in preferences.ts, the file that already owns
// FontSizePreference and the two apply* functions these build on, and
// both pages import from there instead of each declaring its own.

/**
 * NOTE: Settings is now a modal (components/settings-modal.tsx), opened via
 * lib/settings-modal.tsx. This file holds the sections it shows (General,
 * Account, Password). The history below predates the modal, where it was a
 * routed page; the page-level details (route, guest branch, heading) now live
 * in the redirect pages settings.tsx / admin-settings.tsx.
 *
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
 * 2.5: gear icon (Phosphor's Gear, aliased to avoid colliding
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
 * first (already exists, already used elsewhere in this codebase)
 * rather than a three-button toggle group -- font size is
 * a single-select of three fixed options, matching that existing Select
 * usage more closely than profile.tsx's Preferred Categories row, which
 * is a genuine multi-select. 4.2 seeds from profile.font_size_preference,
 * null reading as "default" (Phase 1.2's null-means-default resolution,
 * not blank). 4.3 is optimistic, same shape as Phase 3.3: applyFontSize
 * fires immediately, then the write, no separate Save button. 4.4 reverts
 * both the selection and the applied size on write failure, same inline
 * text-destructive treatment as Phase 3.4. 4.5 calls refreshProfile() on
 * success, same as Phase 3.5.
 *
 * Phase 8.3-8.5/8.7-8.8: Account Settings section. 8.2's schema decision
 * (decision-log.md entry #12, migration 0030) locked in profiles.username,
 * first_name, last_name, profile_picture as new nullable columns, with
 * contact_number already existing from migration 0002 -- this section
 * writes to those four columns (profile_picture is out of scope here,
 * owned by AvatarUpload on profile.tsx per Phase 6.4).
 *
 * 8.3: one card, not four -- username, first name, last name, and contact
 * number are one logical account-identity concept per the Card
 * Fragmentation rule, so they share a single per-field-gated Save flow
 * below rather than one card each. No card.tsx primitive exists in
 * src/components/ui (confirmed before writing this); the app's
 * established card shape is the `rounded-lg border border-border bg-card
 * p-4` utility-class pattern already used throughout admin/vendor pages
 * (e.g. admin-dashboard.tsx's stat tiles, admin-discovery-content-
 * review.tsx's row group), not a new primitive. Per 8.10, the existing
 * Personalization block above is wrapped in the same class so the page
 * reads as one consistent surface, not one bare and one boxed section.
 *
 * 8.4/8.5: each field saves independently on its own Save action (not one
 * shared submit), same reasoning theme_preference/font_size_preference
 * above already save independently of each other -- a username edit
 * failing should never block an already-valid contact number write. Each
 * field gets its own idle/editing/saving/error state, mirroring avatar-
 * upload.tsx's per-field status shape (Phase 6.7) rather than one shared
 * section-wide status line, per 8.8. Contact Number reuses profile.tsx's
 * exact updateContactNumber digits-only/15-char-cap treatment so the same
 * field behaves identically in both places it appears. On top of that,
 * 8.5's own "specific inline error for an invalid format" is new here:
 * digits-only stripping alone never rejected a too-short or too-long
 * result, so AccountField's optional `validate` prop (Contact Number
 * only) checks the PH mobile shape (09XXXXXXXXX or a 63-prefixed
 * variant) and blocks Save with a specific message when it doesn't
 * match, same disabled-with-a-visible-reason shape 8.7 already applies
 * to the empty/unchanged case.
 *
 * Username has no existing UI or availability-check RPC anywhere in this
 * repo (confirmed via repo-wide grep) -- this is new. Per 8.7's Disabled/
 * gated rule and category-form-dialog.tsx's own precedent (3.4: DB unique
 * constraint is the source of truth for a name collision, surfaced via
 * error.message on save, not a live pre-submit availability check), the
 * profiles_username_unique partial index (migration 0030) is what
 * ultimately decides a collision -- Save is disabled only for an empty or
 * unchanged value, and a collision surfaces inline once Postgres reports
 * it, same plain error.message convention this repo already uses.
 *
 * 8.6: Change Password, its own card, confirmed separately before
 * building since it touches auth logic (architecture-notes.md's never-
 * touch-without-approval list covers auth-context.tsx/auth-types.ts
 * specifically, not every auth-adjacent UI -- this section calls
 * supabase.auth.signInWithPassword/updateUser directly from this page,
 * touching neither file). Confirmed: its own card, not folded into
 * Account Settings above -- per the Card Fragmentation rule, username/
 * first/last name/contact number are one "who I am" concept that already
 * share one save pattern (a plain profiles column write), whereas a
 * password change is a distinct "account security" concept with its own
 * confirmation step and a completely different write path (Supabase
 * Auth, not a profiles column), so it gets its own state, its own action,
 * its own card, matching this same file's own Personalization/Account
 * Settings card split above (8.10 note): same concept together, distinct
 * concepts apart. Confirmed: requires the current password, re-verified
 * by silently calling signInWithPassword with the typed current password
 * (fails visibly if wrong, same "Incorrect email or password." shared
 * line login.tsx already uses so a wrong current password reveals
 * nothing extra) before calling updateUser with the new one -- a second,
 * separate auth call rather than trusting the already-active session, so
 * a password change still demands proof of the current one even though
 * the user is already signed in. New password reuses signup.tsx's exact
 * MIN_PASSWORD_LENGTH=8 and PasswordInput, and its own confirm-field
 * mismatch treatment, so "how long" and "how it's typed" read identically
 * everywhere a password is ever set in this app. All three fields clear
 * on success (nothing to re-show once the change is done); a specific
 * success line confirms it, since this card's Save button doesn't change
 * label to show completion the way AccountField's inline "Saving..." /
 * revert-on-error does.
 *
 * 8.9 (guest check) is already satisfied by this page's existing
 * !session branch below, which this section sits behind unchanged.
 */
type AccountFieldKey = "username" | "first_name" | "last_name" | "contact_number";

interface AccountFieldState {
  value: string;
  saving: boolean;
  error: string | null;
}

const EMPTY_ACCOUNT_FIELD_STATE: AccountFieldState = { value: "", saving: false, error: null };

export function SettingsSections({
  section,
  compact = false,
}: Readonly<{ section: SettingsSection; compact?: boolean }>) {
  const { session, profile, refreshProfile } = useAuth();
  // Admin shell uses text-sm, public shell text-base; nothing else differs.
  const body = compact ? "text-sm" : "text-base";

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

  // 8.3/8.4/8.5: one AccountFieldState per column, each independently
  // seeded/saved/errored -- same re-seed-on-profile-change shape as the
  // dark mode / font size state above, so an external change (another
  // tab, refreshProfile elsewhere) still keeps this page in sync.
  const [username, setUsername] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);
  const [firstName, setFirstName] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);
  const [lastName, setLastName] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);
  const [contactNumber, setContactNumber] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setUsername((prev) => ({ ...prev, value: profile.username ?? "" }));
    setFirstName((prev) => ({ ...prev, value: profile.first_name ?? "" }));
    setLastName((prev) => ({ ...prev, value: profile.last_name ?? "" }));
    setContactNumber((prev) => ({ ...prev, value: profile.contact_number ?? "" }));
  }, [profile]);

  // 3.3/3.4/4.3/4.4/8.4/8.5/8.7: handlers are declared at module scope
  // rather than nested in this component -- same behavior, same
  // optimistic-then-persist shape each already had, just pulled out so
  // this component's own branching stays flat instead of nesting inside
  // five separate closures (SonarCloud's Cognitive Complexity rule
  // counts nested function bodies against the enclosing function).
  // Step 8 cleanup: handleDarkModeChange/handleFontSizeChange now live in
  // preferences.ts (shared with admin-settings.tsx, see that file's own
  // comment); saveAccountField below stays local, this page's Account
  // Settings section has no admin-side counterpart to share it with.
  // Contact Number: same digits-only, 15-char cap as profile.tsx's own
  // updateContactNumber, so the field behaves identically in both places
  // it appears in the app.
  function updateContactNumberValue(raw: string) {
    setContactNumber((prev) => ({ ...prev, value: raw.replace(/\D/g, "").slice(0, 15) }));
  }

  // 8.6: current/new/confirm, all local to this card -- none of these
  // are profile fields, so they get no AccountFieldState/profiles seed
  // effect, unlike the four fields above.
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const newPasswordLongEnough = newPassword.length >= MIN_PASSWORD_LENGTH;
  const newPasswordsMatch = newPassword.length > 0 && newPassword === confirmNewPassword;
  const canSavePassword =
    !passwordSaving &&
    currentPassword.length > 0 &&
    newPasswordLongEnough &&
    newPasswordsMatch;

  // 8.7: same "disabled with a visible reason" shape AccountField's title
  // attr already gives username/first/last/contact number below -- this
  // card gets its own version since the gating conditions are different
  // (three fields, not one). Priority mirrors the inline messages already
  // shown per-field above each: the most specific, already-visible reason
  // wins over a generic "fill in the fields" catch-all, and nothing shows
  // once the field-level messages (newPassword's length line, confirm's
  // mismatch line) already cover it, so the reason is never said twice.
  const passwordBlockedReason = getPasswordBlockedReason({
    currentPassword,
    newPassword,
    confirmNewPassword,
    newPasswordLongEnough,
    newPasswordsMatch,
  });

  // 8.6: handleChangePassword itself now lives at module scope (see
  // below this component) for the same Cognitive Complexity reason as
  // the other handlers above -- behavior unchanged, still re-verifies
  // the typed current password before updating to the new one.
  async function onChangePassword() {
    if (!session?.user.email || !canSavePassword) return;
    await handleChangePassword({
      email: session.user.email,
      currentPassword,
      newPassword,
      setPasswordSaving,
      setPasswordError,
      setPasswordSuccess,
      setCurrentPassword,
      setNewPassword,
      setConfirmNewPassword,
    });
  }

  // The modal is only openable by a signed-in user (the menus that open it
  // are signed-in only, and the /profile/settings redirect sends a guest to
  // sign in instead), so there is no guest branch here.
  if (!session) return null;

  // A Google-only account (signed in with Google, never set a password) has
  // no current password to re-verify, so Change Password could only ever
  // fail with "Incorrect email or password." Supabase lists every login
  // method on app_metadata.providers. Hide the form only when that list is
  // present and has no "email" in it, so an account where the list is
  // missing for any reason keeps the form it always had. An email account
  // that later also signed in with Google has both and keeps the form too.
  const providers: unknown = session.user.app_metadata?.providers;
  const hasPasswordLogin = !Array.isArray(providers) || providers.includes("email");

  return (
    <div className="flex flex-col">
      {section === "general" && (
        <>
          <SectionHeading>Appearance</SectionHeading>

          {/* 3.1: no Switch primitive exists in src/components/ui, so
              DarkModeSwitch below is a small role="switch" button animated
              with motion (already a dependency, used by the carousels). */}
          <SettingsRow
            label="Dark mode"
            htmlFor="dark_mode"
            description="Use a dark color scheme."
            body={body}
            error={themeError}
          >
            <DarkModeSwitch
              id="dark_mode"
              checked={darkMode}
              disabled={themeSaving}
              onToggle={(origin) =>
                withThemeTransition(origin, () => {
                  void handleDarkModeChange(!darkMode, {
                    session,
                    themeSaving,
                    darkMode,
                    setDarkMode,
                    setThemeError,
                    setThemeSaving,
                    refreshProfile,
                  });
                })
              }
            />
          </SettingsRow>

          <SettingsRow label="Font size" htmlFor="font_size" body={body} error={fontSizeError}>
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
              <SelectTrigger id="font_size" className="w-40">
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
          </SettingsRow>

          {/* Public shell only: the admin shell shares this component
              (compact), and its staff have no recommendation rows. */}
          {!compact && <HiddenItemsBlock userId={session.user.id} body={body} />}
        </>
      )}

      {section === "account" && (
        <>
          <SectionHeading>Account</SectionHeading>

          <AccountField
            body={body}
            id="username"
            label="Username"
            state={username}
            onValueChange={(v) => setUsername((prev) => ({ ...prev, value: v }))}
            onSave={(v) => saveAccountField("username", setUsername, v, session, refreshProfile)}
            originalValue={profile?.username ?? ""}
            maxLength={30}
          />

          <AccountField
            body={body}
            id="first_name"
            label="First Name"
            state={firstName}
            onValueChange={(v) => setFirstName((prev) => ({ ...prev, value: v }))}
            onSave={(v) => saveAccountField("first_name", setFirstName, v, session, refreshProfile)}
            originalValue={profile?.first_name ?? ""}
            maxLength={75}
          />

          <AccountField
            body={body}
            id="last_name"
            label="Last Name"
            state={lastName}
            onValueChange={(v) => setLastName((prev) => ({ ...prev, value: v }))}
            onSave={(v) => saveAccountField("last_name", setLastName, v, session, refreshProfile)}
            originalValue={profile?.last_name ?? ""}
            maxLength={75}
          />

          {/* 8.5: same digits-only/15-char-cap treatment as profile.tsx's
              own Contact Number field, via updateContactNumberValue above.
              `validate` adds the specific inline format error. */}
          <AccountField
            body={body}
            id="contact_number"
            label="Contact Number"
            state={contactNumber}
            onValueChange={updateContactNumberValue}
            onSave={(v) => saveAccountField("contact_number", setContactNumber, v, session, refreshProfile)}
            originalValue={profile?.contact_number ?? ""}
            maxLength={15}
            type="tel"
            inputMode="numeric"
            validate={validateContactNumber}
          />

          {/* Residents only. Staff and admin accounts are managed from Admin,
              Staff, and delete_my_account() (migration 0049) refuses them
              too, so this is not the only guard. */}
          {!profile?.staff_role && (
            <>
              <SettingsRow
                label="Delete account"
                htmlFor="delete_account"
                description="Permanently removes your account and its data."
                body={body}
              >
                <Button id="delete_account" type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              </SettingsRow>
              <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
            </>
          )}
        </>
      )}

      {section === "password" && !hasPasswordLogin && (
        <>
          <SectionHeading>Change Password</SectionHeading>
          <p className={cn(body, "text-muted-foreground")}>
            You sign in with Google, so this account has no password to change. Manage your password and
            sign-in security from your Google Account.
          </p>
        </>
      )}

      {section === "password" && hasPasswordLogin && (
        <>
          <SectionHeading>Change Password</SectionHeading>

          <SettingsRow label="Current password" htmlFor="current_password" body={body} stacked>
            <PasswordInput
              id="current_password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setPasswordSuccess(false);
              }}
              maxLength={72}
              disabled={passwordSaving}
            />
          </SettingsRow>

          <SettingsRow
            label="New password"
            htmlFor="new_password"
            body={body}
            stacked
            error={
              newPassword.length > 0 && !newPasswordLongEnough
                ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
                : null
            }
          >
            <PasswordInput
              id="new_password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordSuccess(false);
              }}
              maxLength={72}
              disabled={passwordSaving}
            />
          </SettingsRow>

          <SettingsRow
            label="Confirm new password"
            htmlFor="confirm_new_password"
            body={body}
            stacked
            error={confirmNewPassword.length > 0 && !newPasswordsMatch ? "Passwords do not match." : null}
          >
            <PasswordInput
              id="confirm_new_password"
              value={confirmNewPassword}
              onChange={(e) => {
                setConfirmNewPassword(e.target.value);
                setPasswordSuccess(false);
              }}
              maxLength={72}
              disabled={passwordSaving}
            />
          </SettingsRow>

          <div className="flex flex-col gap-2 pt-4">
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={!canSavePassword}
                title={passwordBlockedReason ?? undefined}
                onClick={onChangePassword}
              >
                {passwordSaving ? "Updating..." : "Update password"}
              </Button>
            </div>

            {/* 8.8: this section's own status line, separate from the
                per-field format messages above -- Update password is one
                combined action over three fields, not three saves. */}
            {passwordBlockedReason && <p className={cn(body, "text-destructive")}>{passwordBlockedReason}</p>}
            {passwordError && <p className={cn(body, "text-destructive")}>{passwordError}</p>}
            {passwordSuccess && <p className={cn(body, "text-muted-foreground")}>Password updated.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// Dark mode switch: a role="switch" button (keyboard, label association and
// aria-checked all work like the checkbox it replaces). The knob slides on a
// spring and morphs between a sun and a moon; the icon spins and scales out
// as the next one spins in. With reduced motion the knob jumps and the icon
// swaps with no spin. The page-wide circular reveal comes from
// lib/theme-transition.ts, started from the click position of this button.
function DarkModeSwitch({
  id,
  checked,
  disabled,
  onToggle,
}: Readonly<{
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (origin: { x: number; y: number }) => void;
}>) {
  const reduceMotion = useReducedMotion();
  const Icon = checked ? Moon : Sun;

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        // Centre of the switch: where the page-wide theme reveal grows from.
        const rect = e.currentTarget.getBoundingClientRect();
        onToggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <motion.span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        whileTap={reduceMotion || disabled ? undefined : { scale: 0.88 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 28 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={checked ? "moon" : "sun"}
            className="flex"
            initial={reduceMotion ? false : { rotate: checked ? -90 : 90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={reduceMotion ? undefined : { rotate: checked ? 90 : -90, scale: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <Icon weight="fill" className="h-3.5 w-3.5" aria-hidden="true" />
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </button>
  );
}

// Hidden items (recommendation-plan.md, Not interested): the items this person
// chose Not interested on in the For you and Similar rows, each with an Unhide
// button. Names come from ordinary queries, and an item the person can no
// longer see is skipped (fetchHidden). Unhiding only puts the item back in
// those rows, it changes nothing else.
function HiddenItemsBlock({ userId, body }: Readonly<{ userId: string; body: string }>) {
  const [items, setItems] = useState<HiddenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHidden(userId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load hidden items.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function onUnhide(item: HiddenItem) {
    setBusyKey(itemKey(item));
    setError(null);
    try {
      await unhideItem(userId, item.kind, item.id);
      setItems((prev) => prev?.filter((i) => itemKey(i) !== itemKey(item)) ?? prev);
    } catch {
      setError("Couldn't unhide this. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  let content: ReactNode;
  if (items === null) {
    content = error ? <p className={cn(body, "text-destructive")}>{error}</p> : <Skeleton className="h-10 w-full" />;
  } else if (items.length === 0) {
    content = <p className={cn(body, "text-muted-foreground")}>No hidden items</p>;
  } else {
    content = (
      <>
        {items.map((item) => (
          <SettingsRow
            key={itemKey(item)}
            label={item.name}
            htmlFor={`unhide_${itemKey(item)}`}
            description={item.kind === "place" ? "Place" : "Business"}
            body={body}
          >
            <Button
              id={`unhide_${itemKey(item)}`}
              type="button"
              variant="outline"
              size="sm"
              disabled={busyKey === itemKey(item)}
              onClick={() => void onUnhide(item)}
            >
              Unhide
            </Button>
          </SettingsRow>
        ))}
        {error && <p className={cn(body, "pt-2 text-destructive")}>{error}</p>}
      </>
    );
  }

  return (
    <div className="flex flex-col pt-6">
      <SectionHeading>Hidden items</SectionHeading>
      <p className="pb-2 text-sm text-muted-foreground">
        Left out of the For you and Similar rows. Search and Discover still show them.
      </p>
      {content}
    </div>
  );
}

function SectionHeading({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="pb-2 text-base font-semibold text-foreground">{children}</h2>;
}

// One settings row: label (and optional description) on the left, control
// on the right, a divider between rows. `stacked` puts a full-width control
// under its label instead, for text inputs that need the room.
function SettingsRow({
  label,
  htmlFor,
  description,
  body,
  error,
  stacked = false,
  children,
}: Readonly<{
  label: string;
  htmlFor: string;
  description?: string;
  body: string;
  error?: string | null;
  stacked?: boolean;
  children: ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className={cn("flex gap-4", stacked ? "flex-col" : "items-center justify-between")}>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={htmlFor} className={body}>
            {label}
          </Label>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
      {error && <p className={cn(body, "text-destructive")}>{error}</p>}
    </div>
  );
}

// 8.4/8.5/8.7: one Save action per field, not a shared submit, so one
// field's error never blocks another's already-valid write -- same
// independence Phase 3/4's two preference controls already have from
// each other. Contact Number reuses profile.tsx's exact digits-only/
// 15-char-cap updateContactNumber treatment; Username/First/Last Name
// trim to null-when-empty, same "unset means unset" convention 0021/0030
// already establish for every nullable profiles column. Username
// collisions surface via error.message from the profiles_username_unique
// partial index (migration 0030), same DB-is-source-of-truth convention
// category-form-dialog.tsx's own 3.4 already uses for category names.
// Same module-scope reasoning as the handlers above.
async function saveAccountField(
  field: AccountFieldKey,
  setState: Dispatch<SetStateAction<AccountFieldState>>,
  rawValue: string,
  session: Session | null,
  refreshProfile: () => Promise<void>
) {
  if (!session) return;

  const value = rawValue.trim() || null;
  setState((prev) => ({ ...prev, saving: true, error: null }));

  const { error } = await supabase
    .from("profiles")
    .update({ [field]: value })
    .eq("id", session.user.id);

  if (error) {
    setState((prev) => ({ ...prev, saving: false, error: error.message }));
    return;
  }

  setState((prev) => ({ ...prev, saving: false, error: null }));
  await refreshProfile();
}

// 8.6: re-verify the typed current password by silently signing in with
// it (fails visibly if wrong, same shared "Incorrect email or password."
// line login.tsx already uses -- this never confirms or denies the email
// itself, since the email is this user's own and already known), then
// update to the new password. A second explicit auth call, not a trust
// of the already-active session, since a password change is the one
// place this app asks a signed-in user to re-prove who they are. Same
// module-scope reasoning as the handlers above.
async function handleChangePassword(ctx: {
  email: string;
  currentPassword: string;
  newPassword: string;
  setPasswordSaving: Dispatch<SetStateAction<boolean>>;
  setPasswordError: Dispatch<SetStateAction<string | null>>;
  setPasswordSuccess: Dispatch<SetStateAction<boolean>>;
  setCurrentPassword: Dispatch<SetStateAction<string>>;
  setNewPassword: Dispatch<SetStateAction<string>>;
  setConfirmNewPassword: Dispatch<SetStateAction<string>>;
}) {
  const {
    email,
    currentPassword,
    newPassword,
    setPasswordSaving,
    setPasswordError,
    setPasswordSuccess,
    setCurrentPassword,
    setNewPassword,
    setConfirmNewPassword,
  } = ctx;

  setPasswordSaving(true);
  setPasswordError(null);
  setPasswordSuccess(false);

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (reauthError) {
    setPasswordSaving(false);
    setPasswordError("Incorrect email or password.");
    return;
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

  setPasswordSaving(false);

  if (updateError) {
    setPasswordError(updateError.message);
    return;
  }

  setCurrentPassword("");
  setNewPassword("");
  setConfirmNewPassword("");
  setPasswordSuccess(true);
}

// 8.3/8.4/8.5/8.7/8.8: one field row shared by all four Account Settings
// fields rather than four near-identical blocks copy-pasted -- same
// per-field Save/disabled-gated/error shape for each, per constraints.md's
// Inventory Before Suggesting rule applied within this file. 8.7: Save is
// disabled with a visible reason (title attr, same native-title approach
// admin-event-detail.tsx's own gated Publish button gives no separate
// visible line for -- here a specific reason line is shown instead,
// matching 8.8's "specific message per field" requirement) whenever the
// value is empty or unchanged from what is already saved, or while a save
// is in flight. 8.8: default/editing/saving/error states, each field's
// own message, not a shared status line for the whole section.
//
// 8.5: optional `validate` prop, used only by Contact Number below --
// digitsOnly stripping already existed (updateContactNumberValue) but
// nothing checked the *shape* of the result, so a 3-digit or 20-digit
// string saved silently with no feedback. This is the one gap 8.5 asks
// for specifically ("a specific inline error for an invalid format
// rather than a generic failure message"), everything else in this file
// already existed before this change. Kept as a prop rather than a
// field-specific fork of AccountField, so Username/First/Last Name (no
// format to validate) are unaffected and the one shared component still
// covers all four fields, per the Inventory Before Suggesting rule.
interface AccountFieldProps {
  body: string;
  id: string;
  label: string;
  state: AccountFieldState;
  originalValue: string;
  onValueChange: (value: string) => void;
  onSave: (value: string) => void;
  maxLength: number;
  type?: string;
  inputMode?: "numeric" | "text";
  validate?: (trimmedValue: string) => string | null;
}

function AccountField({
  body,
  id,
  label,
  state,
  originalValue,
  onValueChange,
  onSave,
  maxLength,
  type = "text",
  inputMode,
  validate,
}: Readonly<AccountFieldProps>) {
  const trimmed = state.value.trim();
  const unchanged = trimmed === originalValue.trim();
  const isEmpty = trimmed.length === 0;

  // 8.7: a visible reason only when there is one worth showing -- an
  // empty field the user has actually typed into and cleared gets a
  // specific message, same as admin-event-detail.tsx's own
  // missingRequiredFields line. A field that has simply never been set
  // (originalValue already blank, untouched) shows no reason on first
  // render -- same "don't greet the page with an error" posture
  // signup.tsx's own password-mismatch line only shows once there's a
  // value to react to. "unchanged" alone disables Save with no error
  // line either, since nothing being different from what's already saved
  // isn't a mistake.
  //
  // 8.5: format check only runs once the field is non-empty and changed,
  // same "don't greet the page with an error" posture as the empty-field
  // check above -- an untouched, already-saved value is never re-flagged
  // as invalid on render. Format error takes precedence over "Enter a
  // ___." since a non-empty value that fails validation isn't empty.
  const formatError = !isEmpty && !unchanged ? (validate?.(trimmed) ?? null) : null;
  const blockedReason = formatError ?? (isEmpty && !unchanged ? `Enter a ${label.toLowerCase()}.` : null);
  const canSave = !state.saving && !unchanged && !isEmpty && !formatError;

  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label htmlFor={id} className={cn("sm:w-36 sm:shrink-0", body)}>
          {label}
        </Label>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            id={id}
            type={type}
            inputMode={inputMode}
            value={state.value}
            onChange={(e) => onValueChange(e.target.value)}
            maxLength={maxLength}
            disabled={state.saving}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!canSave}
            title={blockedReason ?? undefined}
            onClick={() => onSave(state.value)}
          >
            {state.saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      {blockedReason && <p className={cn(body, "text-destructive sm:pl-40")}>{blockedReason}</p>}
      {state.error && <p className={cn(body, "text-destructive sm:pl-40")}>{state.error}</p>}
    </div>
  );
}

// 8.5: PH mobile numbers are 11 digits starting with 09 (09XXXXXXXXX),
// the same shape already documented in profile.tsx's and staff-form-
// dialog.tsx's own updateContactNumber comments. updateContactNumberValue
// already strips to digits-only/15-char-cap before this ever runs, so
// this only judges the shape of what's left, not raw characters. A
// leading +63 country code (63XXXXXXXXXX, 12 digits) is also accepted,
// same digits-only allowance those comments already call out.
const PH_MOBILE_PATTERN = /^(09\d{9}|639\d{9})$/;

function validateContactNumber(trimmedValue: string): string | null {
  return PH_MOBILE_PATTERN.test(trimmedValue)
    ? null
    : "Enter an 11-digit mobile number starting with 09 (e.g. 09171234567).";
}

// 8.7: extracted out of the nested ternary that used to sit inline in
// SettingsPage -- same priority order as before (most specific,
// already-visible reason wins over a generic one; nothing shows once a
// field-level message already covers it), just as early returns instead
// of four stacked ternaries, so each branch is its own visible line
// rather than one expression that was easy to misread as always
// resolving to the same fallback.
function getPasswordBlockedReason(fields: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  newPasswordLongEnough: boolean;
  newPasswordsMatch: boolean;
}): string | null {
  const { currentPassword, newPassword, confirmNewPassword, newPasswordLongEnough, newPasswordsMatch } = fields;

  if (currentPassword.length === 0) return "Enter your current password.";
  if (newPassword.length === 0) return "Enter a new password.";
  if (!newPasswordLongEnough) return null; // already shown inline below the New password field
  if (confirmNewPassword.length === 0) return "Confirm your new password.";
  if (!newPasswordsMatch) return null; // already shown inline below the Confirm field
  return null;
}
