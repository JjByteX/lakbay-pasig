import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatCircleText } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { formatDateTimeNoSeconds } from "@/lib/datetime";
import { TYPE_OPTIONS, type FeedbackType } from "@/lib/feedback-messages";

// Feedback inbox (send-feedback-plan.md Phase 6). Reads feedback (migration
// 0008) as staff: RLS returns rows only to an admin or a staff account with
// review_feedback, and the route guard in App.tsx uses the same permission.
// Staff can change status only, the table's column grant allows nothing else.
// Every message and email is text, never HTML: React escapes it and links stay
// plain text. The attachment is a private file, read through a short lived
// signed URL, and shown as an image only.

type FeedbackStatus = "new" | "in_review" | "resolved";

interface FeedbackRow {
  id: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  user_id: string | null;
  attachment_path: string | null;
  status: FeedbackStatus;
  created_at: string;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: FeedbackStatus; label: string; variant: BadgeProps["variant"] }> = [
  { value: "new", label: "New", variant: "info" },
  { value: "in_review", label: "In Review", variant: "muted" },
  { value: "resolved", label: "Resolved", variant: "muted" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));
const ALL = "all";
// ux-ui-guidelines.md: no data table under 5 rows, a plain list instead.
const TABLE_MIN_ROWS = 5;
const SIGNED_URL_SECONDS = 60;

function StatusPill({ status }: Readonly<{ status: FeedbackStatus }>) {
  const option = STATUS_OPTIONS.find((o) => o.value === status);
  return <Badge variant={option?.variant ?? "muted"}>{option?.label ?? status}</Badge>;
}

function snippet(message: string): string {
  const flat = message.replaceAll(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

export default function AdminFeedbackPage() {
  usePageTitle("Feedback");
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

  // Newest 500, same cap and cancel flag as admin-activity.tsx.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("feedback")
      .select("id, type, message, email, user_id, attachment_path, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError("Could not load feedback. Try again.");
          setRows([]);
          return;
        }
        setRows((data ?? []) as FeedbackRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.message.toLowerCase().includes(query) && !(row.email ?? "").toLowerCase().includes(query)) {
        return false;
      }
      if (typeFilter !== ALL && row.type !== typeFilter) return false;
      if (statusFilter !== ALL && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, typeFilter, statusFilter]);

  const handleStatusChanged = useCallback((id: string, status: FeedbackStatus) => {
    setRows((current) => (current ? current.map((row) => (row.id === id ? { ...row, status } : row)) : current));
  }, []);

  const openRow = rows?.find((row) => row.id === openId) ?? null;

  const columns: AdminColumn<FeedbackRow>[] = [
    { key: "created_at", label: "Received", render: (row) => formatDateTimeNoSeconds(row.created_at) },
    { key: "type", label: "Type", render: (row) => TYPE_LABEL[row.type] ?? row.type },
    {
      key: "message",
      label: "Message",
      render: (row) => <span title={row.message}>{snippet(row.message)}</span>,
    },
    { key: "status", label: "Status", render: (row) => <StatusPill status={row.status} /> },
  ];

  const filters = (
    <AdminFilterBar>
      <AdminSearchInput value={search} onChange={setSearch} placeholder="Search message or email…" />
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AdminFilterBar>
  );

  const showList = rows !== null && rows.length < TABLE_MIN_ROWS;

  let body;
  if (showList) {
    body =
      rows.length === 0 ? (
        <EmptyState icon={ChatCircleText}>Feedback will appear here.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpenId(row.id)}
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-muted/50"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-foreground">{snippet(row.message)}</span>
                  <span className="text-sm text-muted-foreground">
                    {TYPE_LABEL[row.type] ?? row.type} · {formatDateTimeNoSeconds(row.created_at)}
                  </span>
                </span>
                <StatusPill status={row.status} />
              </button>
            </li>
          ))}
        </ul>
      );
  } else {
    body = (
      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={rows === null}
        keyField="id"
        autoPageSize
        emptyIcon={ChatCircleText}
        empty={rows && rows.length > 0 ? "Matching feedback will appear here." : "Feedback will appear here."}
        onRowClick={(row) => setOpenId(row.id)}
        toolbar={filters}
      />
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <AdminPageHeader title="Feedback" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {body}
      <FeedbackDetail row={openRow} onClose={() => setOpenId(null)} onStatusChanged={handleStatusChanged} />
    </div>
  );
}

function FeedbackDetail({
  row,
  onClose,
  onStatusChanged,
}: Readonly<{
  row: FeedbackRow | null;
  onClose: () => void;
  onStatusChanged: (id: string, status: FeedbackStatus) => void;
}>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageState, setImageState] = useState<"idle" | "loading" | "failed">("idle");
  const id = row?.id ?? null;
  const path = row?.attachment_path ?? null;

  // Signed URL for the private attachment, 6.6. Asked for when a row opens, so
  // a link never sits in the list and expires within a minute.
  useEffect(() => {
    setError(null);
    setImageUrl(null);
    if (!id || !path) {
      setImageState("idle");
      return;
    }
    let cancelled = false;
    setImageState("loading");
    supabase.storage
      .from("feedback")
      .createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data, error: urlError }) => {
        if (cancelled) return;
        if (urlError || !data?.signedUrl) {
          setImageState("failed");
          return;
        }
        setImageUrl(data.signedUrl);
        setImageState("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [id, path]);

  async function changeStatus(next: string) {
    if (!row || next === row.status) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from("feedback").update({ status: next }).eq("id", row.id);
    setSaving(false);
    if (updateError) {
      setError("Could not change the status. Try again.");
      return;
    }
    onStatusChanged(row.id, next as FeedbackStatus);
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{TYPE_LABEL[row.type] ?? row.type}</DialogTitle>
              <DialogDescription>{formatDateTimeNoSeconds(row.created_at)}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <p className="whitespace-pre-wrap break-words text-foreground">{row.message}</p>

              <dl className="flex flex-col gap-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="min-w-0 break-all text-foreground">{row.email ?? "Not given"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Sent by</dt>
                  <dd className="text-foreground">{row.user_id ? "Signed in user" : "Guest"}</dd>
                </div>
              </dl>

              {row.attachment_path && (
                <div className="flex flex-col gap-2">
                  {imageState === "loading" && <Skeleton className="h-48 w-full rounded-lg" />}
                  {imageState === "failed" && (
                    <p className="text-sm text-muted-foreground">The image could not be loaded.</p>
                  )}
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt="Attached by the sender"
                      className="max-h-64 w-full rounded-lg object-contain"
                      onError={() => {
                        setImageUrl(null);
                        setImageState("failed");
                      }}
                    />
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="feedback-status">Status</Label>
                <Select value={row.status} onValueChange={changeStatus} disabled={saving}>
                  <SelectTrigger id="feedback-status" className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
