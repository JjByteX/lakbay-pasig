export type Role = "resident" | "staff";
export type StaffRole = "staff" | "admin";
export type ActiveStatus = "active" | "inactive";
export type SystemPermission =
  | "manage_places"
  | "review_businesses"
  | "publish_events"
  | "build_trails";

export interface Profile {
  id: string;
  role: Role;
  staff_role: StaffRole | null;
  active_status: ActiveStatus;
  display_name: string | null;
  contact_number: string | null;
  date_of_birth: string | null;
  preferred_language: string | null;
  preferred_categories: string[] | null;
  position: string | null;
  system_permission: SystemPermission[] | null;
}
