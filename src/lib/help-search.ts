import type { HelpTopic } from "@/lib/help-content";

/**
 * Typo tolerant filter for the Help & FAQ pages (docs/help-faq-plan.md). Runs on
 * the page's own copy in memory, so it needs no database. It follows the same
 * rules as the global search (0042_fuzzy_search.sql): text is lowercased with
 * accents and apostrophes dropped, a query word matches when it is inside the
 * text or within a few edits of one of its words, and short words get no
 * tolerance. Every word of the query must match, in any order.
 *
 * ponytail: the edit allowance is stricter than the database's (it gives 2 edits
 * from 5 letters, which suits short names, not whole answers where it would
 * match unrelated words), and results keep the page's order instead of being
 * ranked. Tune allowedEdits on real queries, rank if the lists grow long.
 */

// What people type -> the word the copy uses. One way, add a line when a
// real search finds nothing. Words are single, since the query is split on spaces.
const SYNONYMS: Record<string, string[]> = {
  trip: ["trail"],
  tour: ["trail"],
  journey: ["trail"],
  itinerary: ["trail"],
  login: ["sign"],
  signin: ["sign"],
  signup: ["account"],
  register: ["account"],
  remove: ["delete", "deactivate"],
  erase: ["delete"],
  delete: ["remove"],
  shop: ["business"],
  store: ["business"],
  stall: ["business"],
  vendor: ["business"],
  site: ["place"],
  landmark: ["place"],
  attraction: ["place"],
  spot: ["place"],
  news: ["announcement", "event"],
  announcement: ["event"],
  event: ["announcement"],
  badge: ["credential"],
  certificate: ["credential"],
  reward: ["credential"],
  achievement: ["credential"],
  bookmark: ["save"],
  favorite: ["save"],
  favourite: ["save"],
  wishlist: ["save"],
  dismiss: ["hide"],
  block: ["hide"],
  ignore: ["hide"],
  recommendation: ["suggestion"],
  recommended: ["suggestion"],
  recommend: ["suggestion"],
  gps: ["location"],
  position: ["location"],
  navigate: ["directions"],
  navigation: ["directions"],
  bug: ["problem"],
  issue: ["problem"],
  error: ["problem"],
  broken: ["problem"],
  glitch: ["problem"],
  incorrect: ["problem"],
  theme: ["dark", "appearance"],
  dark: ["appearance"],
  larger: ["font", "text"],
  large: ["font", "text"],
  zoom: ["font", "text"],
  picture: ["photo"],
  pic: ["photo"],
  avatar: ["photo"],
  barcode: ["qr"],
};

/** Lowercase, accents and apostrophes dropped, every other run of symbols a space. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Edits allowed per query word: none up to 4 letters (too short to guess),
// one for 5 to 8, two from 9.
function allowedEdits(length: number): number {
  if (length <= 4) return 0;
  return length <= 8 ? 1 : 2;
}

// Edit distance with a swapped pair counted as one edit, the commonest typo.
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let older: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], older[j - 2] + 1);
      }
    }
    older = prev;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// `text` is already normalized. "signin" is found in "sign in" by checking the
// text with its spaces closed up, for words of 5 letters or more.
function found(word: string, text: string, words: string[]): boolean {
  if (text.includes(word)) return true;
  if (word.length >= 5 && text.replaceAll(" ", "").includes(word)) return true;
  const max = allowedEdits(word.length);
  return max > 0 && words.some((w) => within(word, w, max));
}

/**
 * Keeps the questions where every word of the query is found (or one of its
 * synonyms is) in the topic title, the question, or the answer. Topics left
 * empty drop out. A query with no letters or digits returns the topics as given.
 */
export function filterHelpTopics(topics: HelpTopic[], query: string): HelpTopic[] {
  const queryWords = normalize(query).split(" ").filter(Boolean);
  if (queryWords.length === 0) return topics;

  return topics
    .map((topic) => ({
      ...topic,
      items: topic.items.filter((item) => {
        const text = normalize(`${topic.title} ${item.question} ${item.answer}`);
        const words = text.split(" ");
        return queryWords.every((word) => [word, ...(SYNONYMS[word] ?? [])].some((w) => found(w, text, words)));
      }),
    }))
    .filter((topic) => topic.items.length > 0);
}
