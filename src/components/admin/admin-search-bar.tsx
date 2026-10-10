import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Bank,
  CalendarDots,
  CircleNotch,
  FlagBanner,
  MagnifyingGlass,
  MapTrifold,
  Microphone,
  Stop,
  Storefront,
  Users,
  type Icon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SquareLoader } from "@/components/public/square-loader";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import {
  EMPTY_ADMIN_SEARCH_RESULTS,
  searchAdminEverything,
  type AdminSearchResults,
} from "@/lib/admin-global-search";
import { isVoiceSearchSupported, useVoiceSearch } from "@/hooks/use-voice-search";
import { cn } from "@/lib/utils";

// Admin global search, Spotlight style. There is no search field in the
// admin layout: the trigger is the "Search" row at the top of the sidebar,
// above Dashboard, the same place and look as the resident sidebar's Search
// row (admin-sidebar.tsx). This component is only the search itself, a
// centered modal in the upper part of the screen like macOS Spotlight, a
// command palette (Linear, Raycast) or GitHub's Ctrl+K. A modal and not a
// side panel, per the Modal vs panel rule: it is one focused task that fits
// in a viewport and needs nothing from the page underneath.
//
// Controlled by admin.tsx (open / onOpenChange), the same way the resident
// shell owns its search state and hands the sidebar a toggle. It is mounted
// in the admin shell, not inside the sidebar, because below md the sidebar is
// an offcanvas sheet that unmounts its contents when closed, which would
// take the search with it. Opens from the sidebar row or Ctrl+K / Cmd+K
// from anywhere in admin. Closes on Escape, an outside click, or choosing a
// result.
//
// Keyboard: arrows move through the results across groups, Enter opens the
// highlighted one, Escape closes. Focus stays in the input the whole time
// (combobox + listbox pattern), the highlighted row is announced through
// aria-activedescendant.
//
// Shape: with nothing typed, only the input row shows, so the modal is never
// mostly empty (Component Sizing Rules). Results appear below it once
// something is typed. Flat colors only, row highlight is a full-row
// background (no side bar), radius is 16px on the modal and 8px on rows,
// text uses the same three sizes (base, sm, xs) and two weights as the rest
// of admin.
//
// Voice: a mic button at the end of the input row, same hook and server
// function as the resident search bar (use-voice-search.ts ->
// api/transcribe.js), so the same behavior applies: it stops by itself about
// a second after you stop talking, a tap stops it early, and the transcript
// fills the input like typing, so the search runs on its own. The stop icon
// swells with your voice level. Hidden where the browser can't record. While
// listening, working or after a failure, one line takes the results' place
// so the problem is never invisible behind a list. Closing the modal stops
// any recording and drops a transcript that arrives late.
//
// Data is unchanged: searchAdminEverything reads through each table's own
// staff policy (see admin-global-search.ts), so what shows here is exactly
// what this staff member may see. Same 300ms debounce as before, plus a
// cancel flag so a slow earlier response can't overwrite a newer query's
// results.
const DEBOUNCE_MS = 300;

interface SpotlightItem {
  id: string;
  path: string;
  title: string;
  subtitle?: string | null;
  badge?: ReactNode;
  icon: Icon;
}

interface SpotlightGroup {
  label: string;
  items: SpotlightItem[];
}

// Icons match admin-sidebar.tsx's own icon for each section, same icon for
// the same concept everywhere.
function buildGroups(results: AdminSearchResults): SpotlightGroup[] {
  const groups: SpotlightGroup[] = [
    {
      label: "Places",
      items: results.places.map((place) => ({
        id: `place-${place.id}`,
        path: `/admin/places/${place.id}`,
        title: place.name,
        subtitle: place.category,
        badge: <StatusBadge status={place.verification_status} />,
        icon: Bank,
      })),
    },
    {
      label: "Businesses",
      items: results.businesses.map((business) => ({
        id: `business-${business.id}`,
        path: `/admin/businesses/${business.id}`,
        title: business.name,
        subtitle: business.category,
        badge: (
          <>
            <StatusBadge status={business.verification_status} />
            {business.featured_status === "featured" && <Badge variant="accent">Featured</Badge>}
          </>
        ),
        icon: Storefront,
      })),
    },
    {
      label: "Trails",
      items: results.trails.map((trail) => ({
        id: `trail-${trail.id}`,
        path: `/admin/trails/${trail.id}`,
        title: trail.name,
        subtitle: trail.theme,
        badge: <StatusBadge status={trail.status} />,
        icon: MapTrifold,
      })),
    },
    {
      label: "Announcements",
      items: results.events.map((event) => ({
        id: `event-${event.id}`,
        path: `/admin/events?event=${event.id}`,
        title: event.title,
        subtitle: event.category,
        badge: <StatusBadge status={event.published ? "published" : "draft"} />,
        icon: CalendarDots,
      })),
    },
    {
      label: "Fiestas",
      items: results.fiestas.map((fiesta) => ({
        id: `fiesta-${fiesta.id}`,
        path: `/admin/fiestas?fiesta=${fiesta.id}`,
        title: fiesta.name,
        subtitle: fiesta.date_label,
        badge: <StatusBadge status={fiesta.published ? "published" : "draft"} />,
        icon: FlagBanner,
      })),
    },
    {
      label: "Staff",
      items: results.staff.map((member) => ({
        id: `staff-${member.id}`,
        path: "/admin/staff",
        title: member.display_name ?? "Unnamed staff",
        subtitle: member.position,
        icon: Users,
      })),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

export function AdminSearchBar({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const navigate = useNavigate();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResults>(EMPTY_ADMIN_SEARCH_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);

  const [voiceSupported] = useState(isVoiceSearchSupported);
  // A transcript that comes back after the modal was closed is dropped
  // instead of being typed into a closed search.
  const openRef = useRef(open);
  openRef.current = open;
  const voice = useVoiceSearch((text) => {
    if (openRef.current) setQuery(text);
  });
  const stopVoice = voice.stop;

  // Ctrl+K / Cmd+K toggles from anywhere in admin. preventDefault stops the
  // browser's own Ctrl+K (focus the address/search bar) from firing too.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(EMPTY_ADMIN_SEARCH_RESULTS);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    const timeout = setTimeout(() => {
      searchAdminEverything(trimmed)
        .then((next) => {
          if (cancelled) return;
          setResults(next);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const trimmed = query.trim();
  const ready = trimmed.length > 0 && !loading && !error;
  const groups = useMemo(() => (ready ? buildGroups(results) : []), [ready, results]);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  // New results start at the first row.
  useEffect(() => {
    setActive(0);
  }, [results]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (flat.length === 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, flat.length, listId]);

  // Every way of closing (Escape, outside click, Ctrl+K, choosing a result)
  // ends up here: next time it opens clean and nothing is left recording.
  useEffect(() => {
    if (open) return;
    setQuery("");
    stopVoice();
  }, [open, stopVoice]);

  function goTo(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  let voiceNote: string | null = voice.error;
  if (voice.status === "recording") voiceNote = "Listening…";
  if (voice.status === "transcribing") voiceNote = "Working out what you said…";

  function handleMicClick() {
    if (voice.status === "recording") {
      voice.stop();
      return;
    }
    void voice.start();
  }

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((prev) => (prev + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((prev) => (prev - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (item) goTo(item.path);
    }
  }

  let rowIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-24 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 origin-top-left overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogTitle className="sr-only">Search</DialogTitle>

          <div className="flex h-16 items-center gap-4 px-4">
            <MagnifyingGlass className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => {
                voice.clearError();
                setQuery(e.target.value);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Search"
              aria-label="Search"
              role="combobox"
              aria-expanded={trimmed.length > 0}
              aria-controls={listId}
              aria-activedescendant={flat.length > 0 ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            {voiceSupported && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleMicClick}
                disabled={voice.status === "transcribing"}
                aria-label={voice.status === "recording" ? "Stop recording" : "Search by voice"}
                title={voice.status === "recording" ? "Stop recording" : "Search by voice"}
                className="h-8 w-8 shrink-0 text-muted-foreground"
              >
                {voice.status === "idle" && <Microphone className="h-5 w-5" />}
                {voice.status === "recording" && (
                  <Stop
                    weight="fill"
                    className="h-5 w-5 text-destructive transition-transform duration-100"
                    style={{ transform: `scale(${1 + voice.level * 0.15})` }}
                  />
                )}
                {voice.status === "transcribing" && <CircleNotch className="h-5 w-5 animate-spin" />}
              </Button>
            )}
          </div>

          {voiceNote !== null && (
            <output className="block border-t border-border px-6 py-4 text-sm text-muted-foreground">
              {voiceNote}
            </output>
          )}

          {voiceNote === null && trimmed.length > 0 && (
            <div
              id={listId}
              role="listbox"
              aria-label="Results"
              className="max-h-[60vh] overflow-y-auto border-t border-border p-2"
            >
              {loading && (
                <p className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                  <SquareLoader size="xs" />
                  Searching…
                </p>
              )}

              {!loading && error && (
                <p className="px-4 py-2 text-sm text-muted-foreground">Search failed. Try again.</p>
              )}

              {ready && groups.length === 0 && (
                <p className="px-4 py-2 text-sm text-muted-foreground">No results for &quot;{trimmed}&quot;.</p>
              )}

              {groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label} className="pb-2 last:pb-0">
                  <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const index = rowIndex++;
                    const isActive = index === active;
                    return (
                      <div
                        key={item.id}
                        id={`${listId}-${index}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={isActive}
                        onMouseMove={() => setActive(index)}
                        onClick={() => goTo(item.path)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            goTo(item.path);
                          }
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-4 rounded-lg px-4 py-2 transition-colors",
                          isActive && "bg-muted"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate text-sm font-semibold text-foreground">{item.title}</span>
                          {item.subtitle && (
                            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          )}
                        </span>
                        {item.badge && <span className="flex shrink-0 items-center gap-2">{item.badge}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

// One badge component covering every status string the results show
// (place/business verification, trail draft/published, event published/
// draft) -- all the same verified-vs-not-yet meaning, matching
// admin-places.tsx's STATUS_VARIANT convention (verified: default,
// pending/draft: outline).
function StatusBadge({ status }: Readonly<{ status: string }>) {
  const isPositive = status === "verified" || status === "published";
  return <Badge variant={isPositive ? "default" : "outline"}>{statusLabel(status)}</Badge>;
}

function statusLabel(status: string): string {
  if (status === "pending") return "Pending";
  if (status === "verified") return "Verified";
  if (status === "rejected") return "Rejected";
  if (status === "draft") return "Draft";
  if (status === "published") return "Published";
  return status;
}
