// Fills public.item_embeddings (migration 0046) for the recommender
// (recommendation-plan.md, Embeddings). Run by hand or by the nightly job in
// .github/workflows/embed-items.yml. It runs off the app, nothing here ships in
// the bundle.
//
//   npm run embed               embed new and changed places and businesses
//   npm run embed -- --check    three asserts on the text builder, nothing else
//   npm run embed -- --neighbours   Phase 4 tuning read: embeds in memory, writes
//                               nothing. Prints each item's top 3 neighbours, the
//                               cosine spread, and whether a one line version of a
//                               listing falls into the lowest taste band.
//
// Env (server only, never VITE_ prefixed, see .env.example):
//   SUPABASE_URL                 e.g. http://127.0.0.1:54321 for the local stack
//   SUPABASE_SERVICE_ROLE_KEY    writes item_embeddings, bypasses RLS. The
//                                hosted key lives only in GitHub secrets.
//
// Steps: load every place and business (no status filter, so a status change
// never forces a re-embed), build one text per item, skip rows whose model and
// hash already match, embed the rest, upsert, delete rows whose item is gone
// (there is no foreign key, so orphans are possible). Exit code 1 on any error.
//
// ponytail: scripts/ is outside ESLint and Sonar scope, so this stays small.
// ponytail: no re-embed the moment a listing changes, the nightly lag is
// accepted and a new listing counts as neutral until the next run.

import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

// Xenova/multilingual-e5-small is the ONNX copy of intfloat/multilingual-e5-small
// (the original has no ONNX weights, so transformers.js cannot load it). The
// dtype is part of the pinned model string, a change of either is a re-embed.
const MODEL_ID = "Xenova/multilingual-e5-small";
const DTYPE = "q8";
const MODEL = `${MODEL_ID}:${DTYPE}`;
const DIMS = 384;
// e5 wants a prefix on every text. "query: " is the one for item to item
// similarity, since all our texts are compared with each other.
const PREFIX = "query: ";
const MAX_CHARS = 2000;
const EMBED_BATCH = 16;
const WRITE_CHUNK = 50;
const PAGE = 1000; // PostgREST returns at most 1000 rows per request

// ---------------------------------------------------------------------------
// Text builder. Pure, so --check can run it on inline rows.
// ---------------------------------------------------------------------------

// A joined relation comes back as an object or a one element array, depending
// on how PostgREST reads the foreign key.
function relName(rel) {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? "";
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
}

function finish(parts) {
  const body = parts.map(clean).filter(Boolean).join(". ");
  return (PREFIX + body).slice(0, MAX_CHARS);
}

// Place: name, category, description, historical background.
export function placeText(p) {
  return finish([p.name, relName(p.place_categories), p.description, p.historical_background]);
}

// Business: name, category (the category table, else the old free text from
// before 0027), description, specialty, story, then the item names.
export function businessText(b) {
  const category = relName(b.business_categories) || b.category_text_legacy;
  const items = (b.business_items ?? []).map((i) => clean(i.name)).filter(Boolean).join(", ");
  return finish([b.name, category, b.description, b.unique_specialty, b.business_story, items]);
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

function runCheck() {
  // 1. Category: a place reads its table, a business falls back to the old text.
  const place = placeText({ name: "Pasig Cathedral", place_categories: { name: "Church" }, description: "Old church." });
  assert.match(place, /Church/);
  const legacy = businessText({ name: "Aling Nena", business_categories: null, category_text_legacy: "Bakery" });
  assert.match(legacy, /Bakery/);
  const tabled = businessText({ name: "Aling Nena", business_categories: [{ name: "Food" }], category_text_legacy: "Bakery" });
  assert.match(tabled, /Food/);
  assert.doesNotMatch(tabled, /Bakery/);

  // 2. Item names are in the business text, a place has no items.
  const withItems = businessText({ name: "Kuya Jun", business_items: [{ name: "Pandesal" }, { name: "Ensaymada" }] });
  assert.match(withItems, /Pandesal, Ensaymada/);

  // 3. Prefix and cap.
  const long = businessText({ name: "Long", description: "x".repeat(5000) });
  assert.ok(long.startsWith(PREFIX), "text starts with the e5 prefix");
  assert.equal(long.length, MAX_CHARS);

  console.log("embed-items check: 3 passed");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function fetchAll(db, table, select, order) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(select).order(order).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

// Every place and business as { kind, id, name, category, text }.
async function loadItems(db) {
  const [places, businesses] = await Promise.all([
    fetchAll(db, "places", "id, name, description, historical_background, place_categories(name)", "id"),
    fetchAll(
      db,
      "businesses",
      "id, name, description, unique_specialty, business_story, category_text_legacy, business_categories(name), business_items(name)",
      "id",
    ),
  ]);
  return [
    ...places.map((p) => ({ kind: "place", id: p.id, name: p.name, category: relName(p.place_categories), text: placeText(p) })),
    ...businesses.map((b) => ({
      kind: "business",
      id: b.id,
      name: b.name,
      category: relName(b.business_categories) || b.category_text_legacy || "",
      text: businessText(b),
    })),
  ];
}

// Loads the model once and yields { batch, vectors } for each batch of rows.
// With no rows it returns first, so a run with nothing to embed never starts it.
async function* embedBatches(rows) {
  if (rows.length === 0) return;
  const { pipeline } = await import("@huggingface/transformers");
  const extract = await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH);
    const out = await extract(batch.map((b) => b.text), { pooling: "mean", normalize: true });
    const vectors = out.tolist();
    batch.forEach((b, n) => assert.equal(vectors[n].length, DIMS, `${b.kind} ${b.id}: expected ${DIMS} dimensions, got ${vectors[n].length}`));
    yield { batch, vectors };
  }
}

const hashOf = (text) => createHash("sha256").update(`${MODEL}\n${text}`).digest("hex");
const keyOf = (kind, id) => `${kind}:${id}`;
const toVector = (values) => `[${Array.from(values).join(",")}]`;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server only, not VITE_). See .env.example.");
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [items, existing] = await Promise.all([
    loadItems(db),
    fetchAll(db, "item_embeddings", "kind, item_id, model, content_hash", "item_id"),
  ]);
  const have = new Map(existing.map((e) => [keyOf(e.kind, e.item_id), e]));
  const todo = items
    .map((i) => ({ ...i, hash: hashOf(i.text) }))
    .filter((i) => {
      const row = have.get(keyOf(i.kind, i.id));
      return !(row && row.model === MODEL && row.content_hash === i.hash);
    });

  let embedded = 0;
  for await (const { batch, vectors } of embedBatches(todo)) {
    const rows = batch.map((b, n) => ({
      kind: b.kind,
      item_id: b.id,
      model: MODEL,
      content_hash: b.hash,
      embedding: toVector(vectors[n]),
      updated_at: new Date().toISOString(),
    }));
    for (let w = 0; w < rows.length; w += WRITE_CHUNK) {
      const { error } = await db.from("item_embeddings").upsert(rows.slice(w, w + WRITE_CHUNK), { onConflict: "kind,item_id" });
      if (error) throw new Error(`upsert: ${error.message}`);
    }
    embedded += rows.length;
  }

  // Orphans: embeddings whose place or business no longer exists.
  const live = new Set(items.map((i) => keyOf(i.kind, i.id)));
  const orphans = existing.filter((e) => !live.has(keyOf(e.kind, e.item_id)));
  for (const kind of ["place", "business"]) {
    const ids = orphans.filter((o) => o.kind === kind).map((o) => o.item_id);
    for (let d = 0; d < ids.length; d += WRITE_CHUNK) {
      const { error } = await db.from("item_embeddings").delete().eq("kind", kind).in("item_id", ids.slice(d, d + WRITE_CHUNK));
      if (error) throw new Error(`delete: ${error.message}`);
    }
  }

  console.log(`embedded ${embedded}, skipped ${items.length - todo.length}, deleted ${orphans.length}`);
}

// Phase 4 read. Same bands as recommend_items: percent rank among the other
// items' cosine to the taste vector, cut into 4. Vectors are normalized, so the
// cosine is the dot product. Not a pass/fail, a page to read by eye.
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const bandOf = (sim, others) => Math.min(3, Math.floor((others.filter((o) => o < sim).length / Math.max(1, others.length)) * 4));

async function neighbours() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const items = await loadItems(db);
  const thin = items.map((i) => ({ ...i, text: finish([i.name, i.category]) }));
  const vec = new Map();
  for await (const { batch, vectors } of embedBatches([...items, ...thin.map((t) => ({ ...t, kind: `thin-${t.kind}` }))])) {
    batch.forEach((b, n) => vec.set(keyOf(b.kind, b.id), vectors[n]));
  }
  const full = (i) => vec.get(keyOf(i.kind, i.id));
  const small = (i) => vec.get(keyOf(`thin-${i.kind}`, i.id));

  // 4.2 top 3 neighbours, and the spread of every pair.
  const all = [];
  for (const a of items) {
    const sims = items.filter((b) => b !== a).map((b) => ({ b, s: dot(full(a), full(b)) }));
    all.push(...sims.map((x) => x.s));
    const top = sims.sort((x, y) => y.s - x.s).slice(0, 3).map((x) => `${x.b.name} [${x.b.kind}] ${x.s.toFixed(3)}`);
    console.log(`${a.name} [${a.kind}]\n    ${top.join("\n    ")}`);
  }
  all.sort((x, y) => x - y);
  console.log(`\ncosine spread over ${all.length} pairs: min ${all[0]?.toFixed(3)}, median ${all[Math.floor(all.length / 2)]?.toFixed(3)}, max ${all.at(-1)?.toFixed(3)}`);

  // 4.4 thin vs full. For each item i as the listing and each other item t as the
  // taste, band of i among the rest. Only the lowest band (0) is a burial.
  console.log("\nthin listing (name and category only) vs full listing, share of tastes that put it in the lowest band:");
  for (const i of items) {
    let fullLow = 0;
    let thinLow = 0;
    const tastes = items.filter((t) => t !== i);
    for (const t of tastes) {
      const rest = items.filter((o) => o !== i && o !== t).map((o) => dot(full(t), full(o)));
      if (bandOf(dot(full(t), full(i)), rest) === 0) fullLow += 1;
      if (bandOf(dot(full(t), small(i)), rest) === 0) thinLow += 1;
    }
    const pct = (n) => `${Math.round((100 * n) / Math.max(1, tastes.length))}%`;
    console.log(`  ${i.name}: full ${pct(fullLow)}, thin ${pct(thinLow)}`);
  }
}

const run = process.argv.includes("--check") ? runCheck : process.argv.includes("--neighbours") ? neighbours : main;
if (run === runCheck) {
  runCheck();
} else {
  run().catch((err) => {
    console.error(`embed-items failed: ${err.message}`);
    process.exit(1);
  });
}
