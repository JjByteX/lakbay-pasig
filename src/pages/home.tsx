import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { session, signOut } = useAuth();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground">Lakbay Pasig</h1>
      <p className="text-base text-muted-foreground">
        Home tab placeholder. Guests can view this with no session.
      </p>

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
