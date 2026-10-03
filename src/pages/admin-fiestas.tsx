import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DownloadSimple, FlagBanner, Pencil, Plus, UploadSimple } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminIconAction, AdminIconActions } from "@/components/admin/admin-icon-action";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import FiestaFormDialog from "@/components/admin/fiesta-form-dialog";
import { usePageTitle } from "@/lib/page-title";

// Fiestas list (migrations 0044 and 0045). Same shape as admin-events.tsx
// minus the calendar and bulk actions: about 30 rows, one list, search plus a
// Published filter, Edit and Publish/Unpublish as icon actions, and the form
// as a modal over the list. The ?fiesta= param keeps a refreshable deep link
// into one fiesta's modal, same as ?event= does there.
//
// Default order is month, then start date (0044), then name, so the table
// reads as a year calendar.
// The Date column sorts by month, not by its text label, since labels like
// "3rd Sunday of November" do not sort as dates. A fiesta with no month goes
// last.
//
// Publish means CATO confirmed the date, so this page is also the
// confirm-and-publish worklist: filter to Draft to see what is left.

interface FiestaRow {
  id: string;
  name: string;
  patron_saint: string | null;
  community: string | null;
  month: number | null;
  date_label: string;
  published: boolean;
  barangayText: string;
}

const PUBLISHED_OPTIONS = ["all", "published", "draft"] as const;

function publishedFilterOptionLabel(option: (typeof PUBLISHED_OPTIONS)[number]): string {
  if (option === "all") return "All";
  if (option === "published") return "Published";
  return "Draft";
}

export default function AdminFiestasPage() {
  usePageTitle("Fiestas");
  const [searchParams, setSearchParams] = useSearchParams();
  const [fiestas, setFiestas] = useState<FiestaRow[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [publishedFilter, setPublishedFilter] = useState<(typeof PUBLISHED_OPTIONS)[number]>("all");

  // Dialog open state and the fiesta being edited (null = New) both come from
  // the ?fiesta= param, one source of truth, as in admin-events.tsx.
  const fiestaParam = searchParams.get("fiesta");
  const dialogOpen = fiestaParam !== null;
  const editingFiestaId = fiestaParam && fiestaParam !== "new" ? fiestaParam : null;

  function setFiestaParam(value: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete("fiesta");
      else next.set("fiesta", value);
      return next;
    });
  }

  function load() {
    return supabase
      .from("fiestas")
      .select("id, name, patron_saint, community, month, date_label, published, fiesta_barangays(barangay)")
      .order("month", { ascending: true, nullsFirst: false })
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setActionError(error.message);
          setFiestas([]);
          return;
        }
        const rows = (data ?? []) as (Omit<FiestaRow, "barangayText"> & {
          fiesta_barangays: { barangay: string }[] | null;
        })[];
        setFiestas(
          rows.map(({ fiesta_barangays, ...rest }) => {
            const names = (fiesta_barangays ?? []).map((b) => b.barangay).sort();
            const parts = names.length > 0 ? names : [];
            if (rest.community) parts.push(rest.community);
            return { ...rest, barangayText: parts.join(", ") };
          })
        );
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleTogglePublished(fiesta: FiestaRow) {
    setActionError(null);
    setUpdatingId(fiesta.id);
    const nextPublished = !fiesta.published;

    const { error } = await supabase
      .from("fiestas")
      .update({ published: nextPublished, updated_at: new Date().toISOString() })
      .eq("id", fiesta.id);

    setUpdatingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setFiestas((prev) => (prev ?? []).map((f) => (f.id === fiesta.id ? { ...f, published: nextPublished } : f)));
  }

  const filtered = useMemo(() => {
    if (!fiestas) return [];
    const query = search.trim().toLowerCase();
    return fiestas.filter((fiesta) => {
      if (query) {
        const haystack = [fiesta.name, fiesta.patron_saint, fiesta.date_label, fiesta.barangayText]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (publishedFilter !== "all") {
        const isPublished = publishedFilter === "published";
        if (fiesta.published !== isPublished) return false;
      }
      return true;
    });
  }, [fiestas, search, publishedFilter]);

  const columns: AdminColumn<FiestaRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (fiesta) => <span className="font-semibold text-foreground">{fiesta.name}</span>,
    },
    {
      key: "barangayText",
      label: "Barangay",
      render: (fiesta) => fiesta.barangayText || "City-wide",
    },
    {
      key: "date_label",
      label: "Date",
      sortKey: "month",
      render: (fiesta) => fiesta.date_label,
    },
    { key: "patron_saint", label: "Patron Saint", render: (fiesta) => fiesta.patron_saint ?? "—" },
    {
      key: "published",
      label: "Published",
      render: (fiesta) => (
        <Badge variant={fiesta.published ? "default" : "outline"}>{fiesta.published ? "Published" : "Draft"}</Badge>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (fiesta) => (
        <AdminIconActions>
          <AdminIconAction
            icon={Pencil}
            label="Edit"
            onClick={() => setFiestaParam(fiesta.id)}
            disabled={updatingId === fiesta.id}
          />
          <AdminIconAction
            icon={fiesta.published ? DownloadSimple : UploadSimple}
            label={fiesta.published ? "Unpublish" : "Publish"}
            onClick={() => handleTogglePublished(fiesta)}
            disabled={updatingId === fiesta.id}
          />
        </AdminIconActions>
      ),
    },
  ];

  const toolbar = (
    <AdminFilterBar>
      <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by name, barangay or saint…" />
      <Select value={publishedFilter} onValueChange={(v) => setPublishedFilter(v as typeof publishedFilter)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Published" />
        </SelectTrigger>
        <SelectContent>
          {PUBLISHED_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {publishedFilterOptionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AdminFilterBar>
  );

  return (
    <div className="relative flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Fiestas</h1>
        <Button onClick={() => setFiestaParam("new")} className="gap-1 pl-3.5">
          <Plus weight="bold" className="h-3.5 w-3.5" aria-hidden="true" />
          New Fiesta
        </Button>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={fiestas === null}
        keyField="id"
        autoPageSize
        emptyIcon={FlagBanner}
        empty={fiestas && fiestas.length > 0 ? "Matching fiestas will appear here." : "Fiestas will appear here."}
        toolbar={toolbar}
      />

      <FiestaFormDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) setFiestaParam(null);
        }}
        fiestaId={editingFiestaId}
        onSaved={load}
      />
    </div>
  );
}
