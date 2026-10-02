import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Storefront } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { supabase } from "@/lib/supabase";
import { getVendorBusiness, type VendorBusiness } from "@/lib/vendor-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { AvatarUpload } from "@/components/avatar-upload";
import { CharCount } from "@/components/business/business-fields";
import { PageContainer } from "@/components/public/page-container";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageTitle } from "@/lib/page-title";

// Phase 4.1: same category set data-model.md and admin-place-detail.tsx's
// own CATEGORIES constant use for Local Historical Place. Reused as-is,
// not redefined, per constraints.md's Inventory Before Suggesting rule --
// this is the one existing enumeration of the concept in the codebase.
const CATEGORIES = ["Heritage Site", "Museum", "Monument", "Church", "Cultural Site"] as const;

// Shared with saved.tsx and trails.tsx's own page-local copies (same
// PostgrestError shape check, not an Error subclass). Kept as a local copy
// rather than a new shared module, matching those files' own choice not to
// import each other's version, per constraints.md's Inventory Before
// Suggesting rule -- no existing shared helper for this exists yet, only
// page-local copies.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

// admin-form-fields-plan.md #2: every maxLength needs a visible counter
// nearby so the cap isn't a silent wall. Step 8 cleanup: this was a
// page-local CharCount, byte-identical to business-fields.tsx's own and
// four admin detail pages' own copies -- now imported from business-
// fields.tsx, the one place it's kept. Unlike errorMessageFrom above,
// CharCount has zero page-specific variation across any of its six
// former copies, so it doesn't share that helper's stay-local reasoning.

/**
 * Step 8, Phase 4: Profile page, loaded state. Guest-locked branch (Phase
 * 2.2) is unchanged above this.
 *
 * 4.1: fields read from useAuth()'s `profile` on page open, not a fresh
 * fetch -- AuthContext already holds them (auth-context.tsx's fetchProfile)
 * and nothing outside this page's own save (4.3) can change them
 * mid-session. Email comes from `session.user.email`, read only, since
 * profiles has no email column (migrations 0001/0002), Supabase Auth owns
 * it.
 *
 * 4.2: editable inline on the same screen, no separate edit mode or route,
 * per the plan's resolved open question #1 and ux-ui-guidelines.md's modal
 * vs panel rule -- this page's core purpose is account info, not a focused
 * sub-task pulled into its own view.
 */
export default function ProfilePage() {
  usePageTitle("Profile");
  const { session, profile, loading, refreshProfile } = useAuth();
  const { openAuth } = useAuthModal();
  // Two states, same split vendor-dashboard.tsx uses: mobile keeps the single
  // stacked column, desktop gets a two-column form card.
  const isMobile = useIsMobile();

  const [displayName, setDisplayName] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [vendorBusiness, setVendorBusiness] = useState<VendorBusiness | null>(null);
  const [vendorError, setVendorError] = useState<string | null>(null);
  // Step 9, Phase 2.2: distinct from vendorBusiness === null (confirmed no
  // business). Without this, "List your business" would flash for an
  // actual vendor too, for the moment between mount and the fetch below
  // resolving, since vendorBusiness starts at null either way.
  const [vendorChecked, setVendorChecked] = useState(false);

  // 4.1: seed the editable fields from context whenever profile loads or
  // changes (including after 4.3's own refreshProfile call), not just once
  // on mount.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setProfilePicture(profile.profile_picture ?? null);
    setDateOfBirth(profile.date_of_birth ?? "");
    setPreferredCategories(profile.preferred_categories ?? []);
  }, [profile]);

  // 4.5: vendor entry point. No row found is a valid, common outcome (most
  // accounts aren't vendors), not surfaced as an error -- only a real query
  // failure sets vendorError.
  useEffect(() => {
    if (!session) return;
    getVendorBusiness(session.user.id)
      .then(setVendorBusiness)
      .catch((err: unknown) => {
        setVendorError(errorMessageFrom(err, "Could not check vendor status."));
      })
      .finally(() => setVendorChecked(true));
  }, [session]);

  if (loading) return null;

  if (!session) {
    return (
      <PageContainer width="form" className="items-start gap-4 py-10">
        <h1 className="text-xl font-semibold text-foreground">Profile</h1>
        <p className="text-base text-muted-foreground">
          Sign in to view and edit your account.
        </p>
        <Button onClick={() => openAuth("login")}>Sign in</Button>
      </PageContainer>
    );
  }

  function toggleCategory(category: string) {
    setPreferredCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  // Contact Number is no longer edited here: it lives only in Settings >
  // Account (one label, one place), and is deliberately absent from this
  // payload so a save here can never overwrite it with a stale copy.
  //
  // 4.4: explicit allow list, not the form state spread wholesale. RLS
  // (profiles_update_own, migration 0001) guards the row, not columns --
  // role, staff_role, active_status, position, and system_permission must
  // never appear in this payload, the app layer is what has to block them,
  // same trust boundary migration 0002's own comment documents.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || saving) return;

    setSaving(true);
    setSaveError(null);

    const payload = {
      display_name: displayName.trim() || null,
      date_of_birth: dateOfBirth || null,
      preferred_categories: preferredCategories.length > 0 ? preferredCategories : null,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", session.user.id);

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    // 4.3: preferred_categories feeds Home and Discover live
    // (navigation-and-access-control.md), so context has to reflect the
    // write immediately, not on next session load. Phase 0.8's
    // refreshProfile does this without a page reload.
    await refreshProfile();
  }

  // Phase 6.4: profile_picture writes immediately on upload/remove, not
  // deferred to this page's own Save action -- same independence admin-
  // place-detail.tsx's photo upload/remove already has from that page's
  // Save button, since AvatarUpload already performs the storage write
  // itself (avatar-storage.ts's uploadAvatar/removeAvatarFile) before
  // calling this. A second, redundant profiles write on Save would risk
  // the two falling out of sync if one succeeds and the other doesn't.
  async function handleAvatarChange(url: string | null) {
    if (!session) return;
    setProfilePicture(url);
    const { error } = await supabase
      .from("profiles")
      .update({ profile_picture: url })
      .eq("id", session.user.id);
    if (error) {
      setSaveError(error.message);
      return;
    }
    await refreshProfile();
  }

  const avatarUpload = (
    <AvatarUpload
      ownerId={session.user.id}
      displayName={displayName}
      currentUrl={profilePicture}
      onChange={handleAvatarChange}
    />
  );

  const displayNameField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="display_name">Display Name</Label>
      <Input
        id="display_name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={150}
      />
      <CharCount value={displayName} max={150} />
    </div>
  );

  const emailField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" value={session.user.email ?? ""} readOnly disabled />
    </div>
  );

  const dateOfBirthField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="date_of_birth">Date of Birth</Label>
      <DateField id="date_of_birth" value={dateOfBirth} onChange={setDateOfBirth} />
    </div>
  );

  const categoriesField = (
    <div className="flex flex-col gap-2">
      <Label>Preferred Categories</Label>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => {
          const active = preferredCategories.includes(category);
          return (
            <Button
              key={category}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => toggleCategory(category)}
            >
              {category}
            </Button>
          );
        })}
      </div>
    </div>
  );

  const saveErrorText = saveError && <p className="text-base text-destructive">{saveError}</p>;

  // 4.5: no row found is a valid, common outcome, not surfaced as an
  // error -- only a real query failure sets vendorError. Step 9,
  // Phase 2.2: one entry point either way, never both at once
  // (vendorBusiness is exclusively one or the other), per ux-ui-
  // guidelines.md's "one label, one place" rule. businesses.name has no
  // length cap, so the icon is shrink-0 and the name wraps inside a
  // min-w-0 span instead of overflowing at a 320px viewport.
  const vendorEntry = (
    <>
      {vendorError && <p className="text-base text-destructive">{vendorError}</p>}
      {vendorBusiness && (
        <Link
          to="/vendor"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-base font-semibold text-foreground hover:bg-muted"
        >
          <Storefront className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">Managing {vendorBusiness.name}</span>
        </Link>
      )}
      {!vendorError && vendorChecked && vendorBusiness === null && (
        <Link
          to="/vendor"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-base font-semibold text-foreground hover:bg-muted"
        >
          <Storefront className="h-4 w-4 shrink-0" />
          <span>List your business</span>
        </Link>
      )}
    </>
  );

  // Mobile state: single stacked column. profile_picture saves immediately
  // on its own (handleAvatarChange), so the avatar sits outside the form.
  if (isMobile) {
    return (
      <PageContainer width="form">
        <h1 className="text-xl font-semibold text-foreground">Profile</h1>

        {avatarUpload}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
            {displayNameField}
            {emailField}
            {dateOfBirthField}
            {categoriesField}
            {saveErrorText}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </form>

        {vendorEntry}
      </PageContainer>
    );
  }

  // Desktop state: avatar in its own card, then a two-column form card
  // (identity on the left, date of birth and categories on the right) with
  // Save right-aligned under it.
  return (
    <PageContainer width="form">
      <h1 className="text-xl font-semibold text-foreground">Profile</h1>

      <div className="rounded-lg border border-border bg-card p-4">{avatarUpload}</div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              {displayNameField}
              {emailField}
            </div>
            <div className="flex flex-col gap-4">
              {dateOfBirthField}
              {categoriesField}
            </div>
          </div>
          {saveErrorText}
        </div>

        <Button type="submit" disabled={saving} className="self-end">
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </form>

      {vendorEntry}
    </PageContainer>
  );
}
