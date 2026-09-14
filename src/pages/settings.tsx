import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { applyTheme, applyFontSize, type FontSizePreference } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * 8.6 (password change, routed through Supabase Auth) and 8.9 (guest
 * check) are separately scoped: 8.6 touches auth logic, on the never-
 * touch-without-approval list, so it is intentionally not built here.
 * 8.9 is already satisfied by this page's existing !session branch below,
 * which this section sits behind unchanged.
 */
type AccountFieldKey = "username" | "first_name" | "last_name" | "contact_number";

interface AccountFieldState {
  value: string;
  saving: boolean;
  error: string | null;
}

const EMPTY_ACCOUNT_FIELD_STATE: AccountFieldState = { value: "", saving: false, error: null };

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

  // 8.3/8.4/8.5: one AccountFieldState per column, each independently
  // seeded/saved/errored -- same re-seed-on-profile-change shape as the
  // dark mode / font size state above, so an external change (another
  // tab, refreshProfile elsewhere) still keeps this page in sync.
  const [username, setUsername] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);
  const [firstName, setFirstName] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);
  const [lastName, setLastName] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);
  const [contactNumber, setContactNumber] = useState<AccountFieldState>(EMPTY_ACCOUNT_FIELD_STATE);

  useEffect(() => {
    if (!profile) return;
    setUsername((prev) => ({ ...prev, value: profile.username ?? "" }));
    setFirstName((prev) => ({ ...prev, value: profile.first_name ?? "" }));
    setLastName((prev) => ({ ...prev, value: profile.last_name ?? "" }));
    setContactNumber((prev) => ({ ...prev, value: profile.contact_number ?? "" }));
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
  async function saveAccountField(
    field: AccountFieldKey,
    setState: Dispatch<SetStateAction<AccountFieldState>>,
    rawValue: string
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

  // Contact Number: same digits-only, 15-char cap as profile.tsx's own
  // updateContactNumber, so the field behaves identically in both places
  // it appears in the app.
  function updateContactNumberValue(raw: string) {
    setContactNumber((prev) => ({ ...prev, value: raw.replace(/\D/g, "").slice(0, 15) }));
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

      {/* 8.10: wrapped in the same `rounded-lg border border-border
          bg-card p-4` utility-class pattern as the Account Settings card
          below, so the page reads as one consistent settings surface
          instead of one bare section and one boxed section. No content
          or behavior change from Steps 3/4 below, card chrome only. */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Personalization</h2>

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

      {/* 8.3: Account Settings, one card -- username, first name, last
          name, and contact number are one logical account-identity
          concept per the Card Fragmentation rule, not four separate
          cards. Same card shape as Personalization above (8.10), same
          heading pattern. */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Account Settings</h2>

        <AccountField
          id="username"
          label="Username"
          state={username}
          onValueChange={(v) => setUsername((prev) => ({ ...prev, value: v }))}
          onSave={(v) => saveAccountField("username", setUsername, v)}
          originalValue={profile?.username ?? ""}
          maxLength={30}
        />

        <AccountField
          id="first_name"
          label="First Name"
          state={firstName}
          onValueChange={(v) => setFirstName((prev) => ({ ...prev, value: v }))}
          onSave={(v) => saveAccountField("first_name", setFirstName, v)}
          originalValue={profile?.first_name ?? ""}
          maxLength={75}
        />

        <AccountField
          id="last_name"
          label="Last Name"
          state={lastName}
          onValueChange={(v) => setLastName((prev) => ({ ...prev, value: v }))}
          onSave={(v) => saveAccountField("last_name", setLastName, v)}
          originalValue={profile?.last_name ?? ""}
          maxLength={75}
        />

        {/* 8.5: same digits-only/15-char-cap treatment as profile.tsx's
            own Contact Number field, via updateContactNumberValue above,
            not the generic onValueChange the other three fields use.
            `validate` adds the format check 8.5 specifically asks for --
            a specific inline error for an invalid format, not a generic
            failure message. Username/First/Last Name pass no `validate`,
            since neither has a defined format to check, only presence. */}
        <AccountField
          id="contact_number"
          label="Contact Number"
          state={contactNumber}
          onValueChange={updateContactNumberValue}
          onSave={(v) => saveAccountField("contact_number", setContactNumber, v)}
          originalValue={profile?.contact_number ?? ""}
          maxLength={15}
          type="tel"
          inputMode="numeric"
          validate={validateContactNumber}
        />
      </div>
    </div>
  );
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
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
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
          size="sm"
          variant="secondary"
          disabled={!canSave}
          title={blockedReason ?? undefined}
          onClick={() => onSave(state.value)}
        >
          {state.saving ? "Saving..." : "Save"}
        </Button>
      </div>
      {blockedReason && <p className="text-base text-destructive">{blockedReason}</p>}
      {state.error && <p className="text-base text-destructive">{state.error}</p>}
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
