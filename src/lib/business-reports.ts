import { supabase } from "./supabase";

// Build-order step 10: report a listing, and staff resolving the reports.
//
// Every limit is held by migration 0009 (business_flags_guard), not here: one
// open report per person per listing, 10 a day, never your own listing. The
// database sets flagged_by and resolved itself. This file only sends the
// listing id and the text, and turns the database's answer into a result.

export const REPORT_REASONS = [
  "Fake or spam listing",
  "Wrong or outdated information",
  "Closed or no longer operating",
  "Inappropriate content",
  "Other",
] as const;

export const REPORT_NOTE_MAX = 200;

export const REPORT_LABEL = "Report this listing";
export const REPORT_DESCRIPTION = "Tell CATO what is wrong with this listing. Staff will take a look.";
export const REPORT_REASON_LABEL = "What is wrong?";
export const REPORT_REASON_PLACEHOLDER = "Choose a reason";
export const REPORT_NOTE_LABEL = "More detail (optional)";
export const REPORT_SUBMIT = "Send report";
export const REPORT_SUBMITTING = "Sending…";
export const REPORT_CLOSE = "Close";
export const REPORT_SENT = "Thanks. CATO staff will review this listing.";

export type ReportResult = "sent" | "already" | "own" | "limit" | "error";

export const REPORT_ERROR_TEXT: Record<Exclude<ReportResult, "sent">, string> = {
  already: "You already reported this listing. Staff have not reviewed it yet.",
  own: "This is your own listing. Edit it from your vendor dashboard instead.",
  limit: "You have sent a lot of reports today. Try again tomorrow.",
  error: "Couldn't send your report. Check your connection and try again.",
};

export async function reportBusiness(
  businessId: string,
  reason: (typeof REPORT_REASONS)[number],
  note: string
): Promise<ReportResult> {
  const detail = note.trim();
  const flagReason = detail ? `${reason}: ${detail}` : reason;

  // No .select(): only staff can read flags back, so a returning insert would
  // fail for the person reporting.
  const { error } = await supabase.from("business_flags").insert({ business_id: businessId, flag_reason: flagReason });
  if (!error) return "sent";

  if (error.code === "23505") return "already";
  if (error.message.includes("report_own_listing")) return "own";
  if (error.message.includes("report_rate_limited")) return "limit";
  return "error";
}

export interface OpenFlag {
  id: string;
  flag_reason: string;
  /** null for the system flag on a second listing. */
  flagged_by: string | null;
  created_at: string;
}

export async function fetchOpenFlags(businessId: string): Promise<OpenFlag[]> {
  const { data, error } = await supabase
    .from("business_flags")
    .select("id, flag_reason, flagged_by, created_at")
    .eq("business_id", businessId)
    .eq("resolved", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OpenFlag[];
}

export async function resolveFlag(flagId: string): Promise<void> {
  const { error } = await supabase.from("business_flags").update({ resolved: true }).eq("id", flagId);
  if (error) throw error;
}
