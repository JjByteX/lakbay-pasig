// Every Send Feedback string in one place (send-feedback-plan.md, 4.1).
// English only. The Help answer for "Report a problem" must match these word
// for word. Plain wording, no exclamation marks.
export type FeedbackType = "suggestion" | "problem" | "other";

export const FEEDBACK_LABEL = "Send Feedback";
export const FEEDBACK_DESCRIPTION = "Tell us what to improve, or what is not working.";

export const TYPE_LABEL = "Type";
export const TYPE_PLACEHOLDER = "Choose a type";
export const TYPE_OPTIONS: ReadonlyArray<{ value: FeedbackType; label: string }> = [
  { value: "suggestion", label: "Suggestion" },
  { value: "problem", label: "Report a Problem" },
  { value: "other", label: "Other" },
];

export const MESSAGE_LABEL = "Message";
export const MESSAGE_PLACEHOLDER = "Write your feedback here.";
export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 2000;

export const EMAIL_LABEL = "Email (optional)";
export const EMAIL_PLACEHOLDER = "name@example.com";
export const EMAIL_REASON = "Only used if we need to reply. We do not send anything else.";

export const IMAGE_LABEL = "Image (optional)";
export const IMAGE_ADD = "Add image";
export const IMAGE_REMOVE = "Remove";
export const IMAGE_HINT = "JPG, PNG or WebP.";

export const SUBMIT_LABEL = "Send";
export const SUBMIT_LOADING = "Sending...";
export const SUCCESS_TEXT = "Feedback sent.";

// Shown beside a disabled Send, saying what is missing.
export const HINT_TYPE = "Choose a type to send.";
export const HINT_MESSAGE = `Write at least ${MESSAGE_MIN} characters to send.`;
export const HINT_OFFLINE = "Needs a connection.";

// Error cases. Keys match the codes api/feedback.js returns, plus "network".
export const ERROR_TEXT = {
  rate_limited: "Too many feedback messages. Please try again later.",
  captcha: "The check did not pass. Please try again.",
  too_large: "That image is too large. Choose a smaller one.",
  image_type: "Only JPG, PNG or WebP images can be sent.",
  invalid_email: "That email address does not look right.",
  network: "Could not send. Check your connection and try again.",
  server: "Something went wrong. Please try again.",
} as const;

export type FeedbackErrorCode = keyof typeof ERROR_TEXT;

// Server codes with no message of their own use the general one.
export function errorFor(code: string | undefined): string {
  return code && code in ERROR_TEXT ? ERROR_TEXT[code as FeedbackErrorCode] : ERROR_TEXT.server;
}

// Help page (pages/help.tsx), beside the CATO contact details.
export const HELP_REPLY_LINE = "Need a reply? Contact CATO directly.";
