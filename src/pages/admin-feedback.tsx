import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatCircleText, Check, Copy, Eye, Hourglass } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { AdminIconAction, AdminIconActions } from "@/components/admin/admin-icon-action";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { formatDateTimeNoSeconds, parseDateValue, toDateOnlyValue } from "@/lib/datetime";
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
const SIGNED_URL_SECONDS = 60;

function StatusPill({ status }: Readonly<{ status: FeedbackStatus }>) {
  const option = STATUS_OPTIONS.find((o) => o.value === status);
  return <Badge variant={option?.variant ?? "muted"}>{option?.label ?? status}</Badge>;
}

function snippet(message: string): string {
  const flat = message.replaceAll(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

// Plain text for pasting into a chat, ticket or AI prompt. The sender's email
// and the private attachment are left out on purpose: this text leaves the
// admin panel, and neither is needed to understand the problem.
function feedbackAsText(row: FeedbackRow): string {
  return [
    `Type: ${TYPE_LABEL[row.type] ?? row.type}`,
    `Received: ${formatDateTimeNoSeconds(row.created_at)}`,
    `Sent by: ${row.user_id ? "Signed in user" : "Guest"}`,
    `Status: ${STATUS_OPTIONS.find((o) => o.value === row.status)?.label ?? row.status}`,
    row.attachment_path ? "Attachment: has an image (not included)" : null,
    "",
    "Message:",
    row.message,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is missing on plain http or when permission is refused.
    return false;
  }
}

// Which row was just copied, so its button can show a tick for a moment.
function useCopied() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = useCallback(async (row: FeedbackRow) => {
    if (!(await copyText(feedbackAsText(row)))) return;
    setCopiedId(row.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiedId(null), 1500);
  }, []);
  return { copiedId, copy };
}

export default function AdminFeedbackPage() {
  usePageTitle("Feedback");
  const { copiedId, copy } = useCopied();
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  // Date range, "YYYY-MM-DD", "" when unset. Same as admin-activity.tsx.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
      const day = toDateOnlyValue(new Date(row.created_at));
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [rows, search, typeFilter, statusFilter, fromDate, toDate]);

  const handleStatusChanged = useCallback((id: string, status: FeedbackStatus) => {
    setRows((current) => (current ? current.map((row) => (row.id === id ? { ...row, status } : row)) : current));
  }, []);

  // Row action: same update the detail dialog makes. select() returns the
  // changed rows, so an update row level security filtered out is not shown
  // as saved.
  async function changeRowStatus(row: FeedbackRow, next: FeedbackStatus) {
    if (next === row.status) return;
    setUpdatingId(row.id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("feedback")
      .update({ status: next })
      .eq("id", row.id)
      .select("id");
    setUpdatingId(null);
    if (updateError || !data?.length) {
      setError("Could not change the status. Try again.");
      return;
    }
    handleStatusChanged(row.id, next);
  }

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
    {
      key: "actions",
      label: "",
      render: (row) => (
        <AdminIconActions>
          <AdminIconAction icon={Eye} label="View" onClick={() => setOpenId(row.id)} />
          <AdminIconAction
            icon={copiedId === row.id ? Check : Copy}
            label={copiedId === row.id ? "Copied" : "Copy"}
            onClick={() => copy(row)}
          />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={updatingId === row.id}
                    aria-label="Set status"
                  >
                    <Hourglass className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Set status</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={row.status}
                onValueChange={(v) => changeRowStatus(row, v as FeedbackStatus)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </AdminIconActions>
      ),
    },
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
      <DateField
        value={fromDate}
        maxDate={(toDate ? parseDateValue(toDate) : null) ?? undefined}
        onChange={setFromDate}
        aria-label="From date"
        align="right"
        className="w-[190px]"
      />
      <DateField
        value={toDate}
        minDate={(fromDate ? parseDateValue(fromDate) : null) ?? undefined}
        onChange={setToDate}
        aria-label="To date"
        align="right"
        className="w-[190px]"
      />
    </AdminFilterBar>
  );

  const body = (
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
  const { copiedId, copy } = useCopied();
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
    // select() returns the changed rows, so an update that row level security
    // filtered out (no error, no rows) is not shown as saved.
    const { data, error: updateError } = await supabase
      .from("feedback")
      .update({ status: next })
      .eq("id", row.id)
      .select("id");
    setSaving(false);
    if (updateError || !data?.length) {
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

              <Button type="button" variant="outline" className="self-start" onClick={() => copy(row)}>
                {copiedId === row.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copiedId === row.id ? "Copied" : "Copy as text"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
