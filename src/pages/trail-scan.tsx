import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Check, CircleNotch, MapPin, MapTrifold, QrCode } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { scanEntry, scanArrivalState, type ScanResult } from "@/lib/trail-scan";
import type { Coordinates } from "@/lib/discover-query";
import { formatDistance } from "@/lib/directions";
import { DURATION, EASE_OUT, SCAN_SUCCESS_HOLD_MS, SPRING_POP } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/public/page-container";
import { usePageTitle } from "@/lib/page-title";

// Why a position could not be read. Each one needs a different next step, so
// they are told apart instead of all reading "turn on location".
type LocationIssue = "denied" | "unavailable" | "unsupported";

const LOCATION_COPY: Record<LocationIssue, string> = {
  denied: "Location is blocked for this site. Allow it in your browser settings, then try again.",
  unavailable: "Couldn't get a GPS signal. Move to an open area and try again.",
  unsupported: "This browser can't share your location, so the stop can't be checked. Open this link in another browser.",
};

// After this long without a position, say what helps.
const SLOW_LOCATION_MS = 5000;

// One position read, not a watch: a scan is a single moment. Resolves with the
// reason when geolocation is missing, denied or times out, which the page
// reports as a specific next step rather than failing.
function readPosition(): Promise<{ position: Coordinates | null; issue: LocationIssue | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ position: null, issue: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ position: { latitude: p.coords.latitude, longitude: p.coords.longitude }, issue: null }),
      (e) => resolve({ position: null, issue: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// The two real steps of a scan, shown as they happen, not as fake progress.
function Progress({ label, hint }: Readonly<{ label: string; hint?: string }>) {
  return (
    <output className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-base text-muted-foreground">
        <CircleNotch
          weight="bold"
          className="h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span>{label}</span>
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </output>
  );
}

// The payoff. A flat primary disc pops in (the heart's pop spring) with one
// ring sent outward, then the stop's name settles in beneath it. It holds for
// SCAN_SUCCESS_HOLD_MS and the page opens the trail, where the entry reveals.
function Unlocked({ stopName }: Readonly<{ stopName: string }>) {
  const reduceMotion = useReducedMotion();
  return (
    <output className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center">
        {!reduceMotion && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-primary"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: DURATION.moment - 0.1, ease: EASE_OUT }}
          />
        )}
        <motion.span
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
          initial={reduceMotion ? false : { scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={SPRING_POP}
        >
          <Check weight="bold" className="h-8 w-8" aria-hidden="true" />
        </motion.span>
      </span>
      <motion.div
        className="flex flex-col gap-1"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, delay: 0.15, ease: EASE_OUT }}
      >
        <p className="text-base font-semibold text-foreground">Stop unlocked</p>
        <p className="text-sm text-muted-foreground">{stopName}</p>
      </motion.div>
    </output>
  );
}

// A scan that did not unlock: what went wrong and the one next step.
function ScanResultView({
  result,
  issue,
  onRetry,
  onOpen,
}: Readonly<{
  result: Exclude<ScanResult, { status: "unlocked" }>;
  issue: LocationIssue | null;
  onRetry: () => void;
  onOpen: (path: string) => void;
}>) {
  const tryAgain = (
    <Button variant="outline" onClick={onRetry}>
      Try again
    </Button>
  );

  if (result.status === "not-found") {
    return (
      <EmptyState
        icon={QrCode}
        action={
          <Button variant="outline" onClick={() => onOpen("/trails")}>
            Browse trails
          </Button>
        }
      >
        This code isn&apos;t part of a trail right now.
      </EmptyState>
    );
  }
  if (result.status === "no-location") {
    const reason = issue ?? "unavailable";
    return (
      <EmptyState icon={MapPin} action={reason === "unsupported" ? undefined : tryAgain}>
        {LOCATION_COPY[reason]}
      </EmptyState>
    );
  }
  if (result.status === "too-far") {
    return (
      <EmptyState icon={MapPin} action={tryAgain}>
        You&apos;re about {formatDistance(result.meters)} from this stop. Move within {Math.round(result.radius)} m and
        try again.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon={MapTrifold}
      action={
        <div className="flex flex-col gap-2">
          {result.trails.map((t) => (
            <Button key={t.id} variant="outline" onClick={() => onOpen(`/trails/${t.id}`)}>
              {t.name}
            </Button>
          ))}
        </div>
      }
    >
      Start a trail that includes this place and reach its stop, then scan again.
    </EmptyState>
  );
}

/**
 * /scan/:token, the link a QR code at an object holds. A phone's own camera
 * opens it, so the app needs no scanner. Everything is checked for the
 * visitor (signed in, on a trail with this stop unlocked, standing at the
 * stop), then the entry is unlocked and they land back on the trail. The
 * only controls are the ones a dead end needs: Sign in, Try again, or a
 * trail to open. docs/discovery-content-plan.md.
 *
 * The wait is two real steps, shown as they happen: finding the location,
 * then checking the code. A success holds a short "Stop unlocked"
 * confirmation, then opens the trail with the entry id in router state so the
 * trail page reveals exactly that entry (trail-scan.ts ScanArrival). Every
 * dead end says what to do next: how to get a location, how far to move, or
 * which trail to open.
 */
export default function TrailScanPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { openAuth } = useAuthModal();
  usePageTitle("Scan");
  const [result, setResult] = useState<Exclude<ScanResult, { status: "unlocked" }> | null>(null);
  const [unlocked, setUnlocked] = useState<Extract<ScanResult, { status: "unlocked" }> | null>(null);
  const [step, setStep] = useState<"locating" | "checking">("locating");
  const [slow, setSlow] = useState(false);
  const [issue, setIssue] = useState<LocationIssue | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session || !token) return;
    let cancelled = false;
    let hold: ReturnType<typeof setTimeout> | undefined;
    setResult(null);
    setUnlocked(null);
    setError(false);
    setIssue(null);
    setStep("locating");
    setSlow(false);

    const slowTimer = setTimeout(() => setSlow(true), SLOW_LOCATION_MS);

    readPosition()
      .then((reading) => {
        clearTimeout(slowTimer);
        if (cancelled) return null;
        setIssue(reading.issue);
        setStep("checking");
        return scanEntry(token, session.user.id, reading.position);
      })
      .then((r) => {
        if (cancelled || !r) return;
        if (r.status === "unlocked") {
          const { routeId, entryId } = r;
          setUnlocked(r);
          hold = setTimeout(() => {
            navigate(`/trails/${routeId}`, {
              replace: true,
              state: scanArrivalState({ entryId }),
            });
          }, SCAN_SUCCESS_HOLD_MS);
          return;
        }
        setResult(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      clearTimeout(hold);
    };
  }, [session, token, attempt, navigate]);

  if (loading) return null;

  const retry = () => setAttempt((n) => n + 1);

  let body;
  if (!session) {
    body = (
      <div className="flex flex-col items-start gap-4">
        <p className="text-base text-muted-foreground">Sign in to unlock this part of the trail.</p>
        <Button onClick={() => openAuth("login")}>Sign in</Button>
      </div>
    );
  } else if (error) {
    body = (
      <ErrorState onRetry={retry}>
        Couldn&apos;t check this code. Check your connection and try again.
      </ErrorState>
    );
  } else if (unlocked) {
    body = <Unlocked stopName={unlocked.stopName} />;
  } else if (result) {
    body = <ScanResultView result={result} issue={issue} onRetry={retry} onOpen={navigate} />;
  } else if (step === "locating") {
    body = (
      <Progress
        label="Finding your location…"
        hint={slow ? "Still looking for a GPS signal. An open area works best." : undefined}
      />
    );
  } else {
    body = <Progress label="Checking the code…" />;
  }

  return (
    <PageContainer>
      <h1 className="text-xl font-semibold text-foreground">Scan</h1>
      {body}
    </PageContainer>
  );
}
