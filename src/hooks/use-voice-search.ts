import { useCallback, useEffect, useRef, useState } from "react";

// Voice search, client side. Records a few seconds from the microphone with
// the browser's MediaRecorder, POSTs the audio to /api/transcribe (a Vercel
// function that forwards it to Groq's hosted Whisper, see api/transcribe.js),
// and hands the returned text to the caller. Not the browser's built-in
// SpeechRecognition: that is missing in Firefox, sends audio to Google, and
// cannot be told local names, while this works in any browser that can record.

export type VoiceStatus = "idle" | "recording" | "transcribing";

// A search is a few words. Stopping by itself keeps a forgotten recording
// from running on, and from using the shared daily audio allowance.
const MAX_RECORD_MS = 8000;
// Shorter than this is a tap, not speech.
const MIN_RECORD_MS = 500;

// First one the browser supports wins. Chrome and Firefox record webm or ogg,
// Safari records mp4. The server accepts all of them.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** False when the browser cannot record (old browser, or a page not on HTTPS). */
export function isVoiceSearchSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow it in your browser settings.";
  }
  if (name === "NotFoundError") return "No microphone found.";
  return "Couldn't start the microphone.";
}

function statusErrorMessage(status: number): string {
  if (status === 429) return "Voice search is busy right now. Please type instead.";
  if (status === 404 || status === 500) return "Voice search isn't available here.";
  if (status === 413) return "That recording was too long. Try a shorter phrase.";
  return "Voice search failed. Please type instead.";
}

// Whisper ends a spoken phrase with a full stop ("Bonete."), which is noise
// in a search box.
function tidy(text: string): string {
  return text.trim().replace(/[.!?。]+$/, "").trim();
}

export function useVoiceSearch(onText: (text: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const unmountedRef = useRef(false);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setStatus("transcribing");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
        signal: controller.signal,
      });
      if (!res.ok) {
        setError(statusErrorMessage(res.status));
        return;
      }

      const data: unknown = await res.json();
      const text =
        data && typeof data === "object" && "text" in data && typeof data.text === "string"
          ? tidy(data.text)
          : "";
      if (!text) {
        setError("Didn't catch that. Tap the mic and try again.");
        return;
      }
      onTextRef.current(text);
    } catch (err: unknown) {
      // An abort is the page closing or the user leaving, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // A 200 that is not JSON is the dev server's fallback page: no function.
      setError("Voice search isn't available here.");
    } finally {
      abortRef.current = null;
      if (!unmountedRef.current) setStatus("idle");
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, [clearTimer]);

  const start = useCallback(async () => {
    if (status !== "idle") return;
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      setError(micErrorMessage(err));
      return;
    }

    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("Voice search isn't supported in this browser.");
      return;
    }

    const chunks: Blob[] = [];
    const startedAt = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      // Release the microphone straight away so the browser's recording
      // indicator turns off before the upload.
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      clearTimer();
      if (unmountedRef.current) return;

      if (Date.now() - startedAt < MIN_RECORD_MS) {
        setStatus("idle");
        setError("Didn't catch that. Tap the mic and speak.");
        return;
      }
      const type = recorder.mimeType || mimeType || "audio/webm";
      void transcribe(new Blob(chunks, { type }));
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    setStatus("recording");
    timerRef.current = window.setTimeout(stop, MAX_RECORD_MS);
  }, [status, clearTimer, stop, transcribe]);

  // Leaving the page mid recording must release the microphone and drop any
  // upload in flight. The flag is reset on mount too, since React's dev
  // StrictMode runs this cleanup once before the real mount.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearTimer();
      abortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [clearTimer]);

  return { status, error, start, stop, clearError: () => setError(null) };
}
