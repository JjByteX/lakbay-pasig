export type Role = "resident" | "staff";
export type StaffRole = "staff" | "admin";
export type ActiveStatus = "active" | "inactive";

export interface Profile {
  id: string;
  role: Role;
  staff_role: StaffRole | null;
  active_status: ActiveStatus;
}
