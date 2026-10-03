import { supabase } from "./supabase";
import { barangayOf, type BarangayFeature } from "./barangay";

// Fiestas (migrations 0044 and 0045). Permanent reference data, not news:
// "Ano yung fiesta sa Buting?" is a lookup. See decision-log.md entry #37.

// The place category whose page carries a Fiesta tab, and which the Reports
// heatmap skips (0045). Matched by name, so renaming the category in
// Categories needs this constant and report_points() updated together.
export const BARANGAY_HALL_CATEGORY = "Barangay Hall";

// Same 30 names as fiesta_barangays' check constraint (0044) and
// properties.name in public/data/pasig-barangays.geojson. A second copy on
// purpose: the admin picker needs only the names, and fetching the whole
// boundary file for them would be wasteful. Change all three together.
export const BARANGAYS = [
  "Bagong Ilog", "Bagong Katipunan", "Bambang", "Buting", "Caniogan",
  "Dela Paz", "Kalawaan", "Kapasigan", "Kapitolyo", "Malinao",
  "Manggahan", "Maybunga", "Oranbo", "Palatiw", "Pinagbuhatan",
  "Pineda", "Rosario", "Sagad", "San Antonio", "San Joaquin",
  "San Jose", "San Miguel", "San Nicolas", "Santa Cruz", "Santa Rosa",
  "Santo Tomas", "Santolan", "Sumilang", "Ugong", "Santa Lucia",
] as const;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// What a resident sees: published rows only, with their barangay tags.
export interface PublicFiesta {
  id: string;
  name: string;
  patron_saint: string | null;
  community: string | null;
  month: number | null;
  date_label: string;
  description: string | null;
  history: string | null;
  related_place_id: string | null;
  barangays: string[];
}

const PUBLIC_COLUMNS =
  "id, name, patron_saint, community, month, date_label, description, history, related_place_id";

type FiestaRow = Omit<PublicFiesta, "barangays"> & {
  fiesta_barangays?: { barangay: string }[] | null;
};

function toPublicFiesta(row: FiestaRow): PublicFiesta {
  const { fiesta_barangays, ...rest } = row;
  return { ...rest, barangays: (fiesta_barangays ?? []).map((b) => b.barangay).sort() };
}

// One published fiesta by id. fiestas_select_staff has no published check
// (same trap home-query.ts documents for events), so .eq("published", true)
// is required here, not just defensive.
export async function fetchPublishedFiesta(id: string): Promise<PublicFiesta | null> {
  const { data, error } = await supabase
    .from("fiestas")
    .select(`${PUBLIC_COLUMNS}, fiesta_barangays(barangay)`)
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();
  if (error || !data) return null;
  return toPublicFiesta(data as FiestaRow);
}

// Published fiestas tagged with one barangay, in month then start-day order
// (start_date, 0044, is only a sort key here; date_label is what is shown). Two plain
// queries instead of an embed filter, same reasoning global-search.ts gives
// for searchItems: chained embed filters are what PostgREST answers 400 to.
export async function fetchPublishedFiestasForBarangay(barangay: string): Promise<PublicFiesta[]> {
  const { data: tags, error: tagError } = await supabase
    .from("fiesta_barangays")
    .select("fiesta_id")
    .eq("barangay", barangay);
  if (tagError) throw tagError;
  const ids = (tags ?? []).map((t) => t.fiesta_id as string);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("fiestas")
    .select(`${PUBLIC_COLUMNS}, fiesta_barangays(barangay)`)
    .in("id", ids)
    .eq("published", true)
    .order("month", { ascending: true, nullsFirst: false })
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as FiestaRow[]).map(toPublicFiesta);
}

// Which barangay a pin falls in, computed on read from the static boundary
// file (decision #21), so a Barangay Hall page needs no stored link to its
// barangay. The file is fetched once and kept for the session.
const BOUNDARY_URL = "/data/pasig-barangays.geojson";
let featuresPromise: Promise<BarangayFeature[]> | null = null;

function loadBarangayFeatures(): Promise<BarangayFeature[]> {
  if (!featuresPromise) {
    featuresPromise = fetch(BOUNDARY_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load barangay boundaries.");
        return res.json();
      })
      .then((json) => json.features as BarangayFeature[])
      .catch((err: unknown) => {
        featuresPromise = null;
        throw err;
      });
  }
  return featuresPromise;
}

export async function barangayForPin(lat: number, lng: number): Promise<string | null> {
  const features = await loadBarangayFeatures();
  return barangayOf(lat, lng, features);
}
