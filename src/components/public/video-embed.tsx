import { ArrowSquareOut } from "@phosphor-icons/react";
import { parseVideoLink } from "@/lib/video-embed";

const PROVIDER_NAME = { youtube: "YouTube", facebook: "Facebook" } as const;

/**
 * A YouTube or Facebook video shown inside the page, with a plain link under
 * it. The link is the fallback: an embed can be blank when the video is
 * private, removed, or the visitor's browser blocks Facebook, and the frame
 * gives no signal when that happens. Renders nothing for a link we do not
 * embed, so a bad stored value never shows a broken frame.
 *
 * Loaded lazily so a trail with several videos does not fetch them all up
 * front. Same 16:9 box and radius as the entry photo. The frame is sandboxed
 * to what a player needs. YouTube uses the no-cookie address.
 */
export function VideoEmbed({ url, title }: Readonly<{ url: string; title: string }>) {
  const video = parseVideoLink(url);
  if (!video) return null;

  const providerName = PROVIDER_NAME[video.provider];

  return (
    <div className="my-1 flex flex-col gap-2">
      <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
        <iframe
          title={`${title} (video)`}
          src={video.embedUrl}
          loading="lazy"
          className="h-full w-full border-0"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
      <a
        href={video.watchUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 self-start text-sm text-foreground underline"
      >
        Watch on {providerName}
        <ArrowSquareOut className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  );
}
