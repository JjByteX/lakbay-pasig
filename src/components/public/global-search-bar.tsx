import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleNotch, MagnifyingGlass, Microphone, Stop } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SquareLoader } from "./square-loader";
import { VerificationBadge } from "./result-card";
import { ItemRow, ResultGroup, ResultRow } from "./search-result-list";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";
import { isVoiceSearchSupported, useVoiceSearch } from "@/hooks/use-voice-search";
import { useOnline } from "@/lib/offline/status";
import { searchPlaces as searchMapPlaces, type PlaceResult } from "@/lib/geocode";
import { useGlobalSearchQuery } from "./public-shell";
import { NEEDS_CONNECTION } from "@/lib/offline/messages";
import {
  EMPTY_SEARCH_RESULTS,
  hasAnyResults,
  ITEM_SHOW_LIMIT,
  searchEverything,
  type GlobalSearchResults,
} from "@/lib/global-search";

// 300ms: fast enough to feel live, slow enough that a normal typing pace
// (each keystroke a few hundred ms apart) doesn't fire four queries per
// letter. No existing debounce helper in this codebase to reuse (grepped
// before writing), and this is a five-line native setTimeout/clearTimeout
// pattern, not something worth a dependency for, per ponytail's ladder.
const DEBOUNCE_MS = 300;

// The map search (Photon, a free public server) is fair use only, so it waits
// for a longer pause than the database search and needs a few letters.
const MAP_DEBOUNCE_MS = 700;
const MAP_MIN_CHARS = 3;

/**
 * Global search: one bar, shell-owned (rendered by public-shell.tsx on
 * every tab except Profile, per the resolved spec), fanning out to
 * Places, Businesses, Items, Trails, and Events on every keystroke and showing
 * only the non-empty groups underneath. Query state and results live here,
 * not lifted further up, since no other component needs to read the
 * in-progress query text -- Discover's own list/map filtering reads this
 * bar's committed query via the `query`/`onQueryChange` props instead
 * (discover.tsx wires those to its existing filterDiscoverResults call),
 * matching the resolved spec's "Discover's own live list/map filtering
 * still runs off the same shared query text."
 *
 * Dropdown is a plain absolutely-positioned panel, not the Radix
 * DropdownMenu primitive (components/ui/dropdown-menu.tsx) -- that
 * primitive's open state is trigger-driven (click to open), the wrong
 * shape for "open as soon as there's a matching group, close on blur or
 * escape, and never trap focus away from the input while typing." No
 * Popover or Command primitive exists in this codebase to reach for
 * instead (grepped src/components/ui first, per constraints.md's
 * Inventory Before Suggesting rule), so this follows the same native
 * plain-list pattern discover-list.tsx, trails.tsx, and home.tsx's own
 * result rows already establish, rather than adding a new dependency.
 *
 * Step 8 cleanup: ResultGroup/ResultRow (search-result-list.tsx) and the
 * outside-click/Escape dismissal effect (use-dismiss-on-outside-or-
 * escape.ts) were byte-identical to admin-search-bar.tsx's own copies
 * and are now shared. Everything else stays separate -- see admin-
 * search-bar.tsx's own file comment for why (different data sources, an
 * extra Staff group, status badges, different route targets).
 *
 * Voice search: a mic button inside the input records until the person stops
 * talking (about a second of quiet, or 5 seconds of nothing; a tap stops it
 * early) and fills the query with the transcript (use-voice-search.ts, which
 * sends the audio to api/transcribe.js and Groq's hosted Whisper). The stop
 * icon swells with the voice level so the person can see it is hearing them.
 * The transcript goes
 * through onQueryChange like typing, so the results panel, Discover's shared
 * filtering and the fuzzy search all react to it with no further wiring. The
 * button is hidden where the browser cannot record. This is the public bar
 * only; the admin bar is unchanged.
 */
interface GlobalSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export function GlobalSearchBar({ query, onQueryChange }: Readonly<GlobalSearchBarProps>) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_SEARCH_RESULTS);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { setSearchedPlace } = useGlobalSearchQuery();
  const [mapHits, setMapHits] = useState<PlaceResult[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  // Voice search sends audio to the server. Offline the mic stays, and a tap says why it is off.
  const online = useOnline();
  const [offlineTap, setOfflineTap] = useState(false);
  useEffect(() => {
    if (online) setOfflineTap(false);
  }, [online]);

  const [voiceSupported] = useState(isVoiceSearchSupported);
  const voice = useVoiceSearch((text) => {
    onQueryChange(text);
    setOpen(true);
  });

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(EMPTY_SEARCH_RESULTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => {
      void searchEverything(trimmed).then((next) => {
        setResults(next);
        setLoading(false);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  // Streets and landmarks from the map itself, for what the database does not
  // list (a street like E. Mendoza). Online only.
  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MAP_MIN_CHARS || !online) {
      setMapHits([]);
      setMapLoading(false);
      return;
    }
    let cancelled = false;
    setMapLoading(true);
    const timeout = setTimeout(() => {
      searchMapPlaces(trimmedQuery)
        .then((hits) => {
          if (!cancelled) setMapHits(hits);
        })
        .catch(() => {
          if (!cancelled) setMapHits([]);
        })
        .finally(() => {
          if (!cancelled) setMapLoading(false);
        });
    }, MAP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, online]);

  // Close on outside click and on Escape, same two dismissal paths every
  // native browser autocomplete supports, per ux-ui-guidelines.md's
  // Familiarity principle (use the cognitive map users already have).
  // Step 8 cleanup: this effect was byte-identical to admin-search-bar.
  // tsx's own copy, now shared via src/hooks/use-dismiss-on-outside-or-
  // escape.ts.
  useDismissOnOutsideOrEscape(containerRef, () => setOpen(false));

  function goTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  // The query becomes the exact name, so Discover outlines the barangay.
  function pickBarangay(name: string) {
    setSearchedPlace(null);
    onQueryChange(name);
    goTo("/discover");
  }

  // A hit already shown as a listing or barangay is not repeated here.
  const shownNames = new Set(
    [...results.places, ...results.businesses, ...results.barangays].map((r) => r.name.trim().toLowerCase()),
  );
  const visibleMapHits = mapHits.filter((hit) => !hit.name || !shownNames.has(hit.name.trim().toLowerCase()));

  function pickMapPlace(hit: PlaceResult) {
    const name = hit.name ?? hit.address;
    setSearchedPlace({ name, coordinates: hit.location });
    onQueryChange(name);
    goTo("/discover");
  }

  const trimmed = query.trim();
  const showPanel = open && trimmed.length > 0;

  // One line under the bar while listening, uploading, or after a failure.
  // Same panel style as the results, and never at the same time as them.
  let voiceNote: string | null = voice.error;
  if (voice.status === "recording") voiceNote = "Listening…";
  if (voice.status === "transcribing") voiceNote = "Working out what you said…";
  if (offlineTap && !online) voiceNote = NEEDS_CONNECTION;
  const showVoiceNote = voiceNote !== null && !showPanel;

  function handleMicClick() {
    if (!online) {
      setOfflineTap(true);
      return;
    }
    if (voice.status === "recording") {
      voice.stop();
      return;
    }
    void voice.start();
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          voice.clearError();
          setOfflineTap(false);
          onQueryChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Lakbay Pasig"
        aria-label="Search"
        className={voiceSupported ? "pl-9 pr-11" : "pl-9"}
      />
      {voiceSupported && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleMicClick}
          disabled={voice.status === "transcribing"}
          aria-disabled={!online || undefined}
          aria-label={voice.status === "recording" ? "Stop recording" : "Search by voice"}
          title={voice.status === "recording" ? "Stop recording" : "Search by voice"}
          className={`absolute right-0 top-0 h-9 w-9 text-muted-foreground${online ? "" : " opacity-50"}`}
        >
          {voice.status === "idle" && <Microphone className="h-4 w-4" />}
          {voice.status === "recording" && (
            <Stop
              weight="fill"
              className="h-4 w-4 text-destructive transition-transform duration-100"
              style={{ transform: `scale(${1 + voice.level * 0.15})` }}
            />
          )}
          {voice.status === "transcribing" && <CircleNotch className="h-4 w-4 animate-spin" />}
        </Button>
      )}

      {showVoiceNote && (
        <output className="absolute inset-x-0 top-full z-50 mt-1 rounded-md border border-border bg-popover px-4 py-3 text-sm text-muted-foreground shadow-md">
          {voiceNote}
        </output>
      )}

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {loading && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <SquareLoader size="xs" />
              Searching…
            </p>
          )}

          {!loading && !hasAnyResults(results) && !mapLoading && visibleMapHits.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No results for &quot;{trimmed}&quot;.
            </p>
          )}

          {!loading && results.barangays.length > 0 && (
            <ResultGroup label="Barangays">
              {results.barangays.map((barangay) => (
                <ResultRow
                  key={barangay.name}
                  title={barangay.name}
                  subtitle="Barangay"
                  onClick={() => pickBarangay(barangay.name)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.places.length > 0 && (
            <ResultGroup label="Places">
              {results.places.map((place) => (
                <ResultRow
                  key={place.id}
                  title={place.name}
                  subtitle={place.category}
                  onClick={() => goTo(`/discover/place/${place.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.businesses.length > 0 && (
            <ResultGroup label="Businesses">
              {results.businesses.map((business) => (
                <ResultRow
                  key={business.id}
                  title={business.name}
                  subtitle={business.category}
                  badge={<VerificationBadge status={business.verification_status} />}
                  onClick={() => goTo(`/discover/business/${business.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.items.length > 0 && (
            <ResultGroup label="Items">
              {results.items.slice(0, ITEM_SHOW_LIMIT).map((item) => (
                <ItemRow
                  key={item.id}
                  name={item.name}
                  price={item.price}
                  photoUrl={item.photoUrl}
                  businessName={item.businessName}
                  badge={<VerificationBadge status={item.verification_status} />}
                  onClick={() => goTo(`/discover/business/${item.businessId}?tab=items&item=${item.id}`)}
                />
              ))}
              {results.items.length > ITEM_SHOW_LIMIT && (
                <li>
                  <button
                    type="button"
                    onClick={() => goTo("/discover")}
                    className="flex min-h-12 w-full items-center px-4 text-left text-sm font-semibold hover:bg-muted"
                  >
                    View all
                  </button>
                </li>
              )}
            </ResultGroup>
          )}

          {!loading && results.trails.length > 0 && (
            <ResultGroup label="Trails">
              {results.trails.map((trail) => (
                <ResultRow
                  key={trail.id}
                  title={trail.name}
                  subtitle={trail.theme}
                  badge={trail.personal ? <Badge variant="secondary">Yours</Badge> : undefined}
                  onClick={() => goTo(`/trails/${trail.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.events.length > 0 && (
            <ResultGroup label="Events">
              {results.events.map((event) => (
                <ResultRow
                  key={event.id}
                  title={event.title}
                  subtitle={event.category}
                  onClick={() => goTo(`/events/${event.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.fiestas.length > 0 && (
            <ResultGroup label="Fiestas">
              {results.fiestas.map((fiesta) => (
                <ResultRow
                  key={fiesta.id}
                  title={fiesta.name}
                  subtitle={fiesta.date_label}
                  onClick={() => goTo(`/fiestas/${fiesta.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && visibleMapHits.length > 0 && (
            <ResultGroup label="On the map">
              {visibleMapHits.map((hit) => (
                <ResultRow
                  key={`${hit.location.latitude},${hit.location.longitude}`}
                  title={hit.name ?? hit.address}
                  subtitle={hit.name ? hit.address : null}
                  onClick={() => pickMapPlace(hit)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && mapLoading && hasAnyResults(results) && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <SquareLoader size="xs" />
              Looking on the map…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
