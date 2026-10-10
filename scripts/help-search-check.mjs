// Smallest check for src/lib/help-search.ts. Run: node scripts/help-search-check.mjs
// (Node 22.18+ reads the .ts file directly.) Fails with an assert if the
// matching rules break. Uses a few lines of the real copy, since help-content.ts
// imports through the @/ alias, which plain node cannot resolve.
import assert from "node:assert/strict";
import { filterHelpTopics } from "../src/lib/help-search.ts";

const topics = [
  {
    title: "Trails",
    items: [
      { question: "How does a trail work?", answer: "A trail is a route of stops in order. Sign in, then tap Start trail." },
      { question: "What is a credential?", answer: "A badge for finishing a trail that has one." },
    ],
  },
  {
    title: "Discover",
    items: [
      { question: "How do I get directions?", answer: "Open a place or business and tap Directions. Location must be on." },
      { question: "How do I scan a QR code?", answer: "Use your phone camera on the code at the stop." },
    ],
  },
  {
    title: "Account",
    items: [{ question: "How do I delete my account?", answer: "Open Settings, then Account, then Delete account." }],
  },
];

const hits = (query) => filterHelpTopics(topics, query).flatMap((t) => t.items.map((i) => i.question));
const has = (query, question) => assert.ok(hits(query).includes(question), `"${query}" should find "${question}"`);
const none = (query) => assert.deepEqual(hits(query), [], `"${query}" should find nothing`);

assert.equal(filterHelpTopics(topics, ""), topics); // empty query: untouched
assert.equal(filterHelpTopics(topics, " ?! "), topics); // symbols only: untouched

has("directions", "How do I get directions?"); // literal
has("DIREC", "How do I get directions?"); // partial word, any case
has("trails", "What is a credential?"); // topic title
has("directons", "How do I get directions?"); // missing letter
has("dirctions", "How do I get directions?"); // missing letter
has("trial", "How does a trail work?"); // swapped pair is one edit
has("signin", "How does a trail work?"); // "sign in" with the space closed up
has("trip", "How does a trail work?"); // synonym
has("badge trail", "What is a credential?"); // two words, any order
has("trail badge", "What is a credential?");
has("remove account", "How do I delete my account?"); // synonym plus literal
has("qr", "How do I scan a QR code?"); // short word, literal only

none("tril"); // 4 letters, no tolerance
none("zebra");
none("trail zebra"); // every word must match

console.log("help-search: ok");
