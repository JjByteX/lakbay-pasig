#!/usr/bin/env node
// Direct-request checks for api/feedback.js (Send Feedback plan, step 3.9).
// Run against a Vercel preview, never production data you care about:
//   node scripts/feedback-endpoint-check.mjs https://<preview-url>
//
// The cases below all expect a refusal, so none of them stores anything. The
// success path and the rate limit need a real Turnstile token. Use Cloudflare's
// test secret key (1x0000000000000000000000000000000AA) on the preview with the
// test token "XXXX.DUMMY.TOKEN.XXXX", then run with --with-captcha-token to
// also check the rate limit (it sends valid requests until a 429 appears).

const base = (process.argv[2] || "").replace(/\/$/, "");
const useTestToken = process.argv.includes("--with-captcha-token");
if (!base) {
  console.error("Usage: node scripts/feedback-endpoint-check.mjs <base-url> [--with-captcha-token]");
  process.exit(2);
}
const url = `${base}/api/feedback`;

let failed = 0;
async function check(name, send, expectStatus, expectCode) {
  const res = await send();
  const body = await res.json().catch(() => ({}));
  const ok = res.status === expectStatus && (expectCode === undefined || body.error === expectCode);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${res.status} ${body.error ?? ""})`);
}

function form(fields, image) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (image) f.append("image", new Blob([image.bytes], { type: image.type }), image.name);
  return f;
}
const good = { type: "suggestion", message: "A valid test message.", captchaToken: "XXXX.DUMMY.TOKEN.XXXX" };
const post = (body) => () => fetch(url, { method: "POST", body });

await check("GET is refused", () => fetch(url), 405, "method");
await check("missing type", post(form({ ...good, type: "" })), 400, "invalid_type");
await check("bad type", post(form({ ...good, type: "complaint" })), 400, "invalid_type");
await check("message too short", post(form({ ...good, message: "hi" })), 400, "invalid_message");
await check("message too long", post(form({ ...good, message: "x".repeat(2001) })), 400, "invalid_message");
await check("bad email", post(form({ ...good, email: "not-an-email" })), 400, "invalid_email");
await check("honeypot filled", post(form({ ...good, website: "http://spam.example" })), 400, "spam");
await check(
  "oversized upload",
  post(form(good, { bytes: new Uint8Array(3_500_000), type: "image/jpeg", name: "big.jpg" })),
  413,
  "too_large",
);
if (!useTestToken) {
  await check("missing CAPTCHA token", post(form({ type: "other", message: "A valid test message." })), 400, "captcha");
} else {
  await check(
    "disguised file (text named .jpg)",
    post(form(good, { bytes: new TextEncoder().encode("<script>alert(1)</script>"), type: "image/jpeg", name: "x.jpg" })),
    415,
    "image_type",
  );
  await check(
    "SVG is refused",
    post(form(good, { bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), type: "image/svg+xml", name: "x.svg" })),
    415,
    "image_type",
  );
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) {
    const res = await fetch(url, { method: "POST", body: form(good) });
    limited = res.status === 429;
  }
  console.log(`${limited ? "PASS" : "FAIL"}  rate limit reached within 8 valid requests`);
  if (!limited) failed++;
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
