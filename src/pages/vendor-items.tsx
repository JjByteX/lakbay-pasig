import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

/**
 * Step 9, Phase 2.1: route stub for /vendor/items. Same guest-locked
 * pattern as vendor-dashboard.tsx above, this file's own header comment
 * explains the shared reasoning in full.
 *
 * The signed-in branch (item list, add/edit/delete) is Phase 5's scope.
 */
export default function VendorItemsPage() {
  const { session, loading } = useAuth();

  if (loading) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground">Items</h1>
        <p className="text-base text-muted-foreground">
          Sign in to manage your business's items.
        </p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <h1 className="text-xl font-semibold text-foreground">Items</h1>
      <p className="text-base text-muted-foreground">Loading…</p>
    </div>
  );
}
