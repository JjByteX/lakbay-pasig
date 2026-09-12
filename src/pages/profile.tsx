import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getVendorBusiness, type VendorBusiness } from "@/lib/vendor-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Phase 4.1: same category set data-model.md and admin-place-detail.tsx's
// own CATEGORIES constant use for Local Historical Place. Reused as-is,
// not redefined, per constraints.md's Inventory Before Suggesting rule --
// this is the one existing enumeration of the concept in the codebase.
const CATEGORIES = ["Heritage Site", "Museum", "Monument", "Church", "Cultural Site"] as const;

// Phase 4.1: same language set admin-place-detail.tsx, admin-business-
// detail.tsx, and admin-event-detail.tsx's own LANGUAGES constants already
// use. End User's Preferred Language (data-model.md) is the same concept,
// not a new one.
const LANGUAGES = ["English", "Filipino", "Both"] as const;

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
  const { session, profile, loading, signOut, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [vendorBusiness, setVendorBusiness] = useState<VendorBusiness | null>(null);
  const [vendorError, setVendorError] = useState<string | null>(null);

  // 4.1: seed the editable fields from context whenever profile loads or
  // changes (including after 4.3's own refreshProfile call), not just once
  // on mount.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setContactNumber(profile.contact_number ?? "");
    setDateOfBirth(profile.date_of_birth ?? "");
    setPreferredLanguage(profile.preferred_language ?? "");
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
      });
  }, [session]);

  if (loading) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground">Profile</h1>
        <p className="text-base text-muted-foreground">
          Sign in to view and edit your account.
        </p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  function toggleCategory(category: string) {
    setPreferredCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

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
      contact_number: contactNumber.trim() || null,
      date_of_birth: dateOfBirth || null,
      preferred_language: preferredLanguage || null,
      preferred_categories: preferredCategories.length > 0 ? preferredCategories : null,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", session.user.id);

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    // 4.3: preferred_language and preferred_categories feed Home and
    // Discover live (navigation-and-access-control.md), so context has to
    // reflect the write immediately, not on next session load. Phase 0.8's
    // refreshProfile does this without a page reload.
    await refreshProfile();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <h1 className="text-xl font-semibold text-foreground">Profile</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">Display Name</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={session.user.email ?? ""} readOnly disabled />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="contact_number">Contact Number</Label>
          <Input
            id="contact_number"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="date_of_birth">Date of Birth</Label>
          <Input
            id="date_of_birth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="preferred_language">Preferred Language</Label>
          <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
            <SelectTrigger id="preferred_language">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        {saveError && <p className="text-base text-destructive">{saveError}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </form>

      {/* 4.5: no row found renders nothing here, not a greyed out section,
          per the plan's own instruction. vendorError is a genuine query
          failure, distinct from "not a vendor." */}
      {vendorError && <p className="text-base text-destructive">{vendorError}</p>}
      {vendorBusiness && (
        // Phase 6.5 fix: businesses.name (migration 0004) has no length
        // cap, same unbounded-text risk completed-trail-row.tsx's
        // credential badge already had before its own max-w-full
        // break-words fix. Store icon gets shrink-0 so a long name
        // can't compress it, and the name itself wraps inside a min-w-0
        // span instead of overflowing the row's fixed-width border/
        // padding at a 320px viewport.
        <Link
          to="/vendor"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-base font-semibold text-foreground hover:bg-muted"
        >
          <Store className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">Managing {vendorBusiness.name}</span>
        </Link>
      )}

      {/* 4.6: sign out lives here now, same signOut function home.tsx
          currently calls (removed from that page in Phase 5). */}
      <Button variant="secondary" onClick={signOut} className="w-fit">
        Sign out
      </Button>
    </div>
  );
}
