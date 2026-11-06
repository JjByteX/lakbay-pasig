// Send Feedback, server side (docs/send-feedback-plan.md, Phase 3).
// The only way feedback gets written. The public key in the browser cannot
// insert into the feedback table or the feedback bucket (migration 0008), so
// this function validates, checks the CAPTCHA, applies the shared rate limit,
// re-encodes the image, then saves with the service role. Vercel serves
// /api/feedback from this file (vercel.json's catch-all rewrite skips /api).
//
// Request: multipart/form-data (or JSON when there is no image) with
//   type          suggestion | problem | other
//   message       5 to 2000 characters, plain text
//   email         optional
//   captchaToken  Cloudflare Turnstile token
//   website       honeypot, must be empty
//   image         optional JPG, PNG or WebP
// Optional header: Authorization: Bearer <session token>, attaches the account.
//
// Reply: { ok: true } or { error: <code>, message: <plain text> }. Real errors
// are logged here and never sent to the browser.
//
// Env (Vercel project settings, server only):
//   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//   TURNSTILE_SECRET_KEY

import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const TYPES = new Set(["suggestion", "problem", "other"]);
const MESSAGE_MIN = 5;
const MESSAGE_MAX = 2000;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Vercel's request body limit is 4.5 MB. The browser shrinks the photo first,
// so about 3 MB for the whole request is plenty.
const MAX_BODY_BYTES = 3_000_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_SIDE = 1280;
const IMAGE_QUALITY = 75;

// Shared limits, counted in Supabase so every instance sees the same number.
const IP_LIMIT = { max: 5, windowSeconds: 600 };
const USER_LIMIT = { max: 10, windowSeconds: 3600 };

const MESSAGES = {
  method: "That request is not allowed.",
  forbidden: "That request is not allowed.",
  not_configured: "Feedback is not available right now.",
  server: "Something went wrong. Please try again.",
  too_large: "That upload is too large.",
  image_type: "Only JPG, PNG or WebP images can be sent.",
  invalid_type: "Choose what kind of feedback this is.",
  invalid_message: `Write a message of ${MESSAGE_MIN} to ${MESSAGE_MAX} characters.`,
  invalid_email: "That email address does not look right.",
  spam: "That could not be sent.",
  captcha: "The check did not pass. Please try again.",
  rate_limited: "Too many feedback messages. Please try again later.",
};

function reply(code, status) {
  const body = code === "ok" ? { ok: true } : { error: code, message: MESSAGES[code] ?? MESSAGES.server };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hashKey(prefix, value) {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

// Real file type from the first bytes, never the extension or declared type.
function sniffImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

async function readBody(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (contentType.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const image = form.get("image");
    return {
      fields: {
        type: form.get("type"),
        message: form.get("message"),
        email: form.get("email"),
        captchaToken: form.get("captchaToken"),
        website: form.get("website"),
      },
      image: image && typeof image === "object" && image.size > 0 ? image : null,
    };
  }
  if (contentType.startsWith("application/json")) {
    const json = await request.json();
    return { fields: json && typeof json === "object" ? json : {}, image: null };
  }
  return null;
}

async function captchaPasses(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`turnstile ${res.status}`);
  const data = await res.json();
  return data.success === true;
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return reply("method", 405);

    // Same site only, like api/transcribe.js.
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* falls through to the mismatch below */
      }
      if (originHost !== host) return reply("forbidden", 403);
    }

    const supabase = adminClient();
    if (!supabase || !process.env.TURNSTILE_SECRET_KEY) {
      console.error("feedback: missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or TURNSTILE_SECRET_KEY");
      return reply("not_configured", 500);
    }

    // 3.1 Size cap, from the header first and again on the real bytes.
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) return reply("too_large", 413);

    let body;
    try {
      body = await readBody(request);
    } catch {
      return reply("invalid_message", 400);
    }
    if (!body) return reply("invalid_message", 400);
    const { fields, image } = body;
    if (image && image.size > MAX_BODY_BYTES) return reply("too_large", 413);

    // 3.3 Honeypot. Real people never see this field.
    if (typeof fields.website === "string" && fields.website.length > 0) return reply("spam", 400);

    // 3.2 Validation. The message is plain text and stays plain text.
    const type = typeof fields.type === "string" ? fields.type : "";
    if (!TYPES.has(type)) return reply("invalid_type", 400);

    const message = typeof fields.message === "string" ? fields.message.replace(/\0/g, "").trim() : "";
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) return reply("invalid_message", 400);

    let email = null;
    if (typeof fields.email === "string" && fields.email.trim() !== "") {
      email = fields.email.trim();
      if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return reply("invalid_email", 400);
    }

    try {
      // Who is sending. A token that does not check out is treated as a guest.
      let userId = null;
      const auth = request.headers.get("authorization") || "";
      if (auth.toLowerCase().startsWith("bearer ")) {
        const { data } = await supabase.auth.getUser(auth.slice(7).trim());
        userId = data?.user?.id ?? null;
      }

      // 3.4 Shared rate limit, by IP and by account when signed in.
      const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
      const checks = [[hashKey("ip", ip), IP_LIMIT]];
      if (userId) checks.push([hashKey("user", userId), USER_LIMIT]);
      for (const [key, limit] of checks) {
        const { data, error } = await supabase.rpc("feedback_rate_check", {
          p_key: key,
          p_limit: limit.max,
          p_window_seconds: limit.windowSeconds,
        });
        if (error) throw error;
        if (data !== true) return reply("rate_limited", 429);
      }

      // 3.3 CAPTCHA. A token works once, so this runs after the cheap checks.
      if (!(await captchaPasses(fields.captchaToken, ip))) return reply("captcha", 400);

      // 3.5 Image. Check the real type, then re-encode: resize, WebP, no
      // metadata (EXIF and GPS), random name. Re-encoding also drops anything
      // hidden in a disguised file.
      let attachmentPath = null;
      let processed = null;
      if (image) {
        const input = Buffer.from(await image.arrayBuffer());
        if (input.byteLength > MAX_BODY_BYTES) return reply("too_large", 413);
        if (!sniffImage(input)) return reply("image_type", 415);
        try {
          processed = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS })
            .rotate()
            .resize({ width: IMAGE_SIDE, height: IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
            .webp({ quality: IMAGE_QUALITY })
            .toBuffer();
        } catch (error) {
          console.error("feedback: image processing failed", error);
          return reply("image_type", 415);
        }
        attachmentPath = `${randomUUID()}.webp`;
      }

      // 3.6 Store the file, then the row. If the row fails, remove the file.
      if (processed && attachmentPath) {
        const { error } = await supabase.storage
          .from("feedback")
          .upload(attachmentPath, processed, { contentType: "image/webp", upsert: false });
        if (error) throw error;
      }
      const { error: insertError } = await supabase.from("feedback").insert({
        type,
        message,
        email,
        user_id: userId,
        attachment_path: attachmentPath,
      });
      if (insertError) {
        if (attachmentPath) await supabase.storage.from("feedback").remove([attachmentPath]);
        throw insertError;
      }

      return reply("ok", 200);
    } catch (error) {
      // 3.7 The real error stays in the server log.
      console.error("feedback: failed", error);
      return reply("server", 500);
    }
  },
};
