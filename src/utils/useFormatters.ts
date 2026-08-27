import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "../api/session";
import {
  DEFAULT_PREFS,
  formatDate,
  formatDateTime,
  formatTime,
} from "./dateFormat";

type DateInput = string | number | Date | null | undefined;

/**
 * Returns date/time formatters bound to the current user's display preferences.
 * Reads the app-wide ["session"] query (the same source used in AppRouter), so
 * no extra fetch or context provider is needed. When a user changes preferences
 * and the session is refetched, every consumer re-renders with the new format.
 */
export function useFormatters() {
  const { data: session } = useQuery(["session"], getSession, {
    retry: false,
    staleTime: 10000,
    onError: () => {},
  });

  const prefs = session?.preferences ?? DEFAULT_PREFS;

  return useMemo(
    () => ({
      prefs,
      formatDate: (d: DateInput, empty?: string) => formatDate(d, prefs, empty),
      formatTime: (d: DateInput, empty?: string) => formatTime(d, prefs, empty),
      formatDateTime: (d: DateInput, empty?: string) =>
        formatDateTime(d, prefs, empty),
    }),
    // prefs is a stable object from the query cache; depend on its fields.
    [prefs.timeFormat, prefs.dateFormat, prefs.timeZone] // eslint-disable-line react-hooks/exhaustive-deps
  );
}
