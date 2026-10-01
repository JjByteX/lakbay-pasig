// Voice search, server side. The browser records a few seconds of audio and
// POSTs the raw bytes here; this forwards them to Groq's hosted Whisper and
// returns { text }. It exists only to keep GROQ_API_KEY off the client: a key
// in the app bundle would be public. Plain JS with no imports, so it needs no
// package and no build step. Vercel serves /api/transcribe from this file
// (vercel.json's catch-all rewrite skips /api).
//
// Env (Vercel project settings, never VITE_ prefixed, so it stays server only):
//   GROQ_API_KEY         required, a free key from console.groq.com
//   GROQ_STT_MODEL       optional, default whisper-large-v3
//   GROQ_STT_LANGUAGE    optional ISO 639-1 code (e.g. "tl") to force one
//                        language. Unset, Whisper detects it, which is the
//                        right default for English, Tagalog and Taglish
//                        queries but can guess wrong on very short clips.
//                        Set it only if testing shows that happening.

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3";
const LANGUAGE = process.env.GROQ_STT_LANGUAGE || "";

// A search is a few seconds. Opus audio of that length is well under 200 KB,
// so 1 MB is generous and keeps one request from burning the shared daily
// audio allowance. Vercel's own request body limit is 4.5 MB.
const MAX_BYTES = 1_000_000;
// Smaller than this is a tap with no speech in it.
const MIN_BYTES = 1_000;

// Whisper takes a short prompt as vocabulary context. Seeding it with local
// names and a little Taglish helps it spell them right.
const PROMPT =
  "Searching places, shops, food and events in Pasig City, Philippines. " +
  "Bonete, Dimas-Alang, Kapitolyo, Ortigas, Pasig River, simbahan, museo, pasalubong, adobo.";

// audio type -> file extension Groq uses to recognize the format
const EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

// Best effort per-IP limit. Serverless instances do not share memory, so this
// only slows a script hammering one instance. It is a speed bump, not a wall:
// the shared Groq daily cap is the real ceiling.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map();

function tooManyFrom(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Whisper invents text ("Thank you.") on silence. Its own per segment scores
// flag those: drop a segment it thinks is not speech and is low confidence.
function cleanText(data) {
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    return data.segments
      .filter((s) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -1))
      .map((s) => String(s.text ?? ""))
      .join(" ")
      .trim();
  }
  return typeof data.text === "string" ? data.text.trim() : "";
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return reply({ error: "method" }, 405);

    const key = process.env.GROQ_API_KEY;
    if (!key) return reply({ error: "not_configured" }, 500);

    // Same site only. Browsers always send Origin on a POST; a different host
    // means another site's page is calling this.
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* falls through to the mismatch below */
      }
      if (originHost !== host) return reply({ error: "forbidden" }, 403);
    }

    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (tooManyFrom(ip)) return reply({ error: "busy" }, 429);

    const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const extension = EXTENSIONS[type];
    if (!extension) return reply({ error: "unsupported" }, 415);

    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return reply({ error: "too_large" }, 413);

    const audio = await request.arrayBuffer();
    if (audio.byteLength > MAX_BYTES) return reply({ error: "too_large" }, 413);
    if (audio.byteLength < MIN_BYTES) return reply({ text: "" });

    const form = new FormData();
    form.append("file", new Blob([audio], { type }), `voice.${extension}`);
    form.append("model", MODEL);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    form.append("prompt", PROMPT);
    if (LANGUAGE) form.append("language", LANGUAGE);

    let upstream;
    try {
      upstream = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
    } catch {
      return reply({ error: "upstream" }, 502);
    }

    // Groq's free plan is rate limited; tell the client it is just busy.
    if (upstream.status === 429) return reply({ error: "busy" }, 429);
    if (!upstream.ok) return reply({ error: "upstream" }, 502);

    let data;
    try {
      data = await upstream.json();
    } catch {
      return reply({ error: "upstream" }, 502);
    }

    return reply({ text: cleanText(data).slice(0, 100) });
  },
};
