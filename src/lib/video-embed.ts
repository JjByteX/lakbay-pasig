/**
 * Video links on discovery content (migration 0052). Staff paste a normal
 * YouTube or Facebook link, this file checks it, cleans it, and builds the
 * address a frame needs. Nothing else is accepted, so staff cannot put an
 * arbitrary site into a frame in the app.
 *
 * The stored value is the cleaned link (`normalizeVideoLink`). The embed
 * address is built from it each time an entry is shown (`parseVideoLink`),
 * so a change to how embeds are built never needs a data fix.
 */
export type VideoProvider = "youtube" | "facebook";

export interface ParsedVideo {
  provider: VideoProvider;
  /** The address the frame loads. */
  embedUrl: string;
  /** The video's own page, for the fallback link under the frame. */
  watchUrl: string;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Pasted without a scheme (youtu.be/abc) still counts. http is upgraded:
  // the app is https only, and an http frame would be blocked as mixed content.
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.protocol = "https:";
    return url;
  } catch {
    return null;
  }
}

function youtubeId(url: URL): string | null {
  let id: string | null = null;
  if (url.hostname === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "shorts" || first === "embed" || first === "live") id = second ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

// A Facebook video link has no id we can validate, so only the host and a
// video-shaped path are checked. fb.watch is a short link with no path shape.
function facebookLink(url: URL): string | null {
  if (url.hostname === "fb.watch") {
    return url.pathname.length > 1 ? `https://fb.watch${url.pathname}` : null;
  }
  if (!FACEBOOK_HOSTS.has(url.hostname)) return null;

  const path = url.pathname;
  const isWatch = path.startsWith("/watch") && url.searchParams.get("v");
  const isVideoPath = /\/(videos|reel|reels)\//.test(path);
  if (!isWatch && !isVideoPath) return null;

  // Keep only the video id on a /watch link. Everything else in the query is
  // tracking noise.
  if (isWatch) return `https://www.facebook.com/watch/?v=${encodeURIComponent(url.searchParams.get("v") ?? "")}`;
  return `https://www.facebook.com${path}`;
}

/** The cleaned link to store, or null when this is not a usable video link. */
export function normalizeVideoLink(input: string): string | null {
  const url = toUrl(input);
  if (!url) return null;

  const id = youtubeId(url);
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return facebookLink(url);
}

/** What a frame needs for a stored link, or null when it is not one we embed. */
export function parseVideoLink(stored: string): ParsedVideo | null {
  const url = toUrl(stored);
  if (!url) return null;

  const id = youtubeId(url);
  if (id) {
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  const facebook = facebookLink(url);
  if (facebook) {
    return {
      provider: "facebook",
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(facebook)}&show_text=false`,
      watchUrl: facebook,
    };
  }
  return null;
}
