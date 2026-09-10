import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Phase 4.1-4.2 (step-6-phases.md): full record fields from events
// (migration 0006), scoped to published = true. No save action, events
// aren't saveable per data-model.md, Saved Places and Saved Routes are the
// only two saved concepts on End User, so no SaveButton import here unlike
// discover-place-detail.tsx.
//
// related_place is a Supabase embedded select on the events.related_place_id
// -> places(id) foreign key (migration 0006), same embed syntax already
// used elsewhere in this codebase (discover-query.ts's business_items(price),
// admin-place-detail.tsx's profiles(display_name)), plain form (no alias,
// no precedent for aliasing anywhere in this codebase, and none needed
// here), one query instead of a second round trip for the place's name.
// Supabase types a to-one embed as an array even for a single FK, same
// shape those two existing call sites already account for. A null
// related_place_id simply yields an empty array here, not an error.
interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  date_time: string | null;
  location: string | null;
  enrollment_info: string | null;
  related_place_id: string | null;
  places: { name: string }[];
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Phase 4.1-4.4: full detail page for an announcement, reached from
 * AnnouncementCard's row tap (home.tsx, wired in Phase 4.5). Same
 * structure discover-place-detail.tsx already established: back button
 * top left, loading/not-found/loaded states. Nested under PublicShell
 * (App.tsx), not a top level route, so the bottom nav and top bar stay
 * visible per ux-ui-guidelines.md's Layout Shell Rules.
 */
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    supabase
      .from("events")
      .select(
        "id, title, description, category, date_time, location, enrollment_info, related_place_id, places(name)"
      )
      .eq("id", id)
      .eq("published", true)
      .maybeSingle()
      .then(({ data, error }) => {
        // Phase 4.3: a missing id and an unpublished one read identically
        // here, same reasoning discover-place-detail.tsx's own not-found
        // branch already uses for verified-vs-missing, a public reader
        // can't tell the two apart and doesn't need to.
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setEvent(data as EventDetail);
        setLoading(false);
      });
  }, [id]);

  const formattedDate = event ? formatDateTime(event.date_time) : null;
  const relatedPlaceName = event?.places[0]?.name ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {loading && <p className="text-base text-muted-foreground">Loading…</p>}

      {!loading && notFound && (
        <p className="text-base text-muted-foreground">This announcement couldn&apos;t be found.</p>
      )}

      {!loading && event && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">{event.title}</h1>
            {(formattedDate || event.location) && (
              <p className="text-sm text-muted-foreground">
                {[formattedDate, event.location].filter(Boolean).join(" · ")}
              </p>
            )}
            {event.category && (
              <Badge variant="secondary" className="w-fit">
                {event.category}
              </Badge>
            )}
          </div>

          {event.description && (
            <p className="text-base text-foreground">{event.description}</p>
          )}

          {event.enrollment_info && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Enrollment</h2>
              <p className="text-base text-muted-foreground">{event.enrollment_info}</p>
            </div>
          )}

          {event.related_place_id && relatedPlaceName && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Related place</h2>
              <Link
                to={`/discover/place/${event.related_place_id}`}
                className="w-fit text-base text-primary underline-offset-4 hover:underline"
              >
                {relatedPlaceName}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
