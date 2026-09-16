export type Role = "resident" | "staff";
export type StaffRole = "staff" | "admin";
export type ActiveStatus = "active" | "inactive";
export type SystemPermission =
  | "manage_places"
  | "review_businesses"
  | "publish_events"
  | "build_trails"
  | "manage_landing";

export interface Profile {
  id: string;
  role: Role;
  staff_role: StaffRole | null;
  active_status: ActiveStatus;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  profile_picture: string | null;
  contact_number: string | null;
  date_of_birth: string | null;
  preferred_language: string | null;
  preferred_categories: string[] | null;
  position: string | null;
  system_permission: SystemPermission[] | null;
  theme_preference: "light" | "dark" | null;
  font_size_preference: "small" | "default" | "large" | null;
}
