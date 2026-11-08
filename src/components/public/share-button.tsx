import { useEffect, useRef, useState } from "react";
import { ShareNetwork } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  kind: "place" | "business";
  id: string;
  name: string;
}

const COPIED_MS = 2000;

/**
 * Shares a place or business's detail page link. Phones get the native share
 * sheet (Messenger, Viber, SMS and so on); browsers without one copy the link
 * and say so. The link is the detail page, not a route: the person who opens
 * it taps Directions from their own location.
 */
export function ShareButton({ kind, id, name }: Readonly<ShareButtonProps>) {
  const [message, setMessage] = useState<string | null>(null);
  // True while the share sheet or the copy is open, so a second tap cannot
  // start another and race the status message.
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function say(text: string) {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), COPIED_MS);
  }

  async function handleShare() {
    if (pending) return;
    setPending(true);
    try {
      await shareLink();
    } finally {
      setPending(false);
    }
  }

  async function shareLink() {
    const url = `${globalThis.location.origin}/discover/${kind}/${id}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: name, url });
      } catch (err) {
        // Closing the share sheet is a choice, not a failure.
        if (!(err instanceof DOMException && err.name === "AbortError")) say("Couldn't share this link.");
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      say("Link copied.");
    } catch {
      say("Couldn't copy the link.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={pending}
        onClick={handleShare}
      >
        <ShareNetwork weight="bold" className="h-4 w-4" aria-hidden="true" />
        Share
      </Button>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
