import { useAuth } from "@/lib/auth-context";

export default function AdminPage() {
  const { profile, signOut } = useAuth();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground">CATO Admin Panel</h1>
      <p className="text-base text-muted-foreground">
        Admin shell placeholder. Sidebar sections come in a later step, scoped
        to this staff member's System Permission.
      </p>
      <p className="text-base text-muted-foreground">
        Staff role: {profile?.staff_role ?? "unknown"}
      </p>
      <button
        onClick={signOut}
        className="w-fit rounded-lg bg-secondary px-4 py-2 text-base font-semibold text-secondary-foreground"
      >
        Log out
      </button>
    </div>
  );
}
