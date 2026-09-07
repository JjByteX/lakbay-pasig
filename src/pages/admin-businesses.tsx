import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  computeBusinessQueuePriority,
  type BusinessQueueCandidate,
  type PrioritizedBusiness,
} from "@/lib/business-queue-priority";

// 6.2: columns per build-3-phases-plan.md 6.2 — name, business type,
// verification status, featured status, flagged indicator. Row action menu:
// view, verify, reject, toggle featured. The verify/reject/feature actions
// themselves are later phases (6.6, 6.7); this page only routes to them,
// same deferred pattern admin-places.tsx already uses for its own
// not-yet-built verify/reject dialog.

const STATUS_VARIANT = {
  pending: "outline",
  verified: "default",
  unverified: "destructive",
} as const;

export default function AdminBusinessesPage() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<PrioritizedBusiness[] | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: rows } = await supabase
        .from("businesses")
        .select("id, name, business_type, description, verification_status, featured_status, submitted_by, updated_at");

      if (!rows || rows.length === 0) {
        if (!cancelled) {
          setBusinesses([]);
          setFlaggedIds(new Set());
        }
        return;
      }

      const businessIds = rows.map((r) => r.id);
      const submitterIds = Array.from(new Set(rows.map((r) => r.submitted_by)));

      // Signals the priority function accepts as optional input, per
      // business-queue-priority.ts's file header: hasPhotos and
      // accountCreatedAt are fetched here, not inside the pure function.
      const [photosRes, profilesRes, flagsRes] = await Promise.all([
        supabase.from("business_photos").select("business_id").in("business_id", businessIds),
        supabase.from("profiles").select("id, created_at").in("id", submitterIds),
        supabase.from("business_flags").select("business_id").in("business_id", businessIds).eq("resolved", false),
      ]);

      const businessIdsWithPhotos = new Set((photosRes.data ?? []).map((p) => p.business_id));
      const createdAtByProfile = new Map(
        (profilesRes.data ?? []).map((p: any) => [p.id, p.created_at as string | null])
      );
      const flaggedBusinessIds = new Set((flagsRes.data ?? []).map((f) => f.business_id));

      const candidates: BusinessQueueCandidate[] = rows.map((row) => ({
        id: row.id,
        submittedBy: row.submitted_by,
        description: row.description,
        verificationStatus: row.verification_status,
        updatedAt: row.updated_at,
        accountCreatedAt: createdAtByProfile.get(row.submitted_by) ?? null,
        hasPhotos: businessIdsWithPhotos.has(row.id),
      }));

      const prioritized = computeBusinessQueuePriority(candidates).map((p) => {
        const original = rows.find((r) => r.id === p.id)!;
        return { ...p, name: original.name, business_type: original.business_type, featured_status: original.featured_status } as any;
      });

      if (!cancelled) {
        setBusinesses(prioritized);
        setFlaggedIds(flaggedBusinessIds);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Businesses</h1>
      </div>

      {businesses === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No businesses yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Business Type</TableHead>
              <TableHead>Verification Status</TableHead>
              <TableHead>Featured Status</TableHead>
              <TableHead>Flagged</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.map((business: any) => (
              <TableRow key={business.id}>
                <TableCell className="font-semibold text-foreground">{business.name}</TableCell>
                <TableCell>{business.business_type}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[business.verificationStatus as keyof typeof STATUS_VARIANT]}>
                    {business.verificationStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={business.featured_status === "featured" ? "accent" : "secondary"}>
                    {business.featured_status === "featured" ? "Featured" : "Listed"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {flaggedIds.has(business.id) && (
                    <Badge variant="accent" className="gap-1">
                      <Flag className="h-3 w-3" />
                      Flagged
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}`)}>
                        View
                      </DropdownMenuItem>
                      {business.verificationStatus === "pending" && (
                        <>
                          <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}?review=verify`)}>
                            Verify
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}?review=reject`)}>
                            Reject
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}?toggle=featured`)}>
                        {business.featured_status === "featured" ? "Unfeature" : "Feature"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
