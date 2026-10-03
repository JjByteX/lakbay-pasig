import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { fetchPublishedFiesta, type PublicFiesta } from "@/lib/fiestas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerificationBadge } from "@/components/public/result-card";
import { PageContainer } from "@/components/public/page-container";
import { usePageTitle } from "@/lib/page-title";

// Public fiesta page (migrations 0044 and 0045), reached from a search
// result. Same structure as event-detail.tsx: back button top left,
// loading, not-found and loaded states, nested under PublicShell so the
// bottom nav and top bar stay. Published rows only: a missing id and an
// unpublished one read the same, as there.
//
// A published fiesta is one CATO confirmed, so it carries the same
// "Verified by Pasig Tourism Office" seal places do.
export default function FiestaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fiesta, setFiesta] = useState<PublicFiesta | null>(null);
  usePageTitle(fiesta?.name ?? "Fiestas");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setPlaceName(null);

    fetchPublishedFiesta(id).then((row) => {
      if (!row) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setFiesta(row);
      setLoading(false);
      if (row.related_place_id) {
        supabase
          .from("places")
          .select("name")
          .eq("id", row.related_place_id)
          .maybeSingle()
          .then(({ data }) => setPlaceName(data?.name ?? null));
      }
    });
  }, [id]);

  const where = fiesta ? [...fiesta.barangays, ...(fiesta.community ? [fiesta.community] : [])] : [];

  return (
    <PageContainer width="narrow">
      <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {loading && <p className="text-base text-muted-foreground">Loading…</p>}

      {!loading && notFound && (
        <p className="text-base text-muted-foreground">This fiesta couldn&apos;t be found.</p>
      )}

      {!loading && fiesta && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">{fiesta.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[fiesta.date_label, fiesta.patron_saint].filter(Boolean).join(" · ")}
            </p>
            {where.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {where.map((name) => (
                  <Badge key={name} variant="secondary">
                    {name}
                  </Badge>
                ))}
              </div>
            )}
            <VerificationBadge status="verified" />
          </div>

          {fiesta.description && <p className="text-base text-foreground">{fiesta.description}</p>}

          {fiesta.history && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">History</h2>
              <p className="whitespace-pre-line text-base text-muted-foreground">{fiesta.history}</p>
            </div>
          )}

          {fiesta.related_place_id && placeName && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Related place</h2>
              <Link
                to={`/discover/place/${fiesta.related_place_id}`}
                className="w-fit text-base text-primary underline-offset-4 hover:underline"
              >
                {placeName}
              </Link>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
