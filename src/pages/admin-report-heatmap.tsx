import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type GeoJSONSource } from "maplibre-gl";
import { MapTrifold } from "@phosphor-icons/react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportDownloadMenu } from "@/components/admin/report-download-menu";
import type { ReportTable } from "@/lib/report-files";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { usePageTitle } from "@/lib/page-title";
import { cn } from "@/lib/utils";
import { countByBarangay, type BarangayFeature, type BarangayCount, type ReportPoint } from "@/lib/barangay";
import { BASE_BOUNDS, LATTE, MOCHA, PASIG_BOUNDS, buildStyle } from "@/lib/map-style";

// reports-plan.md / reports-phases.md Phase 5.2. Choropleth: each barangay is
// shaded by its Places and/or Businesses count. Boundaries are one static
// GeoJSON loaded only here; points come from report_points() (migration
// 0043); barangay is computed on read in barangay.ts, never stored.

const BOUNDARY_URL = "/data/pasig-barangays.geojson";
const SOURCE = "report-barangays";
const FILL = "report-barangays-fill";
const MASK_SOURCE = "report-mask";
const MASK = "report-mask-fill";
const LINE = "report-barangays-line";
const HOVER_LINE = "report-barangays-hover";
const STEPS = 5;
// Opacity per step, index 0 (zero count) draws nothing. One hue, 5 steps.
const STEP_OPACITY = [0, 0.2, 0.38, 0.56, 0.74, 0.9];

type TypeFilter = "all" | "place" | "business";
type StatusFilter = "verified" | "pending";

const TYPE_LABEL: Record<TypeFilter, string> = { all: "All", place: "Places", business: "Businesses" };
const STATUS_LABEL: Record<StatusFilter, string> = { verified: "Verified", pending: "Pending" };

interface Row {
  name: string;
  verified: number;
  pending: number;
}

function rowFor(b: BarangayCount, type: TypeFilter): Row {
  const kinds = type === "all" ? [b.place, b.business] : [b[type]];
  return {
    name: b.name,
    verified: kinds.reduce((n, k) => n + k.verified, 0),
    pending: kinds.reduce((n, k) => n + k.pending, 0),
  };
}

// Equal steps from the max (reports-plan.md Ceilings). Zero stays step 0.
function stepOf(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(STEPS, Math.max(1, Math.ceil((count * STEPS) / max)));
}

function legendLabel(step: number, max: number): string {
  const lo = Math.floor((max * (step - 1)) / STEPS) + 1;
  const hi = Math.floor((max * step) / STEPS);
  if (hi < lo) return "–";
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

async function loadBoundaries(): Promise<BarangayFeature[]> {
  let res: Response;
  try {
    res = await fetch(BOUNDARY_URL);
  } catch {
    throw new Error("Could not load the barangay boundaries. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(`Could not load the barangay boundaries (HTTP ${res.status}).`);
  let json: { type?: string; features?: unknown };
  try {
    json = await res.json();
  } catch {
    // Vite's SPA fallback answers a missing file with index.html, not a 404.
    throw new Error("The barangay boundary file is missing or is not valid GeoJSON.");
  }
  if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    throw new Error("The barangay boundary file is not a GeoJSON FeatureCollection.");
  }
  return json.features as BarangayFeature[];
}

async function loadPoints(): Promise<ReportPoint[]> {
  const { data, error } = await supabase.rpc("report_points");
  if (error) throw new Error(`Could not load report data: ${error.message}`);
  return (data ?? []) as ReportPoint[];
}

export default function AdminReportHeatmapPage() {
  usePageTitle("Barangay heatmap");

  const [features, setFeatures] = useState<BarangayFeature[]>([]);
  const [points, setPoints] = useState<ReportPoint[]>([]);
  const [loading, setLoading] = useState(true);
  // Boundaries and points fail on their own, so a failed RPC still draws the
  // barangay outlines instead of a blank map.
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("verified");
  const [hovered, setHovered] = useState<string | null>(null);
  // Same `.dark` class the map style follows, so the legend swatch matches.
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const dataRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const maskRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const hoveredRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Could not load this report.");
    const boundaries = loadBoundaries().then(
      (v) => {
        if (!cancelled) setFeatures(v);
      },
      (e) => {
        if (!cancelled) setBoundaryError(messageOf(e));
      },
    );
    const rows = loadPoints().then(
      (v) => {
        if (!cancelled) setPoints(v);
      },
      (e) => {
        if (!cancelled) setPointsError(messageOf(e));
      },
    );
    Promise.all([boundaries, rows]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const counted = useMemo(() => countByBarangay(points, features), [points, features]);

  const { rows, max } = useMemo(() => {
    const all = counted.barangays.map((b) => rowFor(b, type));
    const peak = all.reduce((m, r) => Math.max(m, r[status]), 0);
    const sorted = [...all].sort((a, b) => b[status] - a[status] || a.name.localeCompare(b.name));
    return { rows: sorted, max: peak };
  }, [counted, type, status]);

  // The notes and the footer total follow the Type select, like the list.
  const noPin = useMemo(() => noteCounts(counted.noPin, type), [counted, type]);
  const noMatch = useMemo(() => noteCounts(counted.noMatch, type), [counted, type]);
  const totals = useMemo(
    () => ({
      verified: rows.reduce((n, r) => n + r.verified, 0),
      pending: rows.reduce((n, r) => n + r.pending, 0),
    }),
    [rows],
  );

  // Feature collection for the fill layer: selected count and step per
  // barangay, geometry untouched.
  const collection = useMemo<GeoJSON.FeatureCollection>(() => {
    const byName = new Map(rows.map((r) => [r.name, r]));
    return {
      type: "FeatureCollection",
      features: features.map((f) => {
        const count = byName.get(f.properties.name)?.[status] ?? 0;
        return {
          type: "Feature",
          properties: { name: f.properties.name, count, step: stepOf(count, max) },
          geometry: f.geometry,
        } as GeoJSON.Feature;
      }),
    };
  }, [features, rows, status, max]);

  // Everything outside Pasig, drawn in the map's background color so the
  // neighbouring cities (roads, labels) drop out. One polygon: a box around the
  // world with each barangay's outer ring cut out of it.
  const mask = useMemo<GeoJSON.FeatureCollection>(() => {
    if (features.length === 0) return { type: "FeatureCollection", features: [] };
    const holes: number[][][] = [];
    for (const f of features) {
      if (f.geometry.type === "Polygon") holes.push(f.geometry.coordinates[0]);
      else for (const poly of f.geometry.coordinates) holes.push(poly[0]);
    }
    const world = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...holes] } }],
    };
  }, [features]);

  // Adds the source and layers, or refreshes the data when they exist. A
  // theme switch calls setStyle, which drops them, so style.load re-runs this.
  function sync(map: maplibregl.Map) {
    if (!styleReadyRef.current) return;
    const existing = map.getSource(SOURCE) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(dataRef.current);
      (map.getSource(MASK_SOURCE) as GeoJSONSource | undefined)?.setData(maskRef.current);
      return;
    }
    const palette = document.documentElement.classList.contains("dark") ? MOCHA : LATTE;
    // Under the first label layer, so place names stay readable on the fill.
    const beforeId = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addSource(SOURCE, { type: "geojson", data: dataRef.current, promoteId: "name" });
    map.addLayer(
      {
        id: FILL,
        type: "fill",
        source: SOURCE,
        paint: {
          "fill-color": palette.mauve,
          "fill-opacity": ["match", ["get", "step"], 1, STEP_OPACITY[1], 2, STEP_OPACITY[2], 3, STEP_OPACITY[3], 4, STEP_OPACITY[4], 5, STEP_OPACITY[5], 0] as ExpressionSpecification,
        },
      },
      beforeId,
    );
    // The mask goes on top of the basemap, labels included, then the outlines
    // on top of the mask so the border line is not half covered.
    map.addSource(MASK_SOURCE, { type: "geojson", data: maskRef.current });
    map.addLayer({ id: MASK, type: "fill", source: MASK_SOURCE, paint: { "fill-color": palette.base, "fill-opacity": 1 } });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SOURCE,
      paint: { "line-color": palette.mauve, "line-width": 1.5, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: HOVER_LINE,
      type: "line",
      source: SOURCE,
      paint: {
        "line-color": palette.text,
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 0] as ExpressionSpecification,
      },
    });
    if (hoveredRef.current) map.setFeatureState({ source: SOURCE, id: hoveredRef.current }, { hover: true });
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const isDark = () => document.documentElement.classList.contains("dark");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(isDark() ? MOCHA : LATTE),
      bounds: PASIG_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      maxBounds: BASE_BOUNDS,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      // The credit sits with the legend instead (reports-plan.md, Credit).
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    map.on("style.load", () => {
      styleReadyRef.current = true;
      sync(map);
    });
    map.on("mousemove", FILL, (e) => {
      map.getCanvas().style.cursor = "pointer";
      setHovered((e.features?.[0]?.properties?.name as string | undefined) ?? null);
    });
    map.on("mouseleave", FILL, () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
    });
    // Tap: touch has no hover, so a tap picks the barangay, a tap elsewhere clears.
    map.on("click", (e) => {
      if (!map.getLayer(FILL)) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: [FILL] })[0];
      setHovered((hit?.properties?.name as string | undefined) ?? null);
    });

    const observer = new MutationObserver(() => {
      styleReadyRef.current = false;
      setDark(isDark());
      map.setStyle(buildStyle(isDark() ? MOCHA : LATTE));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
    // sync only reads refs, so the map is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit the view to the barangays once they load, then lock the map to that
  // view: it cannot zoom out past it or pan off it. Pasig is tall and narrow,
  // so the visible area at the fit zoom is wider than the barangays; the lock
  // uses the visible area, not the barangay extent, because a maxBounds
  // tighter than the viewport would force a zoom-in that crops the top and
  // bottom. Refits when the container changes size.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || features.length === 0) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const f of features) {
      const outers = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((poly) => poly[0]);
      for (const ring of outers) {
        for (const [lng, lat] of ring) {
          minLng = Math.min(minLng, lng);
          minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng);
          maxLat = Math.max(maxLat, lat);
        }
      }
    }
    function fit() {
      if (!map) return;
      map.setMaxBounds(BASE_BOUNDS);
      map.setMinZoom(0);
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 12, animate: false },
      );
      const view = map.getBounds();
      // 1% slack so rounding at the fit zoom does not trigger a zoom-in.
      const padLng = (view.getEast() - view.getWest()) * 0.01;
      const padLat = (view.getNorth() - view.getSouth()) * 0.01;
      map.setMaxBounds([
        [view.getWest() - padLng, view.getSouth() - padLat],
        [view.getEast() + padLng, view.getNorth() + padLat],
      ]);
      map.setMinZoom(map.getZoom() - 0.001);
    }
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(container);
    return () => observer.disconnect();
  }, [features]);

  useEffect(() => {
    dataRef.current = collection;
    maskRef.current = mask;
    if (mapRef.current) sync(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, mask]);

  useEffect(() => {
    const map = mapRef.current;
    const prev = hoveredRef.current;
    hoveredRef.current = hovered;
    if (!map || !styleReadyRef.current || !map.getSource(SOURCE)) return;
    if (prev) map.setFeatureState({ source: SOURCE, id: prev }, { hover: false });
    if (hovered) map.setFeatureState({ source: SOURCE, id: hovered }, { hover: true });
  }, [hovered]);

  const loadFailed = boundaryError !== null || pointsError !== null;
  const isEmpty = !loading && !loadFailed && points.length === 0;

  // What the download holds: the list on screen, so the Type select carries
  // over. The Status select only shades the map and sorts the list, and the
  // list already shows both counts, so the file does too.
  function reportTable(): ReportTable {
    const notes = [
      "Counts verified and pending Places and Businesses by barangay. Rejected Places and unverified Businesses are left out. This is not the same set Discover shows.",
    ];
    if (noPin.total > 0) {
      notes.push(`${noPin.verified} verified and ${noPin.pending} pending have no pin, so they are not on the map.`);
    }
    if (noMatch.total > 0) {
      notes.push(`${noMatch.verified} verified and ${noMatch.pending} pending sit outside every barangay.`);
    }
    return {
      title: "Barangay heatmap",
      details: [
        `Type: ${TYPE_LABEL[type]}`,
        `Made: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      ],
      columns: ["Barangay", "Verified", "Pending"],
      rows: rows.map((r) => [r.name, r.verified, r.pending]),
      footer: ["Total", totals.verified, totals.pending],
      notes,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        title="Barangay heatmap"
        breadcrumb={[{ label: "Reports", to: "/admin/reports" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={type} onValueChange={(v) => setType(v as TypeFilter)}>
              <SelectTrigger className="w-[150px]" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as TypeFilter[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[130px]" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ReportDownloadMenu
              getTable={reportTable}
              fileBase={`barangay-heatmap-${type === "all" ? "places-and-businesses" : type === "place" ? "places" : "businesses"}`}
              disabled={loading || loadFailed || isEmpty}
            />
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        Counts verified and pending Places and Businesses by barangay. Rejected Places and unverified Businesses are left
        out. This is not the same set Discover shows.
      </p>

      {boundaryError && <p className="text-sm text-destructive">{boundaryError}</p>}
      {pointsError && <p className="text-sm text-destructive">{pointsError}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-2">
          <div
            ref={containerRef}
            className="h-[55svh] min-h-[320px] overflow-hidden rounded-lg border border-border md:h-[calc(100svh-15rem)]"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2" aria-label={`Legend, ${STATUS_LABEL[status]} count`}>
              {max === 0 ? (
                <span>{loadFailed ? "No data to shade" : "Nothing to shade"}</span>
              ) : (
                Array.from({ length: STEPS }, (_, i) => i + 1).map((step) => (
                  <span key={step} className="flex items-center gap-1">
                    <span
                      className="h-3 w-5 rounded-sm border border-border"
                      style={{ backgroundColor: (dark ? MOCHA : LATTE).mauve, opacity: STEP_OPACITY[step] }}
                      aria-hidden="true"
                    />
                    {legendLabel(step, max)}
                  </span>
                ))
              )}
            </div>
            <span>
              ©{" "}
              <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>{" "}
              contributors,{" "}
              <a className="underline" href="https://openfreemap.org" target="_blank" rel="noreferrer">
                OpenFreeMap
              </a>
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 md:max-h-[calc(100svh-15rem)]">
          {loadFailed ? (
            <EmptyState icon={MapTrifold}>Counts are unavailable until the report data loads.</EmptyState>
          ) : isEmpty ? (
            <EmptyState icon={MapTrifold}>Places and Businesses will appear here once they are added.</EmptyState>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
                <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Barangay</span>
                  <span className="text-right">Verified</span>
                  <span className="text-right">Pending</span>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto">
                  {rows.map((r) => (
                    <li key={r.name}>
                      <button
                        type="button"
                        onMouseEnter={() => setHovered(r.name)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setHovered(r.name)}
                        aria-pressed={hovered === r.name}
                        className={cn(
                          "grid w-full grid-cols-[minmax(0,1fr)_72px_72px] gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                          hovered === r.name && "bg-accent",
                        )}
                      >
                        <span className="truncate text-foreground">{r.name}</span>
                        <span className={cn("text-right tabular-nums", status === "verified" ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {r.verified}
                        </span>
                        <span className={cn("text-right tabular-nums", status === "pending" ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {r.pending}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 border-t border-border px-3 py-2 text-sm font-medium text-foreground">
                  <span>Shaded total</span>
                  <span className="text-right tabular-nums">{totals.verified}</span>
                  <span className="text-right tabular-nums">{totals.pending}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {noPin.total > 0 && (
                  <p>
                    {noPin.verified} verified and {noPin.pending} pending have no pin, so they are not on the map.
                  </p>
                )}
                {noMatch.total > 0 && (
                  <p>
                    {noMatch.verified} verified and {noMatch.pending} pending sit outside every barangay.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function noteCounts(list: ReportPoint[], type: TypeFilter) {
  const scoped = type === "all" ? list : list.filter((p) => p.kind === type);
  const verified = scoped.filter((p) => p.verification_status === "verified").length;
  return { verified, pending: scoped.length - verified, total: scoped.length };
}
