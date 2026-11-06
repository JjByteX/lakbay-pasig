import { useCallback, useEffect, useRef, useState } from "react";
import { ImageSquare, X } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFeedbackModal } from "@/lib/feedback-modal";
import { useAuth } from "@/lib/auth-context";
import { useOnline } from "@/lib/offline/status";
import { ACCEPTED_TYPES, shrinkImage } from "@/lib/feedback-image";
import {
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  EMAIL_REASON,
  ERROR_TEXT,
  FEEDBACK_DESCRIPTION,
  FEEDBACK_LABEL,
  HINT_MESSAGE,
  HINT_OFFLINE,
  HINT_TYPE,
  IMAGE_ADD,
  IMAGE_HINT,
  IMAGE_LABEL,
  IMAGE_REMOVE,
  MESSAGE_LABEL,
  MESSAGE_MAX,
  MESSAGE_MIN,
  MESSAGE_PLACEHOLDER,
  SUBMIT_LABEL,
  SUBMIT_LOADING,
  SUCCESS_TEXT,
  TYPE_LABEL,
  TYPE_OPTIONS,
  TYPE_PLACEHOLDER,
  errorFor,
  type FeedbackType,
} from "@/lib/feedback-messages";

// Cloudflare Turnstile, loaded from its own script on first open so there is
// no new dependency. The public site key is VITE_TURNSTILE_SITE_KEY.
interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileLoading: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  turnstileLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      turnstileLoading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return turnstileLoading;
}

const SUCCESS_CLOSE_MS = 1200;

/**
 * Send Feedback modal (send-feedback-plan.md, Phase 4). A guest or a signed in
 * user picks a type, writes a message, and may add an email and one image.
 * Everything goes to /api/feedback, the only way feedback is written. The
 * session token rides along in the background when signed in.
 */
export function FeedbackModal() {
  const { open, closeFeedback } = useFeedbackModal();
  const { session } = useAuth();
  const online = useOnline();

  const [type, setType] = useState<FeedbackType | "">("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const captchaBox = useRef<HTMLDivElement>(null);
  const captchaId = useRef<string | null>(null);
  const captchaToken = useRef<string | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const resetCaptcha = useCallback(() => {
    captchaToken.current = null;
    if (captchaId.current && window.turnstile) window.turnstile.reset(captchaId.current);
  }, []);

  // The check mounts while the modal is open and is removed when it closes.
  // "interaction-only" keeps it invisible unless Cloudflare needs a click.
  useEffect(() => {
    if (!open || !siteKey) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        const box = captchaBox.current;
        if (cancelled || !box || !window.turnstile || captchaId.current) return;
        captchaId.current = window.turnstile.render(box, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: (token: string) => {
            captchaToken.current = token;
          },
          "expired-callback": () => {
            captchaToken.current = null;
          },
          "error-callback": () => {
            captchaToken.current = null;
          },
        });
      })
      .catch(() => {
        /* No token arrives, so Send shows the check error. */
      });
    return () => {
      cancelled = true;
      if (captchaId.current && window.turnstile) window.turnstile.remove(captchaId.current);
      captchaId.current = null;
      captchaToken.current = null;
    };
  }, [open, siteKey]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function clearForm() {
    setType("");
    setMessage("");
    setEmail("");
    setHoneypot("");
    setImage(null);
    setSending(false);
    setSent(false);
    setError(null);
    setImageError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (next) return;
    // Fields stay locked while a send is running.
    if (sending) return;
    window.clearTimeout(closeTimer.current);
    closeFeedback();
    clearForm();
  }

  async function pickImage(file: File | undefined) {
    setImageError(null);
    if (!file) return;
    const result = await shrinkImage(file);
    if ("problem" in result) {
      setImage(null);
      setImageError(ERROR_TEXT[result.problem]);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setImage(result.file);
  }

  function removeImage() {
    setImage(null);
    setImageError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // The check usually finishes while the person types. If it has not, wait a
  // few seconds for it before giving up.
  async function waitForToken(): Promise<string | null> {
    for (let i = 0; i < 40 && !captchaToken.current; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return captchaToken.current;
  }

  const trimmed = message.trim();
  const ready = type !== "" && trimmed.length >= MESSAGE_MIN;
  let hint: string | null = null;
  if (!online) hint = HINT_OFFLINE;
  else if (type === "") hint = HINT_TYPE;
  else if (trimmed.length < MESSAGE_MIN) hint = HINT_MESSAGE;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || sending || !online) return;
    setSending(true);
    setError(null);
    try {
      const token = await waitForToken();
      if (!token) {
        setError(ERROR_TEXT.captcha);
        return;
      }
      const body = new FormData();
      body.set("type", type);
      body.set("message", trimmed);
      if (email.trim()) body.set("email", email.trim());
      body.set("captchaToken", token);
      body.set("website", honeypot);
      if (image) body.set("image", image);

      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      let res: Response;
      try {
        res = await fetch("/api/feedback", { method: "POST", body, headers });
      } catch {
        setError(ERROR_TEXT.network);
        return;
      }
      if (res.ok) {
        setSent(true);
        closeTimer.current = window.setTimeout(() => {
          closeFeedback();
          clearForm();
        }, SUCCESS_CLOSE_MS);
        return;
      }
      let code: string | undefined;
      try {
        code = ((await res.json()) as { error?: string }).error;
      } catch {
        code = undefined;
      }
      setError(errorFor(code));
    } finally {
      // A token works once, so every attempt needs a new one.
      resetCaptcha();
      setSending(false);
    }
  }

  const locked = sending || sent;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{FEEDBACK_LABEL}</DialogTitle>
          <DialogDescription>{FEEDBACK_DESCRIPTION}</DialogDescription>
        </DialogHeader>

        {sent ? (
          <output className="py-6 text-center text-sm font-semibold">{SUCCESS_TEXT}</output>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-type">{TYPE_LABEL}</Label>
              <Select value={type} onValueChange={(v) => setType(v as FeedbackType)} disabled={locked}>
                <SelectTrigger id="feedback-type">
                  <SelectValue placeholder={TYPE_PLACEHOLDER} />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-message">{MESSAGE_LABEL}</Label>
              <Textarea
                id="feedback-message"
                rows={4}
                maxLength={MESSAGE_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={MESSAGE_PLACEHOLDER}
                disabled={locked}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-email">{EMAIL_LABEL}</Label>
              <Input
                id="feedback-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={EMAIL_PLACEHOLDER}
                disabled={locked}
              />
              <p className="text-xs text-muted-foreground">{EMAIL_REASON}</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-image">{IMAGE_LABEL}</Label>
              <input
                ref={fileRef}
                id="feedback-image"
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="sr-only"
                disabled={locked}
                onChange={(e) => void pickImage(e.target.files?.[0])}
              />
              {image ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm">{image.name}</p>
                  <Button type="button" variant="outline" size="sm" disabled={locked} onClick={removeImage}>
                    <X className="mr-1 h-4 w-4" aria-hidden="true" />
                    {IMAGE_REMOVE}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked}
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImageSquare className="mr-1 h-4 w-4" aria-hidden="true" />
                    {IMAGE_ADD}
                  </Button>
                  <p className="text-xs text-muted-foreground">{IMAGE_HINT}</p>
                </div>
              )}
              {imageError && (
                <p role="alert" className="text-xs text-destructive">
                  {imageError}
                </p>
              )}
            </div>

            {/* Honeypot. Hidden from people and screen readers, bots fill it. */}
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label htmlFor="feedback-website">Website</label>
              <input
                id="feedback-website"
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div ref={captchaBox} />

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button type="submit" size="lg" loading={sending} disabled={!ready || !online}>
                {sending ? SUBMIT_LOADING : SUBMIT_LABEL}
              </Button>
              {hint && !sending && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
