import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, MapPin, MapTrifold, QrCode } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { scanEntry, scanArrivalState, type ScanResult } from "@/lib/trail-scan";
import type { Coordinates } from "@/lib/discover-query";
import { formatDistance } from "@/lib/directions";
import {
  EASE_OUT,
  EASE_SCREEN,
  SCAN_SUCCESS_HOLD_MS,
  SCREEN_SHIFT,
  SPRING_ARRIVE,
  SPRING_STAMP,
} from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/public/page-container";
import { RevealWords, RollingText } from "@/components/public/text-motion";
import { SquareLoader } from "@/components/public/square-loader";
import { Burst } from "@/components/public/burst";
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

// Screen-to-screen travel, the same slide onboarding's Screen uses, so the
// scan's states (waiting, unlocked, a dead end) feel like one flow.
const screenVariants = {
  enter: { opacity: 0, x: SCREEN_SHIFT },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -SCREEN_SHIFT },
};

function Screen({ children }: Readonly<{ children: ReactNode }>) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={screenVariants}
      initial={reduceMotion ? false : "enter"}
      animate="center"
      exit={reduceMotion ? undefined : "exit"}
      transition={{ duration: 0.28, ease: EASE_SCREEN }}
    >
      {children}
    </motion.div>
  );
}

// Two segments for the two real steps, filled as each begins (onboarding's
// progress bar). It shows where the scan is, it does not guess how long is left.
function ScanSteps({ reached }: Readonly<{ reached: 1 | 2 }>) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex gap-2" role="progressbar" aria-label="Scan progress" aria-valuemin={1} aria-valuemax={2} aria-valuenow={reached}>
      {[1, 2].map((n) => (
        <span key={n} className="h-1 flex-1 overflow-hidden rounded-lg bg-border">
          <motion.span
            className="block h-full origin-left bg-primary"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: n <= reached ? 1 : 0 }}
            transition={{ ...SPRING_ARRIVE, stiffness: 140 }}
          />
        </span>
      ))}
    </div>
  );
}

// The two real steps of a scan, shown as they happen, not as fake progress.
// The label rolls from one step to the next, and a slow GPS hint rises in.
function Progress({ step, hint }: Readonly<{ step: "locating" | "checking"; hint?: string }>) {
  const reduceMotion = useReducedMotion();
  const label = step === "locating" ? "Finding your location…" : "Checking the code…";
  return (
    <output className="flex flex-col gap-4 py-6">
      <div className="flex items-center gap-3">
        <SquareLoader size="sm" />
        <span className="text-base text-muted-foreground">
          <RollingText text={label} />
        </span>
      </div>
      <ScanSteps reached={step === "locating" ? 1 : 2} />
      <AnimatePresence initial={false}>
        {hint && (
          <motion.p
            key="hint"
            className="text-sm text-muted-foreground"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={SPRING_ARRIVE}
          >
            {hint}
          </motion.p>
        )}
      </AnimatePresence>
    </output>
  );
}

// The payoff. A flat primary disc stamps in with a half turn (onboarding's
// finish check), a ring and eight dots leave it, and "Stop unlocked" rises
// word by word with the stop's name settling under it. It holds for
// SCAN_SUCCESS_HOLD_MS and the page opens the trail, where the entry reveals.
function Unlocked({ stopName }: Readonly<{ stopName: string }>) {
  const reduceMotion = useReducedMotion();
  return (
    <output className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center">
        <Burst />
        <motion.span
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
          initial={reduceMotion ? false : { scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={SPRING_STAMP}
        >
          <Check weight="bold" className="h-8 w-8" aria-hidden="true" />
        </motion.span>
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold text-foreground">
          <RevealWords text="Stop unlocked" delay={0.25} />
        </p>
        <motion.p
          className="text-sm text-muted-foreground"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_ARRIVE, delay: 0.6 }}
        >
          {stopName}
        </motion.p>
      </div>
    </output>
  );
}

// One small side to side shake once the "too far" screen has arrived: the
// answer is "not yet", and it moves like one.
function ShakeOnce({ children }: Readonly<{ children: ReactNode }>) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={reduceMotion ? undefined : { x: [0, -8, 8, -5, 5, 0] }}
      transition={{ duration: 0.4, delay: 0.35, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
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
      <ShakeOnce>
        <EmptyState icon={MapPin} action={tryAgain}>
          You&apos;re about {formatDistance(result.meters)} from this stop. Move within {Math.round(result.radius)} m
          and try again.
        </EmptyState>
      </ShakeOnce>
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
 * then checking the code, with the onboarding loader and a two segment bar
 * that fills as each begins. A success holds a short "Stop unlocked"
 * confirmation, then opens the trail with the entry id in router state so the
 * trail page reveals exactly that entry (trail-scan.ts ScanArrival). Every
 * dead end says what to do next: how to get a location, how far to move, or
 * which trail to open.
 *
 * The states slide into each other the way onboarding's screens do. Motion
 * language is onboarding's (lib/motion.ts), and all of it is off under reduced
 * motion.
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

  let viewKey: string;
  let body: ReactNode;
  if (!session) {
    viewKey = "signin";
    body = (
      <div className="flex flex-col items-start gap-4">
        <p className="text-base text-muted-foreground">Sign in to unlock this part of the trail.</p>
        <Button onClick={() => openAuth("login")}>Sign in</Button>
      </div>
    );
  } else if (error) {
    viewKey = "error";
    body = (
      <ErrorState onRetry={retry}>
        Couldn&apos;t check this code. Check your connection and try again.
      </ErrorState>
    );
  } else if (unlocked) {
    viewKey = "unlocked";
    body = <Unlocked stopName={unlocked.stopName} />;
  } else if (result) {
    viewKey = `result-${result.status}`;
    body = <ScanResultView result={result} issue={issue} onRetry={retry} onOpen={navigate} />;
  } else {
    // One key for both steps: the label rolls inside it instead of the whole
    // screen sliding away and back.
    viewKey = "progress";
    body = (
      <Progress
        step={step}
        hint={step === "locating" && slow ? "Still looking for a GPS signal. An open area works best." : undefined}
      />
    );
  }

  return (
    <PageContainer>
      <h1 className="text-xl font-semibold text-foreground">Scan</h1>
      <AnimatePresence mode="wait">
        <Screen key={viewKey}>{body}</Screen>
      </AnimatePresence>
    </PageContainer>
  );
}
