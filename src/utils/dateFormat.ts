import { UserPreferences } from "../api/session/types";

export type { UserPreferences };

/**
 * Fallback used everywhere a user hasn't chosen (or the session hasn't loaded).
 * Matches the schema defaults in backend/models/user.js.
 */
export const DEFAULT_PREFS: UserPreferences = {
  timeFormat: "24h",
  dateFormat: "DMY",
  timeZone: "local",
};

export const EMPTY_DATE = "—";
export const UNKNOWN_DATE = "Unknown Date";

type DateInput = string | number | Date | null | undefined;

function toDate(d: DateInput): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOptions(prefs: UserPreferences): Intl.DateTimeFormatOptions {
  return {
    // Explicit numeric parts so DMY vs MDY is deterministic, not locale-guessed.
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: prefs.timeZone === "utc" ? "UTC" : undefined,
  };
}

function timeOptions(prefs: UserPreferences): Intl.DateTimeFormatOptions {
  return {
    hour: "2-digit",
    minute: "2-digit",
    hour12: prefs.timeFormat === "12h",
    timeZone: prefs.timeZone === "utc" ? "UTC" : undefined,
  };
}

// Locale drives ordering of the numeric date parts: en-GB => DD/MM/YYYY, en-US => MM/DD/YYYY.
function dateLocale(prefs: UserPreferences): string {
  return prefs.dateFormat === "DMY" ? "en-GB" : "en-US";
}

/** Date only, honoring date order + timezone. */
export function formatDate(
  d: DateInput,
  prefs: UserPreferences = DEFAULT_PREFS,
  empty: string = EMPTY_DATE
): string {
  const date = toDate(d);
  if (!date) return empty;
  return new Intl.DateTimeFormat(dateLocale(prefs), dateOptions(prefs)).format(date);
}

/** Time only, honoring 12h/24h + timezone. */
export function formatTime(
  d: DateInput,
  prefs: UserPreferences = DEFAULT_PREFS,
  empty: string = EMPTY_DATE
): string {
  const date = toDate(d);
  if (!date) return empty;
  return new Intl.DateTimeFormat(dateLocale(prefs), timeOptions(prefs)).format(date);
}

/** Date + time, honoring all preferences. */
export function formatDateTime(
  d: DateInput,
  prefs: UserPreferences = DEFAULT_PREFS,
  empty: string = EMPTY_DATE
): string {
  const date = toDate(d);
  if (!date) return empty;
  return new Intl.DateTimeFormat(dateLocale(prefs), {
    ...dateOptions(prefs),
    ...timeOptions(prefs),
  }).format(date);
}
