import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, MapTrifold, QrCode } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { scanEntry, type ScanResult } from "@/lib/trail-scan";
import type { Coordinates } from "@/lib/discover-query";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/public/page-container";
import { usePageTitle } from "@/lib/page-title";

// One position read, not a watch: a scan is a single moment. Resolves null
// when geolocation is missing, denied or times out, which the page reports
// as "turn on location" rather than failing.
function readPosition(): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/**
 * /scan/:token, the link a QR code at an object holds. A phone's own camera
 * opens it, so the app needs no scanner. Everything is checked for the
 * visitor (signed in, on a trail with this stop unlocked, standing at the
 * stop), then the entry is unlocked and they land back on the trail. The
 * only controls are the ones a dead end needs: Sign in, Try again, or a
 * trail to open. docs/discovery-content-plan.md.
 */
export default function TrailScanPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { openAuth } = useAuthModal();
  usePageTitle("Scan");
  const [result, setResult] = useState<Exclude<ScanResult, { status: "unlocked" }> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session || !token) return;
    let cancelled = false;
    setResult(null);
    setError(false);

    readPosition()
      .then((position) => scanEntry(token, session.user.id, position))
      .then((r) => {
        if (cancelled) return;
        if (r.status === "unlocked") {
          navigate(`/trails/${r.routeId}`, { replace: true });
          return;
        }
        setResult(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [session, token, attempt, navigate]);

  if (loading) return null;

  const tryAgain = (
    <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
      Try again
    </Button>
  );

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
      <ErrorState onRetry={() => setAttempt((n) => n + 1)}>
        Couldn&apos;t check this code. Check your connection and try again.
      </ErrorState>
    );
  } else if (!result) {
    body = <p className="text-base text-muted-foreground">Checking the code…</p>;
  } else if (result.status === "not-found") {
    body = <EmptyState icon={QrCode}>This code isn&apos;t part of a trail right now.</EmptyState>;
  } else if (result.status === "no-location") {
    body = (
      <EmptyState icon={MapPin} action={tryAgain}>
        Turn on location so we can check you are at the object.
      </EmptyState>
    );
  } else if (result.status === "too-far") {
    body = (
      <EmptyState icon={MapPin} action={tryAgain}>
        You&apos;re too far from this stop. Move closer and try again.
      </EmptyState>
    );
  } else {
    body = (
      <EmptyState
        icon={MapTrifold}
        action={
          <div className="flex flex-col gap-2">
            {result.trails.map((t) => (
              <Button key={t.id} variant="outline" onClick={() => navigate(`/trails/${t.id}`)}>
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

  return (
    <PageContainer>
      <h1 className="text-xl font-semibold text-foreground">Scan</h1>
      {body}
    </PageContainer>
  );
}
