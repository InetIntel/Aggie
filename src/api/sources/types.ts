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
  // Number of *distinct* error messages (deduped, recent window). Computed
  // server-side; use this for the warning badge instead of unreadErrorCount,
  // which is a cumulative per-fetch-cycle tally.
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
  };
  keywords?: string;
  regex?: string;
  lists?: string;
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
  accessPolicy?: SourceAccessPolicy;
}
