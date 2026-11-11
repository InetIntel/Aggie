import type { Group } from "../../api/groups/types";

// ---------------------------------------------------------------------------
// Dates. Day/month boundaries follow the user's time zone preference: pass
// resolveTimeZone(prefs) ("UTC", or undefined for the browser's zone).
// ---------------------------------------------------------------------------

export const toTime = (d?: Date | string | null): number | null => {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
};

// The moment an incident sits at on the timeline. Falls back to storedAt for
// incidents that never had a start date filled in.
export const startTimeOf = (g: Group): number =>
  toTime(g.incidentStartedAt) ?? toTime(g.storedAt) ?? 0;

const zonedParts = (t: number, timeZone?: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: Number(get("day")) };
};

const ordinal = (n: number) => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

// "October 28th 2026"
export const formatHeadingDate = (t: number, timeZone?: string) => {
  const { year, month, day } = zonedParts(t, timeZone);
  return `${month} ${ordinal(day)} ${year}`;
};

export const monthKey = (t: number, timeZone?: string) => {
  const { year, month } = zonedParts(t, timeZone);
  return `${year}-${month}`;
};

export const monthLabel = (t: number, timeZone?: string) => zonedParts(t, timeZone).month;

export const yearLabel = (t: number, timeZone?: string) => zonedParts(t, timeZone).year;

// "1 h 35 min", "3 d 4 h"
export const formatDuration = (ms: number) => {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (!days && (minutes || !hours)) parts.push(`${minutes} min`);
  return parts.join(" ");
};

// ---------------------------------------------------------------------------
// Population coverage tiers (the design uses two tiers split at 25%)
// ---------------------------------------------------------------------------

export type CoverageTier = "none" | "low" | "high";

export const coverageTier = (value?: number | null): CoverageTier => {
  if (typeof value !== "number" || value <= 0) return "none";
  return value < 0.25 ? "low" : "high";
};

export const TIER_STYLES: Record<
  CoverageTier,
  { dot: string; bar: string; text: string; border: string; label: string | null }
> = {
  none: {
    dot: "bg-slate-300 dark:bg-slate-500",
    bar: "bg-slate-300 dark:bg-slate-500",
    text: "text-slate-400",
    border: "border-slate-300 dark:border-slate-500",
    label: null,
  },
  low: {
    dot: "bg-orange-400",
    bar: "bg-orange-400",
    text: "text-orange-500",
    border: "border-orange-400",
    label: "Under 25% coverage",
  },
  high: {
    dot: "bg-red-500",
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500",
    label: "25% coverage or more",
  },
};

// The dot/bar color follows the larger of the two scores, so an incident is
// never shown as "no impact" when only one score is known.
export const incidentTier = (g: Group) =>
  coverageTier(
    Math.max(
      g.directPopulationCoverageScore ?? 0,
      g.indirectPopulationCoverageScore ?? 0
    )
  );

export const isOngoing = (g: Group) => !g.closed;

// ---------------------------------------------------------------------------
// Duration bars
// ---------------------------------------------------------------------------

export interface Anchor {
  time: number;
  y: number;
}

// Cards are laid out in order, not to scale, so a time is placed by linear
// interpolation between the two nearest anchors (NOW and each card's dot).
// `anchors` must be sorted newest first (smallest y first).
export const timeToY = (time: number, anchors: Anchor[]) => {
  if (!anchors.length) return 0;
  if (time >= anchors[0].time) return anchors[0].y;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (time >= b.time) {
      if (a.time === b.time) return b.y;
      return a.y + ((a.time - time) / (a.time - b.time)) * (b.y - a.y);
    }
  }
  return anchors[anchors.length - 1].y;
};

export interface BarSpan {
  id: string;
  top: number;
  bottom: number;
}

// Greedy interval packing: each bar goes in the innermost lane (closest to the
// axis) that is free over its span.
export const assignLanes = (spans: BarSpan[], gap = 6) => {
  const laneBottoms: number[] = [];
  const lanes: Record<string, number> = {};
  [...spans]
    .sort((a, b) => a.top - b.top)
    .forEach((s) => {
      let lane = laneBottoms.findIndex((bottom) => bottom + gap <= s.top);
      if (lane === -1) {
        lane = laneBottoms.length;
        laneBottoms.push(s.bottom);
      } else {
        laneBottoms[lane] = s.bottom;
      }
      lanes[s.id] = lane;
    });
  return { lanes, laneCount: laneBottoms.length };
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (groups: Group[]) => {
  const header = [
    "id",
    "title",
    "status",
    "start_utc",
    "end_utc",
    "location",
    "direct_population_coverage",
    "indirect_population_coverage",
    "asns",
    "sources",
  ];
  const rows = groups.map((g) => [
    g.idnum,
    g.title,
    isOngoing(g) ? "ongoing" : "closed",
    g.incidentStartedAt ? new Date(g.incidentStartedAt).toISOString() : "",
    g.incidentEndedAt ? new Date(g.incidentEndedAt).toISOString() : "",
    [g.locationName, ...(g.impactedGeoScopes ?? [])].filter(Boolean).join("; "),
    g.directPopulationCoverageScore ?? "",
    g.indirectPopulationCoverageScore ?? "",
    (g.impactedAsns ?? []).join("; "),
    (g.reportSources ?? []).join("; "),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
};
