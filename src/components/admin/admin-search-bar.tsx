import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EMPTY_ADMIN_SEARCH_RESULTS,
  hasAnyAdminResults,
  searchAdminEverything,
  type AdminSearchResults,
} from "@/lib/admin-global-search";

// Admin global search (Phase 3.4/3.8): placed in admin.tsx's header, top
// right, next to where notification sits (per 3.4 and ux-ui-guidelines.md's
// placement convention). Same debounce, dropdown, and dismissal shape as
// global-search-bar.tsx (3.8's "same sizing, spacing, and radius" applied
// to structure too, not just tokens) -- copied rather than shared via a
// generic component, since the two read through different data functions
// (searchAdminEverything vs searchEverything), render an extra Staff group
// and status badges the public bar has no concept of, and navigate to
// different route sets (/admin/... vs /discover/...). A shared wrapper
// would need a results-renderer prop per group to cover both, which is
// more indirection than two ~150-line siblings, per ponytail's ladder.
const DEBOUNCE_MS = 300;

export function AdminSearchBar() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResults>(EMPTY_ADMIN_SEARCH_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(EMPTY_ADMIN_SEARCH_RESULTS);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    const timeout = setTimeout(() => {
      searchAdminEverything(trimmed)
        .then((next) => {
          setResults(next);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  // Same two dismissal paths as global-search-bar.tsx: outside click and
  // Escape, per ux-ui-guidelines.md's Familiarity principle.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function goTo(path: string) {
    setOpen(false);
    setQuery("");
    navigate(path);
  }

  const trimmed = query.trim();
  const showPanel = open && trimmed.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search Places, Businesses, Trails, Events, Staff"
        aria-label="Admin search"
        className="pl-9"
      />

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {loading && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          )}

          {!loading && error && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Search failed. Try again.
            </p>
          )}

          {!loading && !error && !hasAnyAdminResults(results) && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No results for &quot;{trimmed}&quot;.
            </p>
          )}

          {!loading && !error && results.places.length > 0 && (
            <ResultGroup label="Places">
              {results.places.map((place) => (
                <ResultRow
                  key={place.id}
                  title={place.name}
                  subtitle={place.category}
                  badge={<StatusBadge status={place.verification_status} />}
                  onClick={() => goTo(`/admin/places/${place.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && !error && results.businesses.length > 0 && (
            <ResultGroup label="Businesses">
              {results.businesses.map((business) => (
                <ResultRow
                  key={business.id}
                  title={business.name}
                  subtitle={business.category}
                  badge={
                    <>
                      <StatusBadge status={business.verification_status} />
                      {business.featured_status === "featured" && (
                        <Badge variant="accent">Featured</Badge>
                      )}
                    </>
                  }
                  onClick={() => goTo(`/admin/businesses/${business.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && !error && results.trails.length > 0 && (
            <ResultGroup label="Trails">
              {results.trails.map((trail) => (
                <ResultRow
                  key={trail.id}
                  title={trail.name}
                  subtitle={trail.theme}
                  badge={<StatusBadge status={trail.status} />}
                  onClick={() => goTo(`/admin/trails/${trail.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && !error && results.events.length > 0 && (
            <ResultGroup label="Announcements">
              {results.events.map((event) => (
                <ResultRow
                  key={event.id}
                  title={event.title}
                  subtitle={event.category}
                  badge={<StatusBadge status={event.published ? "published" : "draft"} />}
                  onClick={() => goTo(`/admin/events/${event.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && !error && results.staff.length > 0 && (
            <ResultGroup label="Staff">
              {results.staff.map((member) => (
                <ResultRow
                  key={member.id}
                  title={member.display_name ?? "Unnamed staff"}
                  subtitle={member.position}
                  onClick={() => goTo("/admin/staff")}
                />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

// One badge component covering every status string this bar shows
// (place/business verification, trail draft/published, event published/
// draft) rather than a per-group variant map -- all five are the same
// verified-vs-not-yet semantic, matching admin-places.tsx's own
// STATUS_VARIANT convention (verified: default, pending/draft: outline).
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

function ResultGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="border-b border-border py-1 last:border-b-0">
      <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function ResultRow({
  title,
  subtitle,
  badge,
  onClick,
}: Readonly<{
  title: string;
  subtitle?: string | null;
  badge?: ReactNode;
  onClick: () => void;
}>) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col items-start gap-1 px-4 py-2 text-left transition-colors hover:bg-muted"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {(subtitle || badge) && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {subtitle}
            {badge}
          </span>
        )}
      </button>
    </li>
  );
}
