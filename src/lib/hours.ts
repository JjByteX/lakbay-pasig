// Hours, days and durations. One place for the shapes the selectors read and
// write and for the text public pages show, so the editors
// (weekly-hours-field.tsx, duration-field.tsx, recommended-time-field.tsx)
// and the display (components/public/hours-display.tsx) can never disagree
// about the format.
//
// Storage: no schema change. The five existing text columns
// (places.operating_hours, places.visit_duration, businesses.opening_hours,
// routes.estimated_duration, routes.recommended_time) keep their type.
//   - Durations are stored as readable text ("1 hr 30 min"), the same shape
//     trail-card.tsx and trail-detail.tsx already print as-is.
//   - Weekly hours and recommended time are stored as a small JSON string
//     with a version key ({"v":1,...}).
//   - "Open with no main hours" is stored as an empty value, same as a field
//     nobody filled in (each form already turns that into null or "").
// Any value that isn't in these formats, which is everything entered before
// this change (for example "Tuesday to Sunday, 9:00 AM – 4:00 PM"), is
// "legacy". The editors show it untouched until staff replace it and public
// pages print it as before. Nothing is converted automatically, since
// guessing a schedule out of free text could publish wrong hours.
//
// If recommended_time is ever shown to visitors, format it from
// parseRecommendedTime below. Don't print the column raw.

export const DAYS = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
] as const;

export type DayKey = (typeof DAYS)[number]["key"];

// ---------------------------------------------------------------------------
// Times. "HH:mm" in 24-hour form, with "24:00" allowed as a closing time only
// (end of day), so a place open until midnight is 18:00 to 24:00 and a place
// open all day is 00:00 to 24:00.
// ---------------------------------------------------------------------------

export const TIME_STEP_MINUTES = 15;
export const MINUTES_PER_DAY = 24 * 60;
export const END_OF_DAY = "24:00";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: unknown): value is string {
  return typeof value === "string" && (TIME_PATTERN.test(value) || value === END_OF_DAY);
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// "13:30" -> "1:30 PM". 12-hour with AM/PM, matching time-field.tsx and the
// rest of the app (ux-ui-guidelines.md's Familiarity principle).
export function formatTime12(time: string): string {
  const total = timeToMinutes(time);
  const hour24 = Math.floor(total / 60) % 24;
  const minute = total % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// Every selectable time from min to max inclusive, on the step grid.
export function buildTimeOptions(min: string, max: string): string[] {
  const options: string[] = [];
  const start = Math.ceil(timeToMinutes(min) / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  const end = timeToMinutes(max);
  for (let minutes = start; minutes <= end; minutes += TIME_STEP_MINUTES) {
    options.push(minutesToTime(minutes));
  }
  return options;
}

// ---------------------------------------------------------------------------
// Weekly hours
// ---------------------------------------------------------------------------

export type TimeRange = [opens: string, closes: string];

// An empty array means the day is closed. More than one range is a split
// shift (for example a lunch break).
export type WeeklyDays = Record<DayKey, TimeRange[]>;

export type HoursMode = "main" | "temp_closed" | "perm_closed";

export type ParsedHours =
  | { kind: "none" }
  | { kind: "legacy"; text: string }
  | { kind: "schedule"; mode: HoursMode; days: WeeklyDays };

// A fresh schedule starts open every day, 9 AM to 5 PM: a visit to a heritage
// site or a stall is most often a weekend one, so closing days is the
// exception staff make rather than the default they have to undo.
export function defaultWeeklyDays(): WeeklyDays {
  const open = (): TimeRange[] => [["09:00", "17:00"]];
  return { mon: open(), tue: open(), wed: open(), thu: open(), fri: open(), sat: open(), sun: open() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isHoursMode(value: unknown): value is HoursMode {
  return value === "main" || value === "temp_closed" || value === "perm_closed";
}

function readRanges(raw: unknown): TimeRange[] | null {
  if (!Array.isArray(raw)) return null;
  const ranges: TimeRange[] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [opens, closes] = item;
    if (!isTime(opens) || !isTime(closes)) return null;
    ranges.push([opens, closes]);
  }
  return ranges;
}

function readDays(raw: unknown): WeeklyDays | null {
  if (!isRecord(raw)) return null;
  const days = {} as WeeklyDays;
  for (const day of DAYS) {
    const ranges = readRanges(raw[day.key]);
    if (!ranges) return null;
    days[day.key] = ranges;
  }
  return days;
}

export function parseHoursValue(value: string | null | undefined): ParsedHours {
  const text = (value ?? "").trim();
  if (!text) return { kind: "none" };

  const json = tryParseJson(text);
  if (isRecord(json) && json.v === 1 && isHoursMode(json.mode)) {
    const days = readDays(json.days);
    if (days) return { kind: "schedule", mode: json.mode, days };
  }
  return { kind: "legacy", text };
}

export function serializeHours(mode: HoursMode, days: WeeklyDays): string {
  return JSON.stringify({ v: 1, mode, days });
}

// Keeps a day's ranges in order and valid after any edit: each range opens no
// earlier than the one before it closed, closes after it opens, and a range
// with no room left in the day is dropped. Idempotent.
export function normalizeRanges(ranges: TimeRange[]): TimeRange[] {
  const result: TimeRange[] = [];
  let floor = 0;
  for (const [opens, closes] of ranges) {
    const openMinutes = Math.max(timeToMinutes(opens), floor);
    if (openMinutes > MINUTES_PER_DAY - TIME_STEP_MINUTES) break;
    let closeMinutes = timeToMinutes(closes);
    if (closeMinutes <= openMinutes) closeMinutes = Math.min(openMinutes + 60, MINUTES_PER_DAY);
    result.push([minutesToTime(openMinutes), minutesToTime(closeMinutes)]);
    floor = closeMinutes;
  }
  return result;
}

export function canAddRange(ranges: TimeRange[]): boolean {
  const last = ranges[ranges.length - 1];
  return !last || timeToMinutes(last[1]) <= MINUTES_PER_DAY - 2 * TIME_STEP_MINUTES;
}

// A new range opens an hour after the previous one closed and runs two hours.
export function addRange(ranges: TimeRange[]): TimeRange[] {
  const last = ranges[ranges.length - 1];
  const previousClose = last ? timeToMinutes(last[1]) : 0;
  const opens = Math.min(previousClose + 60, MINUTES_PER_DAY - TIME_STEP_MINUTES);
  const closes = Math.min(opens + 120, MINUTES_PER_DAY);
  return [...ranges, [minutesToTime(opens), minutesToTime(closes)]];
}

// ---------------------------------------------------------------------------
// Public display
// ---------------------------------------------------------------------------

export interface HoursRow {
  label: string;
  value: string;
}

export type HoursDisplay =
  | { kind: "text"; text: string } // legacy free text, shown as saved
  | { kind: "status"; label: string } // temporarily or permanently closed
  | { kind: "schedule"; rows: HoursRow[] };

function rangesSignature(ranges: TimeRange[]): string {
  return ranges.map(([opens, closes]) => `${opens}-${closes}`).join(",");
}

function formatRanges(ranges: TimeRange[]): string {
  if (ranges.length === 0) return "Closed";
  if (ranges.length === 1 && ranges[0][0] === "00:00" && ranges[0][1] === END_OF_DAY) {
    return "Open 24 hours";
  }
  return ranges.map(([opens, closes]) => `${formatTime12(opens)} – ${formatTime12(closes)}`).join(", ");
}

function dayRunLabel(startIndex: number, endIndex: number): string {
  const count = endIndex - startIndex + 1;
  if (count === DAYS.length) return "Every day";
  if (count === 1) return DAYS[startIndex].label;
  return `${DAYS[startIndex].label} – ${DAYS[endIndex].label}`;
}

// Returns null when there is nothing to show. Neighbouring days with the same
// hours are merged into one row ("Monday – Friday").
export function getHoursDisplay(value: string | null | undefined): HoursDisplay | null {
  const parsed = parseHoursValue(value);
  if (parsed.kind === "none") return null;
  if (parsed.kind === "legacy") return { kind: "text", text: parsed.text };
  if (parsed.mode === "temp_closed") return { kind: "status", label: "Temporarily closed" };
  if (parsed.mode === "perm_closed") return { kind: "status", label: "Permanently closed" };

  const rows: HoursRow[] = [];
  let runStart = 0;
  for (let index = 1; index <= DAYS.length; index += 1) {
    const continuesRun =
      index < DAYS.length &&
      rangesSignature(parsed.days[DAYS[index].key]) === rangesSignature(parsed.days[DAYS[runStart].key]);
    if (continuesRun) continue;

    rows.push({
      label: dayRunLabel(runStart, index - 1),
      value: formatRanges(parsed.days[DAYS[runStart].key]),
    });
    runStart = index;
  }
  return { kind: "schedule", rows };
}

// ---------------------------------------------------------------------------
// Durations ("Estimated Visit Duration", "Estimated Duration")
// ---------------------------------------------------------------------------

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

// 15 minutes to 4 hours in 15 minute steps, then up to 12 hours in 30 minute
// steps. Short visits need the fine steps, day-long trails don't.
function buildDurationMinutes(): number[] {
  const minutes: number[] = [];
  for (let value = 15; value <= 240; value += 15) minutes.push(value);
  for (let value = 270; value <= 720; value += 30) minutes.push(value);
  return minutes;
}

export const DURATION_MINUTES: readonly number[] = buildDurationMinutes();
export const DURATION_OPTIONS: readonly string[] = DURATION_MINUTES.map((minutes) => formatDuration(minutes));

// Reads simple free text back into minutes ("2 hours", "45 minutes",
// "1h30m"). Anything else, such as a range like "45 to 60 minutes", is null.
export function parseDurationMinutes(text: string): number | null {
  const value = text.trim().toLowerCase();

  const hoursAndMinutes =
    /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)(?:\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minute|minutes))?$/.exec(value);
  if (hoursAndMinutes) {
    const hours = Number(hoursAndMinutes[1]);
    const minutes = hoursAndMinutes[2] ? Number(hoursAndMinutes[2]) : 0;
    return Math.round(hours * 60 + minutes);
  }

  const minutesOnly = /^(\d+)\s*(?:m|min|mins|minute|minutes)$/.exec(value);
  if (minutesOnly) return Number(minutesOnly[1]);

  return null;
}

// canonical: the option label a stored value maps onto ("2 hours" -> "2 hr").
// legacy: free text that maps onto no option, kept as its own choice until
// staff pick a real one.
export function resolveDuration(value: string): { canonical: string | null; legacy: string | null } {
  const text = value.trim();
  if (!text) return { canonical: null, legacy: null };

  const minutes = parseDurationMinutes(text);
  if (minutes !== null && DURATION_MINUTES.includes(minutes)) {
    return { canonical: formatDuration(minutes), legacy: null };
  }
  return { canonical: null, legacy: text };
}

// ---------------------------------------------------------------------------
// Recommended time ("Recommended Time" on a trail): which days and, optionally,
// what part of the day.
// ---------------------------------------------------------------------------

export interface RecommendedTime {
  days: DayKey[];
  from: string; // "" when no time range is set
  to: string; // "" when no time range is set
}

export type ParsedRecommendedTime =
  | { kind: "none" }
  | { kind: "legacy"; text: string }
  | { kind: "structured"; value: RecommendedTime };

export function parseRecommendedTime(value: string | null | undefined): ParsedRecommendedTime {
  const text = (value ?? "").trim();
  if (!text) return { kind: "none" };

  const json = tryParseJson(text);
  if (isRecord(json) && json.v === 1 && Array.isArray(json.days)) {
    const rawDays: unknown[] = json.days;
    const days = DAYS.map((day) => day.key).filter((key) => rawDays.includes(key));
    const hasTime = isTime(json.from) && isTime(json.to);
    return {
      kind: "structured",
      value: {
        days,
        from: hasTime ? (json.from as string) : "",
        to: hasTime ? (json.to as string) : "",
      },
    };
  }
  return { kind: "legacy", text };
}

// "" when nothing is selected, so an untouched field is stored as null.
export function serializeRecommendedTime(value: RecommendedTime): string {
  const hasTime = value.from !== "" && value.to !== "";
  if (value.days.length === 0 && !hasTime) return "";
  return JSON.stringify({
    v: 1,
    days: value.days,
    ...(hasTime ? { from: value.from, to: value.to } : {}),
  });
}
