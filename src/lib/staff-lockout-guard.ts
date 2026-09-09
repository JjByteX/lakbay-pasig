import { supabase } from "./supabase";

// Phase 3.5 (step-4-phases.md): shared by admin-staff.tsx (row action
// toggle) and admin-staff-detail.tsx (edit form's demote/deactivate
// controls), so the "does at least one other active Admin exist" check
// lives in one place, per constraints.md's Inventory Before Suggesting
// rule against parallel copies of the same logic.
//
// RLS: profiles_select_admin (0009, via is_admin()) already lets any
// Admin read every profiles row, so this plain select needs no service
// role or extra policy — it only ever runs from a page already gated by
// requireAdmin (protected-route.tsx).
export async function countOtherActiveAdmins(excludingId: string): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("staff_role", "admin")
    .eq("active_status", "active")
    .neq("id", excludingId);

  return count ?? 0;
}
