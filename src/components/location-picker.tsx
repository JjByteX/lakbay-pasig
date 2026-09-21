import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import maplibregl from "maplibre-gl";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// FieldLabel and CharCount live in business-fields.tsx, which imports this
// picker, so the two files import each other. Safe: each side only uses
// the other's exports while rendering, never at module load, and both are
// function declarations. Moving the two out would touch every file that
// imports them, a bigger change than this cycle costs.
import { CharCount, FieldLabel } from "@/components/business/business-fields";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";
import type { Coordinates } from "@/lib/discover-query";
import { GeocodeError, reverseGeocode, searchPlaces, type PlaceResult } from "@/lib/geocode";
import { DEFAULT_ZOOM, LATTE, MOCHA, PASIG_CENTER, buildStyle } from "@/lib/map-style";
import { cn } from "@/lib/utils";

// location-field-phases.md Phase 3: one Address field that also searches, a
// draggable pin on a map, and Find my location. The pin is the source of
// truth, the address is a label filled from it (location-field-plan.md).
// Serves the admin place form, the admin business form and both vendor
// forms, so it owns no card: it sits inside the card its form already has.
//
// Contract: address and coordinates go in, one onChange hands both back
// together, so a form never holds a half updated pair. Every coordinate is
// rounded to 6 decimals (about 0.1 m) before it leaves this file.

const ADDRESS_MAX = 300;

// Zoom used whenever the map centers on a pin (a saved row, a search pick,
// Find my location). DEFAULT_ZOOM 14 is for the empty map over Pasig, too
// coarse to judge whether a pin sits on the right building.
const PIN_ZOOM = 17;

// Discover's attribution string (discover-map.tsx) minus the OSRM and
// FOSSGIS clauses, which credit routing. No route is drawn here. One
// control, same OSM and OpenFreeMap credit, same "fix the map" link. Photon
// needs no extra credit (location-field-plan.md, Check results 4).
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, <a href="https://openfreemap.org">OpenFreeMap</a>, <a href="https://www.openstreetmap.org/fixthemap">fix the map</a>';

// Copied verbatim from discover-map.tsx's MapCornerControls handleLocate.
// Copying three strings is a smaller diff than extracting them and editing
// Discover, whose file this phase leaves alone.
const LOCATE_UNSUPPORTED = "Location isn't supported on this device.";
const LOCATE_DENIED = "Location access was denied. Enable it in your browser settings to use this.";
const LOCATE_FAILED = "Couldn't get your location. Try again.";

// Only reachable if searchPlaces throws something other than a GeocodeError.
const SEARCH_FAILED = "Couldn't search for that address, try again.";
const LOOKUP_FAILED = "Couldn't fill in the address for this pin, type it in.";

export interface LocationValue {
  address: string;
  coordinates: Coordinates | null;
}

interface LocationPickerProps {
  address: string;
  coordinates: Coordinates | null;
  onChange: (next: LocationValue) => void;
  // The place and business forms word these differently.
  label: string;
  placeholder: string;
  requiredMarker?: boolean;
  // The business forms show a help tooltip on the label, the place form
  // does not. Present renders FieldLabel, absent renders a plain Label.
  help?: string;
}

type SearchStatus = "idle" | "searching" | "done" | "error";
type LocateStatus = "idle" | "loading" | "error";

function roundCoords(c: Coordinates): Coordinates {
  return { latitude: Number(c.latitude.toFixed(6)), longitude: Number(c.longitude.toFixed(6)) };
}

export function LocationPicker({
  address,
  coordinates,
  onChange,
  label,
  placeholder,
  requiredMarker = false,
  help,
}: Readonly<LocationPickerProps>) {
  const listId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [open, setOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [locateStatus, setLocateStatus] = useState<LocateStatus>("idle");
  const [locateError, setLocateError] = useState<string | null>(null);

  // Request counters: only the newest search or address lookup may apply
  // its result, so a slow older response can never overwrite a newer one.
  const searchSeq = useRef(0);
  const lookupSeq = useRef(0);
  // The last address this component filled in itself (search pick or pin
  // lookup). A pin move may refill the address only while it is empty or
  // still equals this, so a drag never overwrites typed text.
  const lastFilled = useRef<string | null>(null);
  // Set when the user moved the pin on the map, so the camera stays where
  // they put it. Left null for a search pick or Find my location, which
  // should bring the camera to the pin.
  const ownMove = useRef<Coordinates | null>(null);

  // Map events and async lookups outlive the render that created them.
  // They read the newest props here instead of a stale closure.
  const latest = useRef({ address, coordinates, onChange });
  useEffect(() => {
    latest.current = { address, coordinates, onChange };
  });

  useDismissOnOutsideOrEscape(fieldRef, () => setOpen(false));

  const lat = coordinates?.latitude ?? null;
  const lng = coordinates?.longitude ?? null;

  // Reverse lookup for a pin. Skipped outright when the address is typed
  // text, since the result could not be applied anyway. A null result (OSM
  // has nothing there) leaves the address alone and shows nothing, only a
  // failed request shows the line.
  const fillAddress = useCallback(async (at: Coordinates) => {
    const seq = ++lookupSeq.current;
    setLookupFailed(false);
    const canFill = () => {
      const current = latest.current.address;
      return current.trim() === "" || current === lastFilled.current;
    };
    if (!canFill()) return;
    try {
      const found = await reverseGeocode(at);
      if (seq !== lookupSeq.current || !found || !canFill()) return;
      lastFilled.current = found;
      const { coordinates: pin, onChange: emit } = latest.current;
      emit({ address: found, coordinates: pin });
    } catch {
      if (seq === lookupSeq.current && canFill()) setLookupFailed(true);
    }
  }, []);

  // A tap, a drag, or Find my location: pin moves, address stays as it is
  // until the lookup decides whether it may be refilled.
  const setPin = useCallback(
    (at: Coordinates, byMap: boolean) => {
      const pin = roundCoords(at);
      ownMove.current = byMap ? pin : null;
      const { address: current, onChange: emit } = latest.current;
      emit({ address: current, coordinates: pin });
      void fillAddress(pin);
    },
    [fillAddress],
  );

  // One maplibre instance, created on mount and removed on unmount, same
  // lifecycle shape as discover-map.tsx. Style comes from map-style.ts.
  //
  // ponytail: light or dark palette is read once here. Switching theme
  // while a form is open leaves this map on the old palette. Add
  // discover-map.tsx's MutationObserver if that shows up.
  //
  // ponytail: default gestures, so scrolling the wheel over the map zooms
  // it instead of the page. Add `cooperativeGestures: true` if that gets in
  // the way of scrolling a long form.
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const isDark = document.documentElement.classList.contains("dark");
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildStyle(isDark ? MOCHA : LATTE),
      center: [PASIG_CENTER.longitude, PASIG_CENTER.latitude],
      zoom: DEFAULT_ZOOM,
      attributionControl: { customAttribution: ATTRIBUTION },
    });
    mapRef.current = map;

    map.on("click", (e) => {
      // A drag that ends over the marker also fires a click on it, at the
      // cursor and not at the pin's tip. Ignore it or the pin jumps.
      if (markerRef.current?.getElement().contains(e.originalEvent.target as Node)) return;
      setPin({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }, true);
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [setPin]);

  // Keeps the marker and camera in step with the coordinates prop. Covers a
  // saved row arriving after mount, a search pick, Find my location and a
  // parent reset. No pin means no marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat === null || lng === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [lng, lat];
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
    } else {
      // Same approach as discover-map.tsx's markerElement: a Lucide icon
      // rendered to a static SVG string on a plain DOM element. `block`
      // stops the inline SVG adding a baseline gap under the tip.
      const el = document.createElement("div");
      el.className = "cursor-grab active:cursor-grabbing";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Map pin");
      el.innerHTML = renderToStaticMarkup(
        <MapPin className="block h-10 w-10 fill-primary stroke-card" aria-hidden="true" />,
      );
      // The icon's tip sits about 3px above its box bottom, so nudge the
      // box down and the tip lands exactly on the coordinate.
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 3], draggable: true })
        .setLngLat(lngLat)
        .addTo(map);
      marker.on("dragend", () => {
        const at = marker.getLngLat();
        setPin({ latitude: at.lat, longitude: at.lng }, true);
      });
      markerRef.current = marker;
    }
    const own = ownMove.current;
    if (own?.latitude !== lat || own?.longitude !== lng) {
      map.jumpTo({ center: lngLat, zoom: PIN_ZOOM });
    }
  }, [lat, lng, setPin]);

  // ponytail: search runs on Enter or the search button only, no debounce
  // and no as-you-type. Keeps to every provider's policy. Add as-you-type
  // if Photon stays the provider and this feels slow.
  async function runSearch() {
    const query = address.trim();
    if (!query) return;
    const seq = ++searchSeq.current;
    setSearchedQuery(query);
    setSearchStatus("searching");
    setActiveIndex(-1);
    setOpen(true);
    try {
      // A hit with neither a name nor an address part would render as a
      // blank row.
      const found = (await searchPlaces(query)).filter((r) => r.name || r.address);
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
  // hit far from the seeded point. A pick sets pin and address together and
  // counts as an auto fill, so a later drag may refill it, typed text still
  // stays protected.
  function pick(result: PlaceResult) {
    lookupSeq.current++;
    setLookupFailed(false);
    lastFilled.current = result.address;
    ownMove.current = null;
    setOpen(false);
    onChange({ address: result.address, coordinates: roundCoords(result.location) });
  }

  const showList = open && searchStatus === "done" && results.length > 0;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Never submits the surrounding form. On place form step 1 this
      // replaces Enter as Next for this field only.
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

  // ponytail: one read at default accuracy, decision-log #16 allows this
  // for a single action. A network fix can land far off, the drag corrects
  // it. Add enableHighAccuracy if vendors report far off pins.
  function locate() {
    if (!navigator.geolocation) {
      setLocateStatus("error");
      setLocateError(LOCATE_UNSUPPORTED);
      return;
    }
    setLocateStatus("loading");
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocateStatus("idle");
        setPin({ latitude: position.coords.latitude, longitude: position.coords.longitude }, false);
      },
      (err) => {
        setLocateStatus("error");
        setLocateError(err.code === err.PERMISSION_DENIED ? LOCATE_DENIED : LOCATE_FAILED);
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {help ? (
        <FieldLabel htmlFor="address" help={help} requiredMarker={requiredMarker}>
          {label}
        </FieldLabel>
      ) : (
        <Label htmlFor="address">
          {label}
          {requiredMarker ? " *" : ""}
        </Label>
      )}

      <div ref={fieldRef} className="relative">
        <Input
          id="address"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          className="pr-10"
          placeholder={placeholder}
          value={address}
          onChange={(e) => {
            setLookupFailed(false);
            setOpen(false);
            setActiveIndex(-1);
            onChange({ address: e.target.value, coordinates });
          }}
          onKeyDown={handleKeyDown}
          required
          maxLength={ADDRESS_MAX}
        />
        {/* 40px tap target over a 36px input, ghost so the extra height
            never shows. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 h-10 w-10 -translate-y-1/2"
          aria-label="Search address"
          onClick={() => void runSearch()}
          disabled={searchStatus === "searching" || !address.trim()}
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Plain absolutely positioned list, same pattern as
            global-search-bar.tsx, no Popover or Command primitive. Radius is
            rounded-lg (8px) per ux-ui-guidelines.md. */}
        {open && searchStatus !== "idle" && (
          <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
            {searchStatus === "searching" && (
              <output className="block px-4 py-3 text-sm text-muted-foreground">
                Searching…
              </output>
            )}
            {searchStatus === "error" && (
              <output className="block px-4 py-3 text-sm text-destructive">
                {searchError}
              </output>
            )}
            {searchStatus === "done" && results.length === 0 && (
              <output className="block px-4 py-3 text-sm text-muted-foreground">
                No results for &quot;{searchedQuery}&quot;. Place the pin on the map instead.
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
                    onClick={() => pick(r)}
                    onKeyDown={(e) => {
                      // Belt and suspenders: the input's own onKeyDown
                      // already handles Enter/arrows for the whole
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
        )}
      </div>
      <CharCount value={address} max={ADDRESS_MAX} />
      {lookupFailed && <p className="text-sm text-destructive">{LOOKUP_FAILED}</p>}

      {/* Fixed height (h-64, 256px) so the form never jumps as the map
          loads. Find my location sits top right, clear of the attribution
          at the bottom, with its error line beneath it. */}
      <div className="relative h-64 overflow-hidden rounded-lg border border-border">
        <div ref={mapContainerRef} className="h-full w-full" />
        <Button
          type="button"
          variant="outline"
          className="absolute right-2 top-2 z-10 h-10 gap-2 shadow"
          onClick={locate}
          disabled={locateStatus === "loading"}
        >
          <LocateFixed className={cn("h-4 w-4", locateStatus === "loading" && "animate-spin text-muted-foreground")} />
          Find my location
        </Button>
        {locateStatus === "error" && locateError && (
          <span className="absolute right-2 top-14 z-10 max-w-[calc(100%-1rem)] break-words rounded-lg border border-border bg-card px-3 py-2 text-right text-xs text-destructive shadow">
            {locateError}
          </span>
        )}
      </div>
    </div>
  );
}
