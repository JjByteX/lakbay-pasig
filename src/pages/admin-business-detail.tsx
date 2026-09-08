import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// 6.5: read only list of business_items for staff review, name and price
// per item, missing price shown plainly, not hidden, per
// build-3-phases-plan.md 6.5 and vendor-mode-spec.md's "Warning, Not a
// Block" section. Columns from 0004_businesses.sql's business_items table:
// id, business_id, name, price (nullable).
interface BusinessItem {
  id: string;
  name: string;
  price: number | null;
}

// 6.8: full business_reviews history, staff id (via display name), action,
// notes, timestamp, per admin-panel-spec.md's Review Action Log and plan
// 6.8's "same tabs pattern as Places". One difference from Places'
// PlaceReviewEntry: action includes 'feature' alongside 'verify'/'reject',
// per 0004_businesses.sql's business_reviews check constraint, since 6.7's
// Featured toggle also logs here.
interface BusinessReviewEntry {
  id: string;
  staff_id: string;
  staff_name: string | null;
  action: "verify" | "reject" | "feature";
  notes: string | null;
  created_at: string;
}

// Raw shape returned by the business_reviews select below, before mapping
// into BusinessReviewEntry. Supabase types a select(...profiles(display_name))
// join as an array even for a one-to-one relationship, so profiles comes
// back as a (possibly empty) array here, not a single nullable object.
interface BusinessReviewRow {
  id: string;
  staff_id: string;
  action: "verify" | "reject" | "feature";
  notes: string | null;
  created_at: string;
  profiles: { display_name: string | null }[];
}

// 6.4: form fields matching the businesses table, per build-3-phases-plan.md
// 6.4 — name, business type, category, description, address, contact, hours,
// business story, unique specialty, accessibility info, social links,
// language. Column names taken from 0004_businesses.sql, not re-derived.
//
// Edit-only, no create flow: unlike Places (staff create and edit directly,
// per admin-panel-spec.md's Places section), businesses.submitted_by is
// not-null and set by the vendor at Tier 1 self-listing time
// (vendor-mode-spec.md). Staff review an existing row, they don't originate
// one, so there is no "New Business" route to mirror admin-places.tsx's
// isNew branch.
//
// Verify/reject dialog (6.6), Featured toggle (6.7), and the Review
// History tab (6.8) are all implemented below.

const BUSINESS_TYPES = ["Product", "Service", "Both"] as const;
const LANGUAGES = ["English", "Filipino", "Both"] as const;

interface BusinessFormState {
  name: string;
  business_type: string;
  category: string;
  description: string;
  address: string;
  contact: string;
  opening_hours: string;
  business_story: string;
  unique_specialty: string;
  accessibility_info: string;
  social_media_links: string;
  language: string;
}

const EMPTY_FORM: BusinessFormState = {
  name: "",
  business_type: "",
  category: "",
  description: "",
  address: "",
  contact: "",
  opening_hours: "",
  business_story: "",
  unique_specialty: "",
  accessibility_info: "",
  social_media_links: "",
  language: "",
};

type VerificationStatus = "pending" | "verified" | "unverified";
type FeaturedStatus = "listed" | "featured";

// 6.6: verify and reject dialog, same pattern as Places
// (admin-place-detail.tsx), reject requires notes, writes to
// business_reviews, per build-3-phases-plan.md 6.6. Two differences from
// the Places version, both schema driven, not stylistic choices:
//   - businesses.verification_status has no 'rejected' value
//     (0004_businesses.sql's check constraint is pending/verified/
//     unverified), so reject sets 'unverified', not 'rejected'.
//   - businesses.review_notes is a real column (data-model.md's "Review
//     Notes (reason for rejection, if any)"), unlike places which has no
//     such column. Reject also writes review_notes on the row itself, not
//     only the business_reviews audit entry, so the reason for rejection
//     shows on the record without opening the review history.
type ReviewAction = "verify" | "reject";

// 6.7: Featured toggle. Direct toggle, no form, no checklist, per
// vendor-mode-spec.md's "Mechanic: Featured works as a direct toggle,
// similar to pinning a post" and build-3-phases-plan.md 6.7. One button,
// one click, one confirmation state (the button's own pending label) —
// not a dialog, since ux-ui-guidelines.md's modal vs panel rule reserves
// a dialog for a focused decision or confirmation, and staff discretion
// here needs no confirmation step beyond the click itself. Writes a
// 'feature' action to business_reviews on change, same audit pattern as
// verify/reject, per admin-panel-spec.md's Review Action Log ("Every
// review action is logged, not just the final result").

const STATUS_VARIANT = {
  pending: "outline",
  verified: "default",
  unverified: "destructive",
} as const;

export default function AdminBusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [form, setForm] = useState<BusinessFormState>(EMPTY_FORM);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [featuredStatus, setFeaturedStatus] = useState<FeaturedStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [items, setItems] = useState<BusinessItem[] | null>(null);
  const [reviews, setReviews] = useState<BusinessReviewEntry[] | null>(null);

  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [featureSubmitting, setFeatureSubmitting] = useState(false);
  const [featureError, setFeatureError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setNotFound(false);
    supabase
      .from("businesses")
      .select(
        "id, name, business_type, category, description, address, contact, opening_hours, business_story, unique_specialty, accessibility_info, social_media_links, language, verification_status, featured_status"
      )
      .eq("id", id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setForm({
          name: data.name ?? "",
          business_type: data.business_type ?? "",
          category: data.category ?? "",
          description: data.description ?? "",
          address: data.address ?? "",
          contact: data.contact ?? "",
          opening_hours: data.opening_hours ?? "",
          business_story: data.business_story ?? "",
          unique_specialty: data.unique_specialty ?? "",
          accessibility_info: data.accessibility_info ?? "",
          social_media_links: (data.social_media_links ?? []).join(", "),
          language: data.language ?? "",
        });
        setStatus(data.verification_status);
        setFeaturedStatus(data.featured_status);
        setLoading(false);
      });

    // 6.5: staff review only, no add/edit/delete here. Items belong to the
    // vendor's own listing flow (build-order.md #9), this view just reads.
    supabase
      .from("business_items")
      .select("id, name, price")
      .eq("business_id", id)
      .then(({ data }) => {
        setItems(data ?? []);
      });

    // 6.8: full review history, staff id, action, notes, timestamp, newest
    // first, per admin-panel-spec.md's Review Action Log, same query shape
    // as admin-place-detail.tsx's place_reviews fetch.
    supabase
      .from("business_reviews")
      .select("id, staff_id, action, notes, created_at, profiles(display_name)")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setReviews(
          (data ?? []).map((r: BusinessReviewRow) => ({
            id: r.id,
            staff_id: r.staff_id,
            staff_name: r.profiles[0]?.display_name ?? null,
            action: r.action,
            notes: r.notes,
            created_at: r.created_at,
          }))
        );
      });
  }, [id]);

  // Row action menu in the Businesses table (6.2) links here with
  // ?review=verify or ?review=reject, same pattern as admin-places.tsx,
  // so Verify/Reject is a single click from the list.
  useEffect(() => {
    const requested = searchParams.get("review");
    if (requested === "verify" || requested === "reject") {
      openReviewDialog(requested);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("review");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 6.7: the Businesses table's row menu (6.2) also links here with
  // ?toggle=featured, so Feature/Unfeature is a single click from the
  // list, same one-click pattern as verify/reject above. No dialog to
  // open first, since this action needs no confirmation, so this effect
  // fires the toggle directly rather than just opening a state like the
  // review effect above does. Gated on featuredStatus specifically (not
  // status), since that's the value handleFeatureToggle actually reads to
  // decide direction and to short-circuit — gating on a different field
  // that merely happens to load in the same batch is a coincidental
  // guarantee, not a real one.
  useEffect(() => {
    if (searchParams.get("toggle") === "featured" && featuredStatus !== null) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("toggle");
        return next;
      }, { replace: true });
      handleFeatureToggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, featuredStatus]);

  function updateField<K extends keyof BusinessFormState>(key: K, value: BusinessFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.name.trim().length > 0 && form.address.trim().length > 0 && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !id) return;

    setSaving(true);
    setError(null);

    // App layer must not send verification_status, featured_status,
    // review_notes, or reviewed_by here, per architecture-notes.md's Known
    // Fragile Areas note on businesses_update_staff guarding the row, not
    // columns. Only the 6.4 form fields are sent.
    const payload = {
      name: form.name,
      business_type: form.business_type || null,
      category: form.category || null,
      description: form.description || null,
      address: form.address,
      contact: form.contact || null,
      opening_hours: form.opening_hours || null,
      business_story: form.business_story || null,
      unique_specialty: form.unique_specialty || null,
      accessibility_info: form.accessibility_info || null,
      social_media_links: form.social_media_links.trim()
        ? form.social_media_links.split(",").map((link) => link.trim()).filter(Boolean)
        : null,
      language: form.language || null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase.from("businesses").update(payload).eq("id", id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate("/admin/businesses");
  }

  function openReviewDialog(action: ReviewAction) {
    setReviewAction(action);
    setReviewNotes("");
    setReviewError(null);
  }

  async function handleReviewSubmit() {
    if (!id || !profile) return;
    if (reviewAction === "reject" && reviewNotes.trim().length === 0) {
      setReviewError("Rejecting requires a note explaining why.");
      return;
    }

    setReviewSubmitting(true);
    setReviewError(null);

    const nextStatus: VerificationStatus = reviewAction === "verify" ? "verified" : "unverified";

    // Same submit writes both the audit log row and the record's current
    // state, per admin-panel-spec.md's Review Action Log and plan 6.6.
    // .select().single() on the insert, same as admin-place-detail.tsx's
    // handleReviewSubmit, so the 6.8 history list can prepend the new
    // entry locally instead of refetching the whole list.
    const { data: insertedReview, error: reviewInsertError } = await supabase
      .from("business_reviews")
      .insert({
        business_id: id,
        staff_id: profile.id,
        action: reviewAction,
        notes: reviewNotes.trim() || null,
      })
      .select("id, staff_id, action, notes, created_at")
      .single();

    if (reviewInsertError) {
      setReviewSubmitting(false);
      setReviewError(reviewInsertError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("businesses")
      .update({
        verification_status: nextStatus,
        reviewed_by: profile.id,
        review_notes: reviewAction === "reject" ? reviewNotes.trim() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setReviewSubmitting(false);

    if (updateError) {
      setReviewError(updateError.message);
      return;
    }

    setStatus(nextStatus);
    if (insertedReview) {
      setReviews((prev) => [
        {
          id: insertedReview.id,
          staff_id: insertedReview.staff_id,
          staff_name: profile.display_name ?? null,
          action: insertedReview.action,
          notes: insertedReview.notes,
          created_at: insertedReview.created_at,
        },
        ...(prev ?? []),
      ]);
    }
    setReviewAction(null);
  }

  // 6.7: single toggle control, no form, no checklist, matching the direct
  // toggle mechanic in vendor-mode-spec.md. Writes a 'feature' action to
  // business_reviews on change, then flips featured_status on the row,
  // same two-write order as handleReviewSubmit above (audit row first,
  // then the record's current state) so the log always has an entry even
  // if the second write fails.
  async function handleFeatureToggle() {
    if (!id || !profile || featuredStatus === null) return;

    setFeatureSubmitting(true);
    setFeatureError(null);

    const nextFeaturedStatus: FeaturedStatus = featuredStatus === "featured" ? "listed" : "featured";

    // .select().single(), same reasoning as handleReviewSubmit above: the
    // 6.8 history tab prepends this locally instead of refetching.
    const { data: insertedReview, error: reviewInsertError } = await supabase
      .from("business_reviews")
      .insert({
        business_id: id,
        staff_id: profile.id,
        action: "feature",
        notes: null,
      })
      .select("id, staff_id, action, notes, created_at")
      .single();

    if (reviewInsertError) {
      setFeatureSubmitting(false);
      setFeatureError(reviewInsertError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("businesses")
      .update({
        featured_status: nextFeaturedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setFeatureSubmitting(false);

    if (updateError) {
      setFeatureError(updateError.message);
      return;
    }

    setFeaturedStatus(nextFeaturedStatus);
    if (insertedReview) {
      setReviews((prev) => [
        {
          id: insertedReview.id,
          staff_id: insertedReview.staff_id,
          staff_name: profile.display_name ?? null,
          action: insertedReview.action,
          notes: insertedReview.notes,
          created_at: insertedReview.created_at,
        },
        ...(prev ?? []),
      ]);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound) {
    return <p className="text-sm text-muted-foreground">Could not load this business.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{form.name || "Business"}</h1>
          {status && <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>}
          {featuredStatus === "featured" && <Badge variant="accent">Featured</Badge>}
        </div>
        <div className="flex gap-2">
          {status === "pending" && (
            <>
              <Button variant="outline" onClick={() => openReviewDialog("reject")}>
                Reject
              </Button>
              <Button onClick={() => openReviewDialog("verify")}>Verify</Button>
            </>
          )}
          {featuredStatus !== null && (
            <Button
              variant={featuredStatus === "featured" ? "secondary" : "outline"}
              onClick={handleFeatureToggle}
              disabled={featureSubmitting}
              className="gap-2"
            >
              <Star className="h-4 w-4" />
              {featureSubmitting
                ? "Updating…"
                : featuredStatus === "featured"
                  ? "Unfeature"
                  : "Feature"}
            </Button>
          )}
        </div>
      </div>

      {featureError && <p className="text-sm text-destructive">{featureError}</p>}

      {/* 6.8: tabs split current info from review history, same pattern as
          admin-place-detail.tsx's 5.6, per plan 6.8 and
          ux-ui-guidelines.md's no-fragmentation rule — one card's worth of
          related content (form + items) stays together in one tab rather
          than splitting into two pages. */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Current Info</TabsTrigger>
          <TabsTrigger value="history">Review History</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="flex flex-col gap-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Business Name</Label>
              <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="business_type">Business Type</Label>
              <Select value={form.business_type} onValueChange={(v) => updateField("business_type", v)}>
                <SelectTrigger id="business_type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.category} onChange={(e) => updateField("category", e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="One line, what the business sells or offers"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="Source of truth, map coordinates are generated from this"
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact">Contact</Label>
              <Input id="contact" value={form.contact} onChange={(e) => updateField("contact", e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="opening_hours">Opening Hours</Label>
              <Input
                id="opening_hours"
                value={form.opening_hours}
                onChange={(e) => updateField("opening_hours", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="business_story">Business Story</Label>
            <Textarea
              id="business_story"
              placeholder="The longer background, why it exists, how it started"
              value={form.business_story}
              onChange={(e) => updateField("business_story", e.target.value)}
              className="min-h-30"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="unique_specialty">Unique Specialty</Label>
            <Textarea
              id="unique_specialty"
              value={form.unique_specialty}
              onChange={(e) => updateField("unique_specialty", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="accessibility_info">Accessibility Info</Label>
            <Textarea
              id="accessibility_info"
              placeholder="Parking, wheelchair access, nearby transport"
              value={form.accessibility_info}
              onChange={(e) => updateField("accessibility_info", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="social_media_links">Social Media Links</Label>
              <Input
                id="social_media_links"
                placeholder="Comma separated"
                value={form.social_media_links}
                onChange={(e) => updateField("social_media_links", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="language">Language</Label>
              <Select value={form.language} onValueChange={(v) => updateField("language", v)}>
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/admin/businesses")}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
          </form>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">Items</h2>
            <ItemList items={items} />
          </div>
        </TabsContent>

        <TabsContent value="history">
          <ReviewHistoryList reviews={reviews} />
        </TabsContent>
      </Tabs>

      <Dialog open={reviewAction !== null} onOpenChange={(open) => !open && setReviewAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "verify" ? "Verify this business?" : "Reject this business?"}</DialogTitle>
            <DialogDescription>
              {reviewAction === "verify"
                ? "This business will be marked verified and visible to the public."
                : "Explain what needs to change. The submitter's record stays visible in the review history."}
            </DialogDescription>
          </DialogHeader>

          {reviewAction === "reject" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="review-notes">Review Notes</Label>
              <Textarea
                id="review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Reason for rejection"
                required
              />
            </div>
          )}

          {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewAction(null)} disabled={reviewSubmitting}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === "reject" ? "destructive" : "default"}
              onClick={handleReviewSubmit}
              disabled={reviewSubmitting || (reviewAction === "reject" && reviewNotes.trim().length === 0)}
            >
              {reviewSubmitting ? "Submitting…" : reviewAction === "verify" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 6.8: full business_reviews history, staff id (via display name), action,
// notes, timestamp. Lives in the Review History tab, separate from the
// Current Info tab per plan 6.8's no-fragmentation instruction. Same
// structure as admin-place-detail.tsx's ReviewHistoryList, with a third
// action variant: 'feature' (6.7), styled with the same accent badge used
// for the Featured badge/status elsewhere on this page and in
// admin-businesses.tsx, per ux-ui-guidelines.md's "one label per concept,
// same icon/style per concept everywhere" rule.
const REVIEW_ACTION_LABEL: Record<BusinessReviewEntry["action"], string> = {
  verify: "Verified",
  reject: "Rejected",
  feature: "Featured",
};

const REVIEW_ACTION_VARIANT: Record<BusinessReviewEntry["action"], "default" | "destructive" | "accent"> = {
  verify: "default",
  reject: "destructive",
  feature: "accent",
};

function ReviewHistoryList({ reviews }: { reviews: BusinessReviewEntry[] | null }) {
  if (reviews === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">No review history yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {reviews.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {entry.staff_name ?? "Staff"}
            </span>
            <Badge variant={REVIEW_ACTION_VARIANT[entry.action]}>
              {REVIEW_ACTION_LABEL[entry.action]}
            </Badge>
          </div>
          {entry.notes && <p className="text-sm text-muted-foreground">{entry.notes}</p>}
          <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}

// 6.5: name and price per item, missing price shown plainly rather than
// omitted from the row, per vendor-mode-spec.md's "Warning, Not a Block"
// section: an item without a price still displays normally, it's only
// excluded from price range filtering elsewhere in the app, never hidden
// here. Fewer than 5 rows is the common case for a single business's item
// list, so this uses a simple list per ux-ui-guidelines.md's table sizing
// rule, not the Table primitive.
function ItemList({ items }: { items: BusinessItem[] | null }) {
  if (items === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No items listed yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-4 p-4">
          <span className="text-sm text-foreground">{item.name}</span>
          {item.price !== null ? (
            <span className="text-sm text-muted-foreground">
              {item.price.toLocaleString(undefined, { style: "currency", currency: "PHP" })}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">No price set</span>
          )}
        </li>
      ))}
    </ul>
  );
}
