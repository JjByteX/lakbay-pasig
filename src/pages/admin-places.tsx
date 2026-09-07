import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
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

interface PlaceRow {
  id: string;
  name: string;
  category: string;
  verification_status: "pending" | "verified" | "rejected";
  updated_at: string;
}

const STATUS_VARIANT = {
  pending: "outline",
  verified: "default",
  rejected: "destructive",
} as const;

// 5.1: oldest pending first, per project-brief.md default sort. Fetch
// unordered, then sort client side by explicit priority so ordering
// doesn't depend on how the status strings happen to alphabetize.
const STATUS_PRIORITY = { pending: 0, verified: 1, rejected: 1 } as const;

export default function AdminPlacesPage() {
  const navigate = useNavigate();
  const [places, setPlaces] = useState<PlaceRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("places")
      .select("id, name, category, verification_status, updated_at")
      .then(({ data }) => {
        const rows = (data ?? []) as PlaceRow[];
        const sorted = [...rows].sort((a, b) => {
          const priorityDiff = STATUS_PRIORITY[a.verification_status] - STATUS_PRIORITY[b.verification_status];
          if (priorityDiff !== 0) return priorityDiff;
          return a.updated_at.localeCompare(b.updated_at);
        });
        setPlaces(sorted);
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Places</h1>
        <Button onClick={() => navigate("/admin/places/new")}>New Place</Button>
      </div>

      {places === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : places.length === 0 ? (
        <p className="text-sm text-muted-foreground">No places yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Verification Status</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {places.map((place) => (
              <TableRow key={place.id}>
                <TableCell className="font-semibold text-foreground">{place.name}</TableCell>
                <TableCell>{place.category}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[place.verification_status]}>
                    {place.verification_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(place.updated_at).toLocaleDateString()}
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
                      <DropdownMenuItem onClick={() => navigate(`/admin/places/${place.id}`)}>
                        View
                      </DropdownMenuItem>
                      {place.verification_status === "pending" && (
                        <>
                          <DropdownMenuItem onClick={() => navigate(`/admin/places/${place.id}?review=verify`)}>
                            Verify
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/admin/places/${place.id}?review=reject`)}>
                            Reject
                          </DropdownMenuItem>
                        </>
                      )}
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
