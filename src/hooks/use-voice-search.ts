import { useCallback, useEffect, useRef, useState } from "react";

// Voice search, client side. Records from the microphone with the browser's
// MediaRecorder, POSTs the audio to /api/transcribe (a Vercel function that
// forwards it to Groq's hosted Whisper, see api/transcribe.js), and hands the
// returned text to the caller. Not the browser's built-in SpeechRecognition:
// that is missing in Firefox, sends audio to Google, and cannot be told local
// names, while this works in any browser that can record.
//
// Recording ends by itself, like Google's voice search: about a second after
// the person stops talking, or after 5 seconds if they never start. The volume
// is read with the Web Audio API (no package). Tapping the mic still stops it
// by hand, and the 8 second cap is the backstop when the room is too noisy for
// the silence check to ever hear quiet.

export type VoiceStatus = "idle" | "recording" | "transcribing";

// A search is a few words. Stopping by itself keeps a forgotten recording
// from running on, and from using the shared daily audio allowance.
const MAX_RECORD_MS = 8000;
// Shorter than this is a tap, not speech.
const MIN_RECORD_MS = 500;

// Auto-stop tuning. These are the knobs to turn after testing in a noisy
// place (a busy street, a jeepney). Volume is RMS, 0 (silent) to 1 (clipping).
const VAD = {
  tickMs: 100, // how often the volume is read
  calibrateTicks: 3, // first reads set the background noise level
  noSpeechMs: 5000, // nobody spoke: stop and say so, upload nothing
  silenceMs: 1000, // quiet this long after speech: done
  minRms: 0.015, // never treat anything below this as speech
  maxRms: 0.1, // speech threshold ceiling, so loud rooms still detect speech
  noiseFactor: 2.5, // speech must be this much louder than the background
};

type Endpoint = "wait" | "silence" | "no-speech";

// Pure decision, no browser calls. Fed one volume reading per tick plus the
// milliseconds since recording began, it says whether to keep waiting.
function createEndpointer() {
  let reads = 0;
  let noise = 1;
  let heard = false;
  let quietSince = 0;
  return (rms: number, elapsed: number): Endpoint => {
    // The lowest of the first reads is the background, even if the person
    // starts talking straight away.
    if (reads < VAD.calibrateTicks) {
      reads += 1;
      noise = Math.min(noise, rms);
      return "wait";
    }
    const threshold = Math.min(VAD.maxRms, Math.max(VAD.minRms, noise * VAD.noiseFactor));
    if (rms >= threshold) {
      heard = true;
      quietSince = 0;
      return "wait";
    }
    if (!heard) return elapsed >= VAD.noSpeechMs ? "no-speech" : "wait";
    if (quietSince === 0) quietSince = elapsed;
    return elapsed - quietSince >= VAD.silenceMs ? "silence" : "wait";
  };
}

// Reads the microphone volume every tick. Returns a function that stops it.
// Throws if Web Audio is unavailable; the caller treats that as "no auto-stop".
function openMeter(stream: MediaStream, onRms: (rms: number) => void): () => void {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  void ctx.resume();

  const buf = new Uint8Array(analyser.fftSize);
  const id = window.setInterval(() => {
    // A suspended context (iOS before a gesture) reads flat silence, which
    // would look like nobody spoke. Skip those ticks instead.
    if (ctx.state !== "running") return;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = (buf[i] - 128) / 128;
      sum += x * x;
    }
    onRms(Math.sqrt(sum / buf.length));
  }, VAD.tickMs);

  return () => {
    window.clearInterval(id);
    void ctx.close();
  };
}

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
const TRAILING_PUNCTUATION = new Set([".", "!", "?", "。"]);

function tidy(text: string): string {
  const trimmed = text.trim();
  let end = trimmed.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(trimmed[end - 1])) end -= 1;
  return trimmed.slice(0, end).trim();
}

export function useVoiceSearch(onText: (text: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Voice loudness in 5 steps (0 to 4) for the mic indicator. Steps, not the
  // raw reading, so the search bar re-renders a few times a second at most.
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const meterRef = useRef<(() => void) | null>(null);
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

  const stopMeter = useCallback(() => {
    meterRef.current?.();
    meterRef.current = null;
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
    stopMeter();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, [clearTimer, stopMeter]);

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
    // Set by the silence check when nobody spoke, so nothing is uploaded.
    let noSpeech = false;

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
      stopMeter();
      if (unmountedRef.current) return;
      setLevel(0);

      if (noSpeech) {
        setStatus("idle");
        setError("Didn't catch that. Tap the mic and try again.");
        return;
      }
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
    // A short buzz on phones says the mic is live. Absent on iOS and desktop.
    if ("vibrate" in navigator) navigator.vibrate(30);
    timerRef.current = window.setTimeout(stop, MAX_RECORD_MS);

    try {
      const endpoint = createEndpointer();
      meterRef.current = openMeter(stream, (rms) => {
        // ponytail: x20 maps typical speech (0.05 to 0.2) onto steps 1 to 4.
        setLevel(Math.min(4, Math.round(rms * 20)));
        const action = endpoint(rms, Date.now() - startedAt);
        if (action === "wait") return;
        noSpeech = action === "no-speech";
        stop();
      });
    } catch {
      // No Web Audio here: no auto-stop and no level, but the tap and the
      // 8 second cap still end the recording.
    }
  }, [status, clearTimer, stopMeter, stop, transcribe]);

  // Leaving the page mid recording must release the microphone and drop any
  // upload in flight. The flag is reset on mount too, since React's dev
  // StrictMode runs this cleanup once before the real mount.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearTimer();
      stopMeter();
      abortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [clearTimer, stopMeter]);

  return { status, error, level, start, stop, clearError: () => setError(null) };
}
