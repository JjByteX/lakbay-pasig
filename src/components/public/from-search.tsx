import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";
import type { CustomFrom } from "@/components/public/public-shell";
import { GeocodeError, searchPlaces, type PlaceResult } from "@/lib/geocode";
import { cn } from "@/lib/utils";

// directions-distance-and-from-phases.md Phase 4.1: the custom From's
// search field, opened from the directions panel's From row. Google Maps'
// own shape: one field edited in place, with a map option beside typing
// (directions-distance-and-from-plan.md, References).
//
// Deliberately not an import of location-picker.tsx, and not a copy of it
// (plan, "Open question resolved"): the picker is a form field with its
// own map, label, char count and an import cycle through
// business-fields.tsx. This file owns only search state and reuses
// searchPlaces / GeocodeError / PlaceResult from geocode.ts unchanged, so
// every geocoder call still goes through that one file (decision #21).
// What is copied from the picker is its combobox behavior (Enter searches
// or picks, Up and Down wrap, aria-activedescendant) and its result row
// markup, since those are UI conventions and not logic worth sharing yet.
//
// ponytail: result rows are copied from location-picker.tsx. Extract a
// shared PlaceResultList if a third consumer appears.

// Only reachable if searchPlaces throws something other than a
// GeocodeError. Same wording as the picker's own SEARCH_FAILED.
const SEARCH_FAILED = "Couldn't search for that address, try again.";

type SearchStatus = "idle" | "searching" | "done" | "error";

interface FromSearchProps {
  // A search pick. The parent closes the field and hands the From to the
  // shell.
  onSelect: (from: CustomFrom) => void;
  // "Choose on map". Phase 5 wires the actual map tap mode, so in Phase 4
  // this only reaches the shell's handlePickFromOnMap, which turns the
  // flag on and does nothing visible beyond the panel's prompt.
  onPickOnMap: () => void;
  // "Your location" row, back to the live GPS fix.
  onUseMyLocation: () => void;
  // X, Escape, or a tap outside the field. Closes the field only.
  onClose: () => void;
  // Whether a custom From is currently set. Drives whether the "Your
  // location" row is shown, since it is a no-op when From is already live.
  hasCustomFrom: boolean;
}

// One row style shared by "Your location" and "Choose on map" so the three
// kinds of row (those two plus the search results below) read as one list.
// min-h-10 is the 40px tap target the picker's own search button uses.
const ROW_CLASS =
  "flex min-h-10 w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

export function FromSearch({
  onSelect,
  onPickOnMap,
  onUseMyLocation,
  onClose,
  hasCustomFrom,
}: Readonly<FromSearchProps>) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Request counter: only the newest search may apply its result, so a
  // slow older response can never overwrite a newer one. Same idea and
  // name as location-picker.tsx's searchSeq.
  const searchSeq = useRef(0);

  // useDismissOnOutsideOrEscape attaches its listeners once, on mount, and
  // never re-reads its callback (its own comment says both current callers
  // pass a stable setState setter). onClose here is a fresh closure from
  // the panel on every render, so it goes through a ref: the hook holds a
  // stable wrapper and the wrapper always calls the newest onClose.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useDismissOnOutsideOrEscape(containerRef, () => onCloseRef.current());

  // The field replaces a button the person just tapped, so focus goes
  // straight into it. Without this, a keyboard or screen reader user would
  // be left on an element that no longer exists.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ponytail: search runs on Enter or the search button only, no debounce
  // and no as-you-type. Keeps to Photon's fair-use terms (decision #21).
  // Add as-you-type if Photon stays the provider and this feels slow.
  async function runSearch() {
    const text = query.trim();
    if (!text) return;
    const seq = ++searchSeq.current;
    setSearchedQuery(text);
    setSearchStatus("searching");
    setActiveIndex(-1);
    try {
      // A hit with neither a name nor an address part would render as a
      // blank row. searchPlaces already limits to 5, so no slicing here.
      const found = (await searchPlaces(text)).filter((r) => r.name || r.address);
      if (seq !== searchSeq.current) return;
      setResults(found);
      setSearchStatus("done");
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setSearchError(err instanceof GeocodeError ? err.message : SEARCH_FAILED);
      setSearchStatus("error");
    }
  }

  // Picking never happens on its own: 3 of 8 seeded searches put the top
  // hit far from the seeded point (decision #21). The label uses the
  // place's name when it has one, since "Pasig City Museum" is recognized
  // faster than its street line. Coordinates are passed through as
  // returned: rounding to 6 decimals is the picker's storage rule, and
  // nothing is stored here.
  function pick(result: PlaceResult) {
    onSelect({ label: result.name ?? result.address, coordinates: result.location });
  }

  const showList = searchStatus === "done" && results.length > 0;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const active = showList ? results[activeIndex] : undefined;
      if (active) pick(active);
      else void runSearch();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && showList) {
      e.preventDefault();
      const count = results.length;
      const down = e.key === "ArrowDown";
      // Wraps at both ends. From no selection, Up lands on the last row.
      setActiveIndex((i) => {
        if (down) return (i + 1) % count;
        return i <= 0 ? count - 1 : i - 1;
      });
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {/* The input row. The X sits beside the field, not inside it, so it
          never competes with the Search button that lives inside. Same X
          icon and the same 36px circle as the panel's own Cancel, so the
          two read as one family. It only closes this field: the panel's
          Cancel ends the whole Directions session. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            role="combobox"
            aria-label="Starting point"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={showList ? listId : undefined}
            aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            className="pr-10"
            placeholder="Search a place or address"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
          />
          {/* 40px tap target over a 36px input, ghost so the extra
              height never shows. Same trick as the picker's button.
              Disabled while searching or when the field is empty, which
              is the only signal an empty query gets (Disabled rule). */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 h-10 w-10 -translate-y-1/2"
            aria-label="Search address"
            onClick={() => void runSearch()}
            disabled={searchStatus === "searching" || !query.trim()}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <button
          type="button"
          aria-label="Close starting point search"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="h-5 w-5 shrink-0" />
        </button>
      </div>

      {/* Rows and results share one scroll region capped at 40vh, so on a
          small phone with the keyboard up they scroll inside the panel
          instead of pushing it past the fixed header. The panel is
          bottom anchored (fixed bottom-16 on mobile, absolute bottom-6
          on desktop), so growing here grows the card upward, never down
          into the bottom nav. rounded-lg, not the panel's rounded-2xl,
          since this is an inner container, not a prominent surface. */}
      <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground">
        {hasCustomFrom && (
          <button type="button" className={ROW_CLASS} onClick={onUseMyLocation}>
            <LocateFixed className="h-4 w-4 shrink-0 text-muted-foreground" />
            Your location
          </button>
        )}
        <button type="button" className={ROW_CLASS} onClick={onPickOnMap}>
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          Choose on map
        </button>

        {/* Idle renders nothing: no results block until a search runs. */}
        {searchStatus === "searching" && (
          <output className="block px-4 py-3 text-sm text-muted-foreground">Searching…</output>
        )}
        {searchStatus === "error" && (
          <output className="block px-4 py-3 text-sm text-destructive">{searchError}</output>
        )}
        {searchStatus === "done" && results.length === 0 && (
          <output className="block px-4 py-3 text-sm text-muted-foreground">
            No results for &quot;{searchedQuery}&quot;. Choose on map instead.
          </output>
        )}
        {showList && (
          <ul id={listId} role="listbox" className="flex flex-col py-1">
            {results.map((r, i) => (
              <li
                key={`${r.name ?? ""}|${r.address}|${r.location.latitude},${r.location.longitude}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                tabIndex={-1}
                onClick={() => pick(r)}
                onKeyDown={(e) => {
                  // Belt and suspenders: the input's own onKeyDown
                  // already handles Enter and arrows for the whole
                  // listbox. This only fires if a row itself ever
                  // gets focus directly.
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(r);
                  }
                }}
                className={cn(
                  "flex min-h-10 cursor-pointer flex-col justify-center gap-1 px-4 py-2 text-left hover:bg-muted",
                  i === activeIndex && "bg-muted",
                )}
              >
                <span className="break-words text-sm font-semibold text-foreground">{r.name ?? r.address}</span>
                {r.name && r.name !== r.address && (
                  <span className="break-words text-xs text-muted-foreground">{r.address}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
