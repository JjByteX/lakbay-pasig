import type { SystemPermission } from "./auth-types";
import { allowedEdits, normalize, within } from "./help-search";

// Admin search over the admin panel's own pages: Dashboard, each section, each
// report, each category list, Settings, Help. admin-global-search.ts only finds
// records (a place, a trail, a staff member), so typing "barangay heatmap" used
// to find nothing even though that report exists. This is the missing half.
//
// It runs in memory on the list below, so results show on the first keystroke,
// need no network, and still show when the record search fails or is slow.
//
// Who sees what: each entry carries the same access rule as its route guard in
// App.tsx and its sidebar item in admin-sidebar.tsx, so a page a staff member
// cannot open is never offered. Keep the three in step when a page is added.
//
// Matching, per query word (every word must match, in any order):
//  - case, accents and punctuation are ignored (normalize, shared with Help
//    search), so a voice transcript like "Barangay heatmap." still matches;
//  - singular and plural are the same word (stem), so "business" finds
//    Businesses and "reports" finds Reports;
//  - a word typed halfway still matches (prefix), so "heat" finds Heatmap;
//  - a small typo still matches (help-search.ts's edit rule: none up to 4
//    letters, one for 5 to 8, two from 9; a swapped pair counts as one);
//  - "heat map" and "heatmap" find each other (spaces closed up).
// Ranking: whole title, then title start, then words in the title, then
// keywords. Ties keep the order below, which is the sidebar's order.

export type AdminPageAccess =
  | { kind: "everyone" }
  | { kind: "admin" }
  | { kind: "permission"; any: readonly SystemPermission[] };

export interface AdminPageEntry {
  /** Stable key, also how the search bar picks an icon. */
  id: string;
  path: string;
  title: string;
  /** The section this page lives in, shown under the title. */
  section: string | null;
  /** Other words someone might type for it. */
  keywords: string;
  access: AdminPageAccess;
}

const everyone: AdminPageAccess = { kind: "everyone" };
const admin: AdminPageAccess = { kind: "admin" };
const needs = (...any: SystemPermission[]): AdminPageAccess => ({ kind: "permission", any });

// Sidebar order, then each section's own pages.
export const ADMIN_PAGES: readonly AdminPageEntry[] = [
  { id: "dashboard", path: "/admin", title: "Dashboard", section: null, keywords: "home overview summary stats pending review queue", access: everyone },
  { id: "events", path: "/admin/events", title: "Announcements", section: null, keywords: "news events posts updates publish", access: needs("publish_events") },
  { id: "places", path: "/admin/places", title: "Places", section: null, keywords: "landmarks attractions sites tourist spots verify pending", access: needs("manage_places") },
  { id: "businesses", path: "/admin/businesses", title: "Businesses", section: null, keywords: "shops stores vendors establishments featured listed verify pending", access: needs("review_businesses") },
  { id: "trails", path: "/admin/trails", title: "Trails", section: null, keywords: "routes tours itineraries stops walking builder", access: needs("build_trails") },
  { id: "fiestas", path: "/admin/fiestas", title: "Fiestas", section: null, keywords: "festival feast celebration barangay patron", access: needs("publish_events") },

  { id: "reports", path: "/admin/reports", title: "Reports", section: null, keywords: "analytics statistics data insights", access: needs("view_reports") },
  { id: "report-heatmap", path: "/admin/reports/heatmap", title: "Barangay heatmap", section: "Reports", keywords: "map count places businesses per barangay verified pending coverage", access: needs("view_reports") },
  { id: "report-fiestas", path: "/admin/reports/fiestas", title: "Fiesta coverage", section: "Reports", keywords: "barangays published draft none missing fiestas", access: needs("view_reports") },
  { id: "report-visits", path: "/admin/reports/visits", title: "Visit planning", section: "Reports", keywords: "visits busiest weeks seasonality forecast peak crowd months traffic", access: needs("view_reports") },

  { id: "feedback", path: "/admin/feedback", title: "Feedback", section: null, keywords: "inbox messages suggestions problems bugs complaints reports sent by users", access: needs("review_feedback") },
  { id: "landing", path: "/admin/landing", title: "Landing Page", section: null, keywords: "hero carousel welcome slides banner photos signed out visitors", access: needs("manage_landing") },

  { id: "categories", path: "/admin/categories", title: "Categories", section: null, keywords: "tags types groups", access: needs("manage_places", "build_trails", "publish_events", "review_businesses") },
  { id: "categories-events", path: "/admin/categories?tab=events", title: "Announcement categories", section: "Categories", keywords: "news events tags", access: needs("publish_events") },
  { id: "categories-places", path: "/admin/categories?tab=places", title: "Place categories", section: "Categories", keywords: "landmarks attractions tags color icon", access: needs("manage_places") },
  { id: "categories-facilities", path: "/admin/categories?tab=facilities", title: "Facilities", section: "Categories", keywords: "amenities parking restroom wifi place features", access: needs("manage_places") },
  { id: "categories-business", path: "/admin/categories?tab=business_categories", title: "Business categories", section: "Categories", keywords: "shops stores vendors tags color icon", access: needs("review_businesses") },
  { id: "categories-trails", path: "/admin/categories?tab=trails", title: "Trail categories", section: "Categories", keywords: "routes themes tags", access: needs("build_trails") },

  { id: "staff", path: "/admin/staff", title: "Staff", section: null, keywords: "team members accounts users permissions roles admins add invite", access: admin },
  { id: "activity", path: "/admin/activity", title: "Activity", section: null, keywords: "log audit history actions who changed", access: admin },

  { id: "settings", path: "/admin/settings", title: "Settings", section: null, keywords: "theme dark light mode font size text appearance display preferences", access: everyone },
  { id: "help", path: "/admin/help", title: "Help & FAQ", section: null, keywords: "support questions guide how to answers contact", access: everyone },
];

/** Who is searching: what the sidebar and route guards already look at. */
export interface AdminPageViewer {
  isAdmin: boolean;
  permissions: readonly SystemPermission[] | null | undefined;
}

export function canOpenAdminPage(access: AdminPageAccess, viewer: AdminPageViewer): boolean {
  if (access.kind === "everyone") return true;
  // adminOnly in the sidebar, requireAdmin in the route guard.
  if (access.kind === "admin") return viewer.isAdmin;
  // Admins pass every permission check, same as protected-route.tsx.
  return viewer.isAdmin || access.any.some((p) => viewer.permissions?.includes(p));
}

// "businesses" -> "business", "categories" -> "category", "reports" -> "report".
// Applied to both sides, so only has to agree with itself, not be correct English.
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(?:sses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const MAX_QUERY_WORDS = 8;
const MAX_QUERY_LENGTH = 80;
const DEFAULT_LIMIT = 5;

// Score of one query word against one field's words, 0 when it is not found.
// Exact beats prefix beats typo, so "report" ranks Reports above Reports'
// sub-pages that only mention it in a keyword.
function wordScore(token: string, words: readonly string[], closedUp: string): number {
  let best = 0;
  const max = allowedEdits(token.length);
  for (const word of words) {
    if (word === token) return 4;
    if (word.startsWith(token)) best = Math.max(best, 3);
    else if (max > 0 && (within(token, word, max) || within(token, word.slice(0, token.length), max))) {
      best = Math.max(best, 1);
    }
  }
  // "heatmap" inside "heat map", "fiestacoverage" across two words.
  if (best === 0 && token.length >= 5 && closedUp.includes(token)) best = 1;
  return best;
}

interface Prepared {
  entry: AdminPageEntry;
  titleWords: string[];
  titleClosed: string;
  otherWords: string[];
  otherClosed: string;
  titleNormalized: string;
}

function prepare(entry: AdminPageEntry): Prepared {
  const titleNormalized = normalize(entry.title);
  const titleWords = titleNormalized.split(" ").filter(Boolean).map(stem);
  const other = normalize(`${entry.section ?? ""} ${entry.keywords}`);
  const otherWords = other.split(" ").filter(Boolean).map(stem);
  return {
    entry,
    titleNormalized,
    titleWords,
    titleClosed: titleWords.join(""),
    otherWords,
    otherClosed: otherWords.join(""),
  };
}

// Built once: the list is fixed.
const PREPARED: readonly Prepared[] = ADMIN_PAGES.map(prepare);

/**
 * Pages matching a query, best first, limited to ones this staff member may
 * open. A query with no letters or digits (empty, spaces, "???") returns
 * nothing, so it never lists every page by accident.
 */
export function searchAdminPages(
  query: string,
  viewer: AdminPageViewer,
  limit: number = DEFAULT_LIMIT,
): AdminPageEntry[] {
  const normalized = normalize(query.slice(0, MAX_QUERY_LENGTH));
  const tokens = normalized.split(" ").filter(Boolean).slice(0, MAX_QUERY_WORDS).map(stem);
  if (tokens.length === 0) return [];
  const wholeQuery = tokens.join(" ");

  const scored: { entry: AdminPageEntry; score: number; order: number }[] = [];
  PREPARED.forEach((page, order) => {
    if (!canOpenAdminPage(page.entry.access, viewer)) return;

    let score = 0;
    let titleHits = 0;
    for (const token of tokens) {
      const inTitle = wordScore(token, page.titleWords, page.titleClosed);
      const inOther = wordScore(token, page.otherWords, page.otherClosed);
      if (inTitle === 0 && inOther === 0) return; // every word has to match
      if (inTitle >= inOther) titleHits++;
      // A title word is worth more than a keyword of equal quality.
      score += Math.max(inTitle * 2, inOther);
    }

    const title = page.titleWords.join(" ");
    if (title === wholeQuery) score += 20;
    else if (title.startsWith(wholeQuery)) score += 10;
    if (titleHits === tokens.length) score += 5;
    scored.push({ entry: page.entry, score, order });
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((hit) => hit.entry);
}
