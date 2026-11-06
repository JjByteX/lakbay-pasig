// THROWAWAY SPIKE (Send Feedback plan, Phase 1.3). Delete before any merge.
// Question it answers: does `sharp` run inside a Vercel function, and what does
// a cold start cost? POST raw JPG, PNG or WebP bytes; it resizes to 1280px,
// re-encodes to WebP at quality 75, strips metadata, and returns the numbers.
//
// Try it on a Vercel preview deploy (never production, it returns 404 there):
//   curl -s -X POST --data-binary @photo.jpg -H "Content-Type: image/jpeg" \
//     https://<preview-url>/api/spike-sharp
// Run it twice. "coldStart": true on the first call after a deploy or idle gap,
// false on the next. Use a phone photo with GPS to confirm "outputHasExif": false.

import sharp from "sharp";

const loadedAt = Date.now();
let warm = false;

const MAX_BYTES = 4_000_000;

function reply(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request) {
    if (process.env.VERCEL_ENV === "production") return reply({ error: "not_found" }, 404);
    if (request.method !== "POST") return reply({ error: "method" }, 405);

    const coldStart = !warm;
    warm = true;

    const input = Buffer.from(await request.arrayBuffer());
    if (input.byteLength === 0) return reply({ error: "empty" }, 400);
    if (input.byteLength > MAX_BYTES) return reply({ error: "too_large" }, 413);

    try {
      const started = Date.now();
      const inputMeta = await sharp(input).metadata();
      const output = await sharp(input)
        .rotate() // apply the EXIF orientation before metadata is dropped
        .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer(); // no withMetadata(): EXIF, GPS and ICC are dropped
      const processMs = Date.now() - started;
      const outputMeta = await sharp(output).metadata();

      return reply({
        ok: true,
        coldStart,
        msSinceModuleLoad: Date.now() - loadedAt,
        processMs,
        sharp: sharp.versions,
        node: process.version,
        input: {
          format: inputMeta.format,
          bytes: input.byteLength,
          width: inputMeta.width,
          height: inputMeta.height,
          hasExif: Boolean(inputMeta.exif),
        },
        output: {
          format: outputMeta.format,
          bytes: output.byteLength,
          width: outputMeta.width,
          height: outputMeta.height,
        },
        outputHasExif: Boolean(outputMeta.exif),
      });
    } catch (error) {
      return reply({ ok: false, error: String(error && error.message ? error.message : error) }, 500);
    }
  },
};
