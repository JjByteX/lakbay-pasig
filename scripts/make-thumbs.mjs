// Makes a small thumbnail beside every photo already in the content-photos
// bucket (offline-phases.md, Phase 2.7). New uploads get theirs from
// src/lib/photo-thumb.ts, so this only fills the photos that came before it,
// plus any upload whose thumbnail failed. Run by hand, it ships nothing.
//
//   npm run thumbs                  make every missing thumbnail
//   npm run thumbs -- --dry-run     list what is missing, change nothing
//   npm run thumbs -- --limit=20    stop after 20, to try it first
//
// Env (server only, never VITE_ prefixed, same as scripts/embed-items.mjs):
//   SUPABASE_URL                 e.g. http://127.0.0.1:54321 for the local stack
//   SUPABASE_SERVICE_ROLE_KEY    writes to the bucket. Keep it out of git.
//
// Safe to re-run: a photo that already has a thumbnail is skipped. The
// thumbnail sits in the same folder as the original, named
// "<original path>.thumb.webp", same width and quality as photo-thumb.ts.
// landing/ is skipped, hero images are not offline thumbnails. The summary
// prints the average thumbnail size, which is the number the offline
// download estimate needs (offline-plan.md, Photos).
// Exit code 1 if any photo failed.
//
// ponytail: scripts/ is outside ESLint and Sonar scope, so this stays small.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "content-photos";
const SUFFIX = ".thumb.webp";
const WIDTH = 400;
const QUALITY = 78;
const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
const SKIP_PREFIXES = ["landing/"];
const PAGE = 100;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;

const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);

// Folders come back with a null id. Files carry their size in metadata.
async function listAll(prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listAll(path)));
      else files.push({ path, size: item.metadata?.size ?? 0 });
    }
    if (data.length < PAGE) break;
  }
  return files;
}

const all = await listAll();
const existing = new Set(all.map((f) => f.path));
const photos = all.filter(
  (f) => IMAGE.test(f.path) && !f.path.endsWith(SUFFIX) && !SKIP_PREFIXES.some((p) => f.path.startsWith(p))
);
const todo = photos.filter((f) => !existing.has(f.path + SUFFIX));

console.log(`Photos: ${photos.length}. Already have a thumbnail: ${photos.length - todo.length}. Missing: ${todo.length}.`);
if (dryRun) process.exit(0);

let made = 0;
let failed = 0;
let originalBytes = 0;
let thumbBytes = 0;

for (const file of todo.slice(0, limit)) {
  try {
    const { data, error } = await bucket.download(file.path);
    if (error) throw error;
    const input = Buffer.from(await data.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    const { error: uploadError } = await bucket.upload(file.path + SUFFIX, output, {
      contentType: "image/webp",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    made += 1;
    originalBytes += input.length;
    thumbBytes += output.length;
  } catch (err) {
    failed += 1;
    console.error(`Failed: ${file.path}: ${err.message ?? err}`);
  }
}

const kb = (n) => (n / 1024).toFixed(0);
console.log(`Made ${made}, failed ${failed}.`);
if (made > 0) {
  console.log(`Average original ${kb(originalBytes / made)} KB, average thumbnail ${kb(thumbBytes / made)} KB.`);
  console.log(`Total thumbnails ${(thumbBytes / 1048576).toFixed(1)} MB.`);
}
process.exit(failed > 0 ? 1 : 0);
