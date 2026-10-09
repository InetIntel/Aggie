import { hasId } from "../common";
import { Credential } from "../credentials/types";
import type { Team } from "../teams/types";

interface SourceEvent {
  datetime: string;
  type: string;
  message: string;
}

export type SourceAccessMode = "public" | "restricted" | "public_until";

export interface SourceAccessPolicy {
  mode: SourceAccessMode;
  teams: Team[] | string[];
  cutoffDate?: string | null;
}

export interface Source extends hasId {
  enabled: boolean;
  unreadErrorCount: number;
  // Number of recent events shown in the warnings popup (the last 50). Computed
  // server-side; use this for the warning badge instead of unreadErrorCount,
  // which is an unbounded cumulative tally. Matches the popup's list count.
  distinctErrorCount: number;
  tags?: string[];
  url: string;
  media: string;
  nickname: string;
  credentials: Credential;
  events?: SourceEvent[];
  user: {
    _id: string;
    username: string;
  } | null;
  keywords?: string;
  regex?: string;
  lists?: string;
  // Structured per-media config (sits alongside the legacy keywords/lists/regex).
  asns?: number[];              // IODA: ASN filter
  region?: string;              // IODA: region code filter
  ooniTestName?: string;        // OONI: measurement test
  ooniDomains?: string[];       // OONI: watched domains
  ooniUseAllDomains?: boolean;  // OONI: watch all domains instead of the list
  accessPolicy?: SourceAccessPolicy;
  __v: number;
  lastReportDate?: string;
}

export interface EditableSource extends hasId {
  credentials: string;
  media: string;
  nickname: string;
  url: string;
  keywords?: string;
  lists?: string;
  asns?: number[];
  region?: string;
  ooniTestName?: string;
  ooniDomains?: string[];
  ooniUseAllDomains?: boolean;
  accessPolicy?: SourceAccessPolicy;
}

// One ASN a source has recently produced reports for (read-only summary).
export interface ObservedAsn {
  asn: string;        // "as13335"
  count: number;
  lastSeen?: string;
  geoScope?: string;
}
