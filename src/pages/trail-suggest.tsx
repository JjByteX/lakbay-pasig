import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MagnifyingGlass, MapPin, Sparkle } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { usePageTitle } from "@/lib/page-title";
import { supabase } from "@/lib/supabase";
import { PASIG_BOUNDS } from "@/lib/map-style";
import { GeocodeError, searchPlaces, type PlaceResult } from "@/lib/geocode";
import { minutesToTime } from "@/lib/hours";
import { checkStart, type HoursTag, type PlannedStop } from "@/lib/itinerary";
import { suggestTrip, type SuggestedTrip } from "@/lib/itinerary-data";
import { PersonalTrailError, createPersonalTrail, fetchLocationsWithEntries } from "@/lib/personal-trails";
import { itemKey } from "@/lib/recommendations";
import type { TravelMode } from "@/lib/directions";
import type { Coordinates } from "@/lib/discover-query";
import { CategoryChipGroup, useCategoryNames } from "@/components/category-chip-group";
import { useUserLocation } from "@/components/public/public-shell";
import { PageContainer } from "@/components/public/page-container";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";

const HOUR_OPTIONS = [2, 3, 4, 6] as const;
const MODE_OPTIONS: { mode: TravelMode; label: string }[] = [
  { mode: "foot", label: "Walk" },
  { mode: "bike", label: "Bike" },
  { mode: "car", label: "Car" },
];
const TRAIL_NAME = "Suggested trail";

const TAG_LABEL: Record<HoursTag, string> = {
  open: "Open",
  closes_soon: "Closes soon",
  hours_not_confirmed: "Hours not confirmed",
};

// Asia/Manila is UTC+8 all year. "HH:mm" today on that clock, as a Date. An
// empty value means now.
function startMomentFrom(hhmm: string): Date {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return new Date();
  const [hours, minutes] = hhmm.split(":").map(Number);
  const manilaNow = new Date(Date.now() + 8 * 3_600_000);
  return new Date(
    Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate(), hours - 8, minutes)
  );
}

function durationLabel(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function timeLabel(minutes: number): string {
  return minutesToTime(Math.round(minutes) % 1440);
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}>) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={option.value === value ? "default" : "outline"}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

type StartChoice = { source: "location" } | { source: "address"; label: string; point: Coordinates } | null;

function AddressSearch({
  onPick,
}: Readonly<{ onPick: (label: string, point: Coordinates) => void }>) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (searching || !text.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchPlaces(text));
      setSearched(true);
    } catch (err) {
      setError(err instanceof GeocodeError ? err.message : "Couldn't search for that address. Try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={text}
          placeholder="Address or landmark in Pasig"
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Search address"
          loading={searching}
          onClick={() => void handleSearch()}
        >
          <MagnifyingGlass className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {searched && results.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">Nothing found inside Pasig. Try another name.</p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {results.map((result) => {
            const label = result.name && result.name !== result.address ? `${result.name}, ${result.address}` : result.address;
            return (
              <li key={`${result.location.latitude},${result.location.longitude}`}>
                <button
                  type="button"
                  className="w-full p-3 text-left text-sm text-foreground hover:bg-muted"
                  onClick={() => {
                    onPick(label, result.location);
                    setResults([]);
                  }}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StartPicker({
  choice,
  hasLocation,
  onChoose,
}: Readonly<{ choice: StartChoice; hasLocation: boolean; onChoose: (choice: StartChoice) => void }>) {
  const [searching, setSearching] = useState(false);
  const usingLocation = choice?.source === "location";
  return (
    <div className="flex flex-col gap-2">
      <Label>Start point</Label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={usingLocation ? "default" : "outline"}
          aria-pressed={usingLocation}
          onClick={() => {
            setSearching(false);
            onChoose({ source: "location" });
          }}
        >
          <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
          My location
        </Button>
        <Button
          type="button"
          size="sm"
          variant={choice?.source === "address" || searching ? "default" : "outline"}
          aria-pressed={choice?.source === "address" || searching}
          onClick={() => setSearching(true)}
        >
          Search an address
        </Button>
      </div>
      {usingLocation && !hasLocation && (
        <p className="text-xs text-muted-foreground">
          Your location isn&apos;t available yet. Allow location access, or search an address instead.
        </p>
      )}
      {choice?.source === "address" && <p className="text-sm text-foreground">{choice.label}</p>}
      {(searching || choice?.source === "address") && (
        <AddressSearch
          onPick={(label, point) => {
            setSearching(false);
            onChoose({ source: "address", label, point });
          }}
        />
      )}
    </div>
  );
}

function StopRow({
  stop,
  index,
  hasSecret,
  pending,
}: Readonly<{ stop: PlannedStop; index: number; hasSecret: boolean; pending: boolean }>) {
  const { candidate } = stop;
  return (
    <li className="flex items-start gap-3 p-3">
      <span className="w-5 shrink-0 pt-0.5 text-sm font-semibold text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{candidate.name}</span>
        <span className="text-xs text-muted-foreground">
          Arrive {timeLabel(stop.arriveMinutes)} · {TAG_LABEL[stop.tag]} · {stop.legKm.toFixed(1)} km from the previous
          stop
        </span>
        {stop.waitMinutes > 0 && (
          <span className="text-xs text-muted-foreground">
            Opens shortly after you arrive, plan to wait about {Math.round(stop.waitMinutes)} min.
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {hasSecret && <Badge variant="default">Has a secret</Badge>}
        {pending && <Badge variant="outline">Pending CATO review</Badge>}
        <Badge variant="secondary">{candidate.kind === "place" ? "Place" : "Business"}</Badge>
      </div>
    </li>
  );
}

function Preview({
  trip,
  secretIds,
  saving,
  saveError,
  onSave,
}: Readonly<{
  trip: SuggestedTrip;
  secretIds: Set<string>;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
}>) {
  const { itinerary, roadChecked, pendingKeys } = trip;
  if (itinerary.stops.length === 0) {
    return (
      <EmptyState icon={MapPin}>
        No stops fit these settings. Try more time, another start point, or a different travel mode.
      </EmptyState>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Your suggested trail</h2>
        <p className="text-xs text-muted-foreground">
          {itinerary.stops.length} {itinerary.stops.length === 1 ? "stop" : "stops"} ·{" "}
          {durationLabel(itinerary.totalMinutes)} · {itinerary.totalKm.toFixed(1)} km
        </p>
        <p className="text-xs text-muted-foreground">
          A suggestion, not an official CATO trail.
          {roadChecked ? "" : " Times are straight-line estimates because road routing was unavailable."}
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {itinerary.stops.map((stop, index) => (
          <StopRow
            key={stop.candidate.key}
            stop={stop}
            index={index}
            hasSecret={secretIds.has(stop.candidate.id)}
            pending={pendingKeys.has(itemKey(stop.candidate))}
          />
        ))}
      </ol>
      <div className="flex flex-col gap-1">
        <Button type="button" onClick={onSave} disabled={saving} loading={saving}>
          {saving ? "Saving…" : "Save as my trail"}
        </Button>
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      </div>
    </section>
  );
}

// The Suggest button's label: busy, ready to plan again, or the first plan.
function generateLabel(generating: boolean, hasTrip: boolean): string {
  if (generating) return "Planning…";
  return hasTrip ? "Plan again" : "Suggest a trail";
}

/**
 * The itinerary generator (docs: Lakbay_Pasig_Itinerary_Generator_Plan.md).
 * Time, start point, start time, travel mode and interests are per-trip inputs.
 * Generate reads and plans (suggestTrip) and only previews: regenerating
 * replaces the preview and writes nothing. Only "Save as my trail" writes, as a
 * private trail in the generator's own order (createPersonalTrail keeps the
 * order it is given). It is a public route, since a guest can preview and only
 * saving needs sign-in; the builder behind /trails/new is signed-in only.
 *
 * Interests start from profiles.preferred_categories when there are some. If
 * the person has none saved, "Save these to my profile" writes the same
 * column onboarding writes. A guest's picks live in this page only.
 */
export default function TrailSuggestPage() {
  usePageTitle("Suggest a trail");
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { session, profile, refreshProfile } = useAuth();
  const { openAuth } = useAuthModal();
  const { userLocation } = useUserLocation();
  const userId = session?.user.id ?? null;
  const { placeList, businessList } = useCategoryNames(true);

  const [hours, setHours] = useState<(typeof HOUR_OPTIONS)[number]>(3);
  const [mode, setMode] = useState<TravelMode>("foot");
  const [startTime, setStartTime] = useState("");
  const [startChoice, setStartChoice] = useState<StartChoice>({ source: "location" });
  const [interests, setInterests] = useState<string[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [secretIds, setSecretIds] = useState<Set<string>>(new Set());

  const [generating, setGenerating] = useState(false);
  const [trip, setTrip] = useState<SuggestedTrip | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedCategories = profile?.preferred_categories ?? [];

  // Once, when the profile arrives: start the chips from the saved interests.
  useEffect(() => {
    if (prefilled || !profile) return;
    setInterests(profile.preferred_categories ?? []);
    setPrefilled(true);
  }, [profile, prefilled]);

  // Which places and businesses hold a secret, for the display mark only. A
  // failed read just means no marks.
  useEffect(() => {
    fetchLocationsWithEntries()
      .then(setSecretIds)
      .catch(() => setSecretIds(new Set()));
  }, []);

  function toggleInterest(name: string) {
    setInterests((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]));
  }

  async function handleSaveInterests() {
    if (!userId || interests.length === 0) return;
    const { error } = await supabase.from("profiles").update({ preferred_categories: interests }).eq("id", userId);
    if (error) {
      setFormError("Couldn't save your interests. Try again.");
      return;
    }
    setProfileSaved(true);
    await refreshProfile();
  }

  async function handleGenerate() {
    if (generating) return;
    const point = startChoice?.source === "address" ? startChoice.point : userLocation;
    const check = checkStart(point, PASIG_BOUNDS);
    if (!check.ok) {
      setFormError(check.message);
      return;
    }
    setGenerating(true);
    setFormError(null);
    setSaveError(null);
    try {
      setTrip(
        await suggestTrip({
          start: check.start,
          budgetMinutes: hours * 60,
          mode,
          startTime: startMomentFrom(startTime),
          interests,
          userId,
        })
      );
    } catch {
      setFormError("Couldn't plan a trail. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!trip || saving) return;
    if (!userId) {
      openAuth("login");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const stops = trip.itinerary.stops.map((s) => ({ type: s.candidate.kind, id: s.candidate.id }));
      const id = await createPersonalTrail(userId, TRAIL_NAME, stops);
      navigate(`/trails/${id}`, { replace: true });
    } catch (err) {
      setSaveError(
        err instanceof PersonalTrailError ? err.message : "Couldn't save your trail. Check your connection and try again."
      );
      setSaving(false);
    }
  }

  const showSaveInterests = !!userId && savedCategories.length === 0 && interests.length > 0 && !profileSaved;

  return (
    <PageContainer width="form" className="gap-6">
      {isMobile && (
        <div className="flex items-center">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Suggest a trail for me</h1>
        <p className="text-xs text-muted-foreground">
          Pick your time, start and interests. We plan stops that are open when you arrive.
        </p>
      </div>

      <Segmented
        label="Time available"
        options={HOUR_OPTIONS.map((h) => ({ value: h, label: `${h} hours` }))}
        value={hours}
        onChange={setHours}
      />
      <Segmented
        label="Travel mode"
        options={MODE_OPTIONS.map((o) => ({ value: o.mode, label: o.label }))}
        value={mode}
        onChange={setMode}
      />
      <StartPicker choice={startChoice} hasLocation={userLocation !== null} onChoose={setStartChoice} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="suggest-start-time">Start time</Label>
        <Input id="suggest-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <p className="text-xs text-muted-foreground">Today, Manila time. Leave empty to start now.</p>
      </div>

      <div className="flex flex-col gap-3">
        <Label>Interests</Label>
        <CategoryChipGroup label="Places" list={placeList} selected={interests} onToggle={toggleInterest} />
        <CategoryChipGroup label="Businesses" list={businessList} selected={interests} onToggle={toggleInterest} />
        {showSaveInterests && (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => void handleSaveInterests()}>
            Save these to my profile
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Button type="button" onClick={() => void handleGenerate()} disabled={generating} loading={generating}>
          <Sparkle className="mr-1 h-4 w-4" aria-hidden="true" />
          {generateLabel(generating, !!trip)}
        </Button>
        {formError && <p className="text-xs text-destructive">{formError}</p>}
      </div>

      {trip && (
        <Preview
          trip={trip}
          secretIds={secretIds}
          saving={saving}
          saveError={saveError}
          onSave={() => void handleSave()}
        />
      )}
    </PageContainer>
  );
}
