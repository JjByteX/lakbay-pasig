import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Phase 6.4 (step-5-phases.md): full record fields from businesses and
// business_items (migration 0004), scoped through the widened
// businesses_select_public policy from Phase 1 (verified or pending).
// Field list matches step-5-plan.md section 2: description, hours,
// contact, item list with prices where set.
interface BusinessDetail {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  opening_hours: string | null;
  contact: string | null;
  verification_status: "verified" | "pending";
}

interface BusinessItem {
  id: string;
  name: string;
  price: number | null;
}

/**
 * Phase 6.2, 6.4: full record detail page for a business, reached the same
 * way as the place detail page (result-card.tsx's "View full details"
 * link). No save action here, saved_places (migration 0007) is place-only
 * by schema and by data-model.md's End User fields, no saved_businesses
 * table exists (saved-places.ts's own note); businesses are not saveable
 * in v1, so this page simply has no heart icon rather than a disabled one
 * with nothing to explain, per ux-ui-guidelines.md's Disabled/gated rule
 * (a control with no path to ever becoming enabled shouldn't be shown at
 * all, that rule governs a control that unlocks under some condition).
 */
export default function DiscoverBusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [items, setItems] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    supabase
      .from("businesses")
      .select("id, name, category, description, opening_hours, contact, verification_status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        // businesses_select_public (0015) returns verified or pending
        // rows; rejected/unverified or a stale id both land here as
        // "nothing to show," same simple-message shape as the place page,
        // full error-state distinction is Phase 8.3's scope.
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setBusiness(data as BusinessDetail);
        setLoading(false);
      });

    // Item list, name and price, price nullable per vendor-mode-spec.md
    // (price is optional, never required to publish). business_items_
    // select_public (0004) follows the parent business's own read rule.
    supabase
      .from("business_items")
      .select("id, name, price")
      .eq("business_id", id)
      .then(({ data }) => setItems(data ?? []));
  }, [id]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {loading && <p className="text-base text-muted-foreground">Loading…</p>}

      {!loading && notFound && (
        <p className="text-base text-muted-foreground">This business couldn&apos;t be found.</p>
      )}

      {!loading && business && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">{business.name}</h1>
            {business.category && (
              <p className="text-sm text-muted-foreground">{business.category}</p>
            )}
            {/* Same badge mapping as result-card.tsx's VerificationBadge:
                verified gets the institutional label, pending gets a
                visually distinct badge so it never borrows verified
                content's look, per vendor-mode-spec.md. */}
            {business.verification_status === "pending" ? (
              <Badge variant="outline" className="w-fit">
                Pending Verification
              </Badge>
            ) : (
              <Badge variant="default" className="w-fit">
                Verified by Pasig Tourism Office
              </Badge>
            )}
          </div>

          {business.description && (
            <p className="text-base text-foreground">{business.description}</p>
          )}

          {business.opening_hours && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Hours</h2>
              <p className="text-base text-muted-foreground">{business.opening_hours}</p>
            </div>
          )}

          {business.contact && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Contact</h2>
              <p className="text-base text-muted-foreground">{business.contact}</p>
            </div>
          )}

          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-foreground">Items</h2>
              <ul className="flex flex-col divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    {/* Phase 8.4 fix: item names are vendor-submitted free
                        text (vendor-mode-spec.md), length isn't bounded the
                        way a fixed label is, so a long name next to the
                        price in this justify-between row could overflow at
                        narrow widths with neither span able to shrink
                        (flex items default to min-width: auto). min-w-0
                        truncate here lets the name give way to a single
                        ellipsis line; the price stays shrink-0 since it's
                        short, fixed-format, and the more important half of
                        this row to always read in full. */}
                    <span className="min-w-0 flex-1 truncate text-base text-foreground">
                      {item.name}
                    </span>
                    {/* An item with no price still displays normally here,
                        per vendor-mode-spec.md's Filter Behavior line, it's
                        excluded only from the price range filter (Phase 7),
                        never hidden from the base item list. */}
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {item.price != null ? `₱${item.price}` : "No price listed"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
