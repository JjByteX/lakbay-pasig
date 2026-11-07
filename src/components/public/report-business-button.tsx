import { useState } from "react";
import { Flag } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import {
  REPORT_CLOSE,
  REPORT_DESCRIPTION,
  REPORT_ERROR_TEXT,
  REPORT_LABEL,
  REPORT_NOTE_LABEL,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  REPORT_REASON_PLACEHOLDER,
  REPORT_SENT,
  REPORT_SUBMIT,
  REPORT_SUBMITTING,
  reportBusiness,
  type ReportResult,
} from "@/lib/business-reports";

type Reason = (typeof REPORT_REASONS)[number];

/**
 * Build-order step 10: report action on a business page, open to any signed in
 * user. A guest sees the same icon and tapping it opens the auth popup, like
 * the save heart (a report needs an account so the limits have someone to
 * count). The limits themselves live in migration 0009.
 */
export function ReportBusinessButton({ businessId }: Readonly<{ businessId: string }>) {
  const { session } = useAuth();
  const { openAuth } = useAuthModal();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | "">("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);

  function handleOpen() {
    if (!session) {
      openAuth("login");
      return;
    }
    setReason("");
    setNote("");
    setResult(null);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!reason || sending) return;
    setSending(true);
    setResult(await reportBusiness(businessId, reason, note));
    setSending(false);
  }

  const sent = result === "sent";

  return (
    <>
      <Button type="button" variant="ghost" size="icon" onClick={handleOpen} aria-label={REPORT_LABEL}>
        <Flag className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{REPORT_LABEL}</DialogTitle>
            <DialogDescription>{REPORT_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          {sent ? (
            <>
              <p className="text-sm text-foreground">{REPORT_SENT}</p>
              <Button type="button" onClick={() => setOpen(false)} className="self-end">
                {REPORT_CLOSE}
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>{REPORT_REASON_LABEL}</Label>
                <Select value={reason} onValueChange={(value) => setReason(value as Reason)}>
                  <SelectTrigger>
                    <SelectValue placeholder={REPORT_REASON_PLACEHOLDER} />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_REASONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="report-note">{REPORT_NOTE_LABEL}</Label>
                <Textarea
                  id="report-note"
                  value={note}
                  maxLength={REPORT_NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </div>
              {result && <p className="text-sm text-destructive">{REPORT_ERROR_TEXT[result]}</p>}
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!reason || sending}
                loading={sending}
                className="self-end"
              >
                {sending ? REPORT_SUBMITTING : REPORT_SUBMIT}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
