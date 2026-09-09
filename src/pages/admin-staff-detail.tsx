import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { countOtherActiveAdmins } from "@/lib/staff-lockout-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Phase 3.3 / 3.4 (step-4-phases.md): staff creation and edit form, same
// isNew-branch pattern as admin-place-detail.tsx and admin-event-detail.tsx
// (one component, one route for /admin/staff/new and /admin/staff/:id,
// per constraints.md's Inventory Before Suggesting rule against a second
// near-identical form component).
//
// Create calls the create-staff-account Edge Function (service role,
// 3.2) since a client insert cannot create an auth.users row or write
// staff fields onto another account (RLS blocks both, see
// architecture-notes.md's Known Fragile Areas and the function's own
// header comment). Edit is a direct profiles update — RLS's
// profiles_update_admin (0009, via is_admin()) already lets any Admin
// write any profile row, no service role needed there.
//
// No Tabs / review-history here unlike Places and Businesses: staff
// accounts have no review_action_log-equivalent table (admin-panel-spec.md's
// Review Action Log section only covers Places and Businesses), so a
// single form is the whole page, per ux-ui-guidelines.md's Card
// fragmentation rule against splitting one logical context for no reason.

const SYSTEM_PERMISSIONS = [
  { value: "manage_places", label: "Places" },
  { value: "review_businesses", label: "Businesses" },
  { value: "publish_events", label: "Events & Announcements" },
  { value: "build_trails", label: "Trails" },
] as const;

type SystemPermission = (typeof SYSTEM_PERMISSIONS)[number]["value"];
type StaffRoleValue = "staff" | "admin";
type ActiveStatusValue = "active" | "inactive";

interface StaffFormState {
  full_name: string;
  email: string;
  contact_number: string;
  password: string;
  position: string;
  staff_role: StaffRoleValue;
  active_status: ActiveStatusValue;
  system_permission: SystemPermission[];
}

const EMPTY_FORM: StaffFormState = {
  full_name: "",
  email: "",
  contact_number: "",
  password: "",
  position: "",
  staff_role: "staff",
  active_status: "active",
  system_permission: [],
};

export default function AdminStaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // isSelf: the account being edited is the signed-in Admin's own row.
  // Drives 3.5's self-lockout guard below.
  const isSelf = !isNew && id === profile?.id;

  useEffect(() => {
    if (isNew) return;

    setLoading(true);
    setNotFound(false);
    supabase
      .from("profiles")
      .select("id, display_name, contact_number, position, staff_role, active_status, system_permission")
      .eq("id", id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data || !data.staff_role) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setForm({
          full_name: data.display_name ?? "",
          email: "", // not stored on profiles, see below
          contact_number: data.contact_number ?? "",
          password: "",
          position: data.position ?? "",
          staff_role: data.staff_role as StaffRoleValue,
          active_status: data.active_status,
          system_permission: (data.system_permission ?? []) as SystemPermission[],
        });
        setLoading(false);
      });
  }, [id, isNew]);

  function updateField<K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePermission(permission: SystemPermission) {
    setForm((prev) => ({
      ...prev,
      system_permission: prev.system_permission.includes(permission)
        ? prev.system_permission.filter((p) => p !== permission)
        : [...prev.system_permission, permission],
    }));
  }

  const canSubmit = isNew
    ? form.full_name.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.contact_number.trim().length > 0 &&
      form.password.length >= 8 &&
      form.position.trim().length > 0 &&
      !saving
    : form.full_name.trim().length > 0 && form.position.trim().length > 0 && !saving;

  // Phase 3.5: an Admin cannot demote (staff_role -> staff) or deactivate
  // (active_status -> inactive) their own account if doing so would leave
  // zero other active Admins. Checked at submit time against the value
  // actually being saved, not just once on load, since the form state can
  // change after the page opens.
  async function guardSelfLockout(): Promise<string | null> {
    if (!isSelf || !id) return null;

    const wouldDemote = form.staff_role !== "admin";
    const wouldDeactivate = form.active_status !== "active";
    if (!wouldDemote && !wouldDeactivate) return null;

    const others = await countOtherActiveAdmins(id);
    if (others > 0) return null;

    return wouldDeactivate
      ? "You're the only active Admin. Deactivating your own account would lock everyone out, so this is blocked."
      : "You're the only active Admin. Demoting your own account would lock everyone out, so this is blocked.";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const lockoutMessage = await guardSelfLockout();
    if (lockoutMessage) {
      setError(lockoutMessage);
      return;
    }

    setSaving(true);
    setError(null);

    if (isNew) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        "create-staff-account",
        {
          body: {
            full_name: form.full_name.trim(),
            email: form.email.trim(),
            contact_number: form.contact_number.trim(),
            password: form.password,
            position: form.position.trim(),
            system_permission: form.system_permission,
          },
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        }
      );

      setSaving(false);

      // supabase-js surfaces a non-2xx Edge Function response as
      // functionError with no parsed body by default; the function always
      // returns { error: "..." } on failure, so read it from the raw
      // response context functionError carries.
      if (functionError || !functionData?.id) {
        const message =
          (functionError as { context?: { error?: string } } | undefined)?.context?.error ??
          functionError?.message ??
          "Could not create this staff account.";
        setError(message);
        return;
      }

      navigate(`/admin/staff/${functionData.id}`, { replace: true });
      return;
    }

    // Edit: app layer sends only the 3.4 editable fields, never role
    // (resident/staff distinction — always 'staff' here already) per
    // architecture-notes.md's Known Fragile Areas column-level trust note.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: form.full_name.trim(),
        contact_number: form.contact_number.trim(),
        position: form.position.trim(),
        staff_role: form.staff_role,
        active_status: form.active_status,
        system_permission: form.system_permission,
      })
      .eq("id", id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate("/admin/staff");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound) {
    return <p className="text-sm text-destructive">Could not load this staff account.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {isNew ? "New Staff Account" : form.full_name || "Edit Staff"}
          </h1>
          {!isNew && (
            <>
              <Badge variant={form.staff_role === "admin" ? "accent" : "secondary"}>
                {form.staff_role}
              </Badge>
              <Badge variant={form.active_status === "active" ? "default" : "outline"}>
                {form.active_status}
              </Badge>
            </>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="position">Position</Label>
            <Input
              id="position"
              value={form.position}
              onChange={(e) => updateField("position", e.target.value)}
              required
            />
          </div>
        </div>

        {isNew ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
          </div>
        ) : (
          // Email is not a profiles column (it lives on auth.users) and
          // changing it means calling supabase.auth.admin.updateUserById,
          // a separate service-role operation this phase doesn't build,
          // per architecture-notes.md's schema note that profiles has no
          // email field of its own. Not shown as an editable field here to
          // avoid implying a save that silently does nothing.
          <p className="text-sm text-muted-foreground">
            Email and password aren't editable from this form.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="contact_number">Contact Number</Label>
          <Input
            id="contact_number"
            value={form.contact_number}
            onChange={(e) => updateField("contact_number", e.target.value)}
            required
          />
        </div>

        {!isNew && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="staff_role">Role</Label>
              <Select
                value={form.staff_role}
                onValueChange={(v) => updateField("staff_role", v as StaffRoleValue)}
              >
                <SelectTrigger id="staff_role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="active_status">Active Status</Label>
              <Select
                value={form.active_status}
                onValueChange={(v) => updateField("active_status", v as ActiveStatusValue)}
              >
                <SelectTrigger id="active_status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* system_permission only applies to staff_role = 'staff', per
            0002_profiles_extended_fields.sql's comment: admin bypasses
            this array entirely in every policy. Hidden rather than
            disabled-and-shown when staff_role is admin, since a
            permission list that can't mean anything for an Admin row
            isn't a gated control, it's just not applicable. */}
        {form.staff_role === "staff" && (
          <div className="flex flex-col gap-2">
            <Label>Permissions</Label>
            <div className="flex flex-wrap gap-2">
              {SYSTEM_PERMISSIONS.map((p) => {
                const active = form.system_permission.includes(p.value);
                return (
                  <Button
                    key={p.value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() => togglePermission(p.value)}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/staff")}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Saving…" : isNew ? "Create Account" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
