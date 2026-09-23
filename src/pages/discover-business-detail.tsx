import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readEmbeddedName } from "@/lib/place-categories";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HoursDisplay } from "@/components/public/hours-display";
import { PhotoGallery } from "@/components/public/photo-gallery";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePageTitle } from "@/lib/page-title";

// Phase 6.4 (step-5-phases.md): full record fields from businesses and
// business_items (migration 0004), scoped through the widened
// businesses_select_public policy from Phase 1 (verified or pending).
// Field list matches step-5-plan.md section 2: description, hours,
// contact, item list with prices where set.
//
// Category Directory Expansion, Phase 1.7: category is now a joined
// business_categories.name (migration 0027, category_id replaces the old
// plain text column), flattened at fetch time so this field and every
// render below it stay unchanged.
//
// Story tab phase: full record view splits into a segmented Details /
// Story tab control (Tabs primitive, same one discover.tsx already uses
// for its map/list switch). business_story and unique_specialty were
// already vendor- and admin-editable (business-fields.tsx,
// admin-business-detail.tsx) but had no public render at all until now;
// data-model.md groups both under the same "why it exists, how it
// started" background note, so both land on the Story tab.
interface BusinessDetail {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  description: string | null;
  opening_hours: string | null;
  contact: string | null;
  rules: string | null;
  business_story: string | null;
  unique_specialty: string | null;
  business_type: "Product" | "Service" | "Both" | null;
  verification_status: "verified" | "pending";
}

interface BusinessItem {
  id: string;
  name: string;
  price: number | null;
  photos: { id: string; photo_url: string }[];
}

// Items tab label plan: business_type ("Product", "Service", or "Both",
// vendor-mode-spec.md's Business Listing Type) is the stable field to key
// this label on, not category text, which is an open admin-managed list
// (business_categories, migration 0027) and can't be pattern matched
// reliably. Uses the same words the spec already uses for the field
// itself, no invented terminology.
function itemsTabLabel(businessType: BusinessDetail["business_type"]): string {
  if (businessType === "Product") return "Products";
  if (businessType === "Service") return "Services";
  return "Products & Services";
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
  usePageTitle(business?.name ?? "Discover");
  const [items, setItems] = useState<BusinessItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Map hover/full-details photos phase: the business's own gallery
  // (business_photos), separate from each item's own photos (items above
  // already carry those via business_item_photos) -- same distinction
  // data-model.md draws between a business's general "Pictures" and a
  // per-item photo.
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    supabase
      .from("businesses")
      .select(
        "id, name, address, description, opening_hours, contact, rules, business_story, unique_specialty, business_type, verification_status, business_categories(name)"
      )
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
        // Category Directory Expansion, Phase 1.7: category is now a
        // joined business_categories.name (migration 0027), flattened
        // here so BusinessDetail's own category field stays unchanged.
        // readEmbeddedName handles either embed shape Postgrest may
        // return, same helper place-categories.ts already established.
        const { business_categories, ...rest } = data as typeof data & {
          business_categories: { name: string } | { name: string }[] | null;
        };
        setBusiness({ ...rest, category: readEmbeddedName(business_categories) });
        setLoading(false);
      });

    // Item list, name and price, price nullable per vendor-mode-spec.md
    // (price is optional, never required to publish). business_items_
    // select_public (0004, widened by 0016) follows the parent business's
    // own read rule. photos joined in from business_item_photos (0040),
    // its own select_public policy (migration 0040) mirrors 0016's same
    // widen, so a pending business's item photos show under the same
    // condition its item names and prices already do.
    supabase
      .from("business_items")
      .select("id, name, price, photos:business_item_photos(id, photo_url)")
      .eq("business_id", id)
      .order("sort_order", { referencedTable: "business_item_photos" })
      .then(({ data }) => {
        setItems(data ?? []);
        setItemsLoaded(true);
      });

    // Map hover/full-details photos phase: every business_photos row for
    // this business, same independent-fetch, sort_order-ordered shape as
    // the place page's own place_photos fetch (discover-place-detail.tsx).
    // business_photos_select_public (migration 0008) already follows this
    // business's own read rule (verified or pending), same as every other
    // query on this page.
    supabase
      .from("business_photos")
      .select("photo_url")
      .eq("business_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data: photoRows }) => {
        setPhotos((photoRows ?? []).map((row) => row.photo_url));
      });
  }, [id]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {(loading || !itemsLoaded) && <p className="text-base text-muted-foreground">Loading…</p>}

      {!loading && notFound && (
        <p className="text-base text-muted-foreground">This business couldn&apos;t be found.</p>
      )}

      {!loading && itemsLoaded && business && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">{business.name}</h1>
            {business.category && (
              <p className="text-sm text-muted-foreground">{business.category}</p>
            )}
            {/* Location field, phase 6.2 (location-field-plan.md): same
                muted line as the place detail page, under the category
                line and above the badge. Conditional on its own -- a
                business with no category and an address still shows the
                address in the right spot. No heading, no icon. */}
            {business.address && (
              <p className="text-sm text-muted-foreground">{business.address}</p>
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

          {/* Map hover/full-details photos phase: same placement as the
              place detail page's own gallery -- right under the header/
              badge block, above the tabs. Renders nothing when this
              business has no photos yet. */}
          <PhotoGallery photoUrls={photos} />

          {/* Story tab phase: segmented Details / Story control, same
              Tabs primitive discover.tsx already uses for map/list.
              Details keeps every visit-info block this page already had;
              Story holds business_story plus unique_specialty, both
              previously admin/vendor-editable with no public render.
              Defaults to Details, the visit-info tab a user coming from a
              marker or list row is most likely after.
              Items tab plan: items moved out of Details into their own
              tab, since a fetch failure or a genuinely empty items list
              otherwise reads identically inside Details' own empty state.
              Only rendered when the business has at least one item, same
              reasoning that already gated the items block conditionally,
              a service-only business with nothing to show here shouldn't
              carry an always-empty third tab. Label keys off business_type
              (vendor-mode-spec.md's Business Listing Type), the stable
              field for this, not the open-ended category text. */}
          <Tabs defaultValue="details">
            <TabsList
              className={
                items.length > 0 ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"
              }
            >
              <TabsTrigger value="details">Details</TabsTrigger>
              {items.length > 0 && (
                <TabsTrigger value="items">{itemsTabLabel(business.business_type)}</TabsTrigger>
              )}
              <TabsTrigger value="story">Story</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex flex-col gap-4">
              {business.description && (
                <p className="text-base text-foreground">{business.description}</p>
              )}

              {business.opening_hours && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Hours</h2>
                  <HoursDisplay value={business.opening_hours} />
                </div>
              )}

              {business.contact && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Contact</h2>
                  <p className="text-base text-muted-foreground">{business.contact}</p>
                </div>
              )}

              {/* Rules (migration 0039, rules-field-plan.md): after
                  Contact, last block in Details now that Items has its
                  own tab. One rule per line in the form, so
                  whitespace-pre-line keeps the line breaks. Hidden when
                  empty, same as the sections beside it. */}
              {business.rules && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Rules</h2>
                  <p className="whitespace-pre-line text-base text-muted-foreground">{business.rules}</p>
                </div>
              )}

              {!business.description &&
                !business.opening_hours &&
                !business.contact &&
                !business.rules && (
                  <p className="text-base text-muted-foreground">No details listed yet.</p>
                )}
            </TabsContent>

            {items.length > 0 && (
              <TabsContent value="items" className="flex flex-col gap-2">
                {/* Menu card plan: items move from a row list to a card
                    grid, photo on top, name and price below, matching the
                    familiar menu-picker shape (DoorDash/Grubhub style item
                    cards) rather than a text list. Single item renders
                    alone, no grid wrapper, per the sizing rule against a
                    grid for one item. */}
                <div
                  className={
                    items.length === 1 ? "flex" : "grid grid-cols-2 gap-3"
                  }
                >
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={
                        items.length === 1
                          ? "flex w-1/2 flex-col gap-2 rounded-lg border border-border bg-card p-3"
                          : "flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                      }
                    >
                      {/* Empty-photo state is a plain muted square, no
                          invented icon, per the icon rule: "no photo
                          yet" has no universally recognized symbol. */}
                      {item.photos.length > 0 ? (
                        <img
                          src={item.photos[0].photo_url}
                          alt=""
                          className="aspect-square w-full rounded-md border border-border object-cover"
                        />
                      ) : (
                        <div className="aspect-square w-full rounded-md border border-border bg-muted" />
                      )}
                      <span className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.name}
                      </span>
                      {/* An item with no price still displays normally
                          here, per vendor-mode-spec.md's Filter Behavior
                          line, it's excluded only from the price range
                          filter (Phase 7), never hidden from the base
                          item list. */}
                      <span className="text-sm text-muted-foreground">
                        {item.price != null ? `₱${item.price}` : "No price listed"}
                      </span>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}

            <TabsContent value="story" className="flex flex-col gap-4">
              {business.business_story && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Business story</h2>
                  <p className="whitespace-pre-line text-base text-muted-foreground">{business.business_story}</p>
                </div>
              )}

              {business.unique_specialty && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Unique specialty</h2>
                  <p className="text-base text-muted-foreground">{business.unique_specialty}</p>
                </div>
              )}

              {!business.business_story && !business.unique_specialty && (
                <p className="text-base text-muted-foreground">No story has been added for this business yet.</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
