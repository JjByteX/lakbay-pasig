import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

// Stub for step 6 (Public app: Home, per build-order.md item 6). Renders
// inside PublicShell now instead of owning its own route, per Phase 2.5's
// flagged collision: home.tsx and the shell both claimed "/", the shell
// wins here since navigation-and-access-control.md defines Home as one of
// the five shell tabs. Login/logout kept from the prior placeholder since
// this is an existing file, not empty scaffolding.
export default function HomePage() {
  const { session, signOut } = useAuth();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground">Home</h1>
      <p className="text-base text-muted-foreground">Coming in step 6.</p>

      {session ? (
        <button
          onClick={signOut}
          className="w-fit rounded-lg bg-secondary px-4 py-2 text-base font-semibold text-secondary-foreground"
        >
          Log out
        </button>
      ) : (
        <Link
          to="/login"
          className="w-fit rounded-lg bg-primary px-4 py-2 text-base font-semibold text-primary-foreground"
        >
          Log in
        </Link>
      )}
    </div>
  );
}
