export interface hasId {
  _id: string;
}

export const VERACITY_OPTIONS = [
  "Unconfirmed",
  "Confirmed False",
  "Confirmed True",
] as const;
export type VeracityOptions = (typeof VERACITY_OPTIONS)[number];

export const MEDIA_OPTIONS = [
  // "twitter",
  // "tiktok",
  // "instagram",
  // "RSS",
  // "truthsocial",
  // "youtube",
  // "facebook",
  "ioda",
  "cloudflare",
] as const;
export type MediaOptions = (typeof MEDIA_OPTIONS)[number];

export const DATA_SOURCE_OPTIONS = [
  "Active Probing",
  "BGP",
  "Telescope",
  "Cloudflare Traffic",
] as const;
export type DataSourceOptions = (typeof DATA_SOURCE_OPTIONS)[number];

export const ENTITY_LEVEL_OPTIONS = [
  "AS",
  "Region",
  "AS - Region",
]
export type ENTITY_LEVEL_OPTIONS = (typeof ENTITY_LEVEL_OPTIONS)[number];

export const ESCALATED_OPTIONS = ["true", "false"] as const;
export type EscalatedOptions = (typeof ESCALATED_OPTIONS)[number];

export const CLOSED_OPTIONS = ["true", "false"] as const;
export type ClosedOptions = (typeof CLOSED_OPTIONS)[number];

export const IRRELEVANCE_OPTIONS = ["true", "maybe", "false"] as const;
export type IrrelevanceOptions = (typeof IRRELEVANCE_OPTIONS)[number];

//export const CREDENTIAL_OPTIONS = ["junkipedia", "rss", "twitter"] as const;
export const CREDENTIAL_OPTIONS = ["ioda", "cloudflare"] as const;
export type CredentialOption = (typeof CREDENTIAL_OPTIONS)[number];

export const GROUP_SORTBY = [
  "descStartDate",
  "ascStartDate",
  "descEndDate",
  "ascEndDate",
  "mostComments",
  "leastComments",
  "mostReports",
  "leastReports",
] as const;
export type GroupSortBy = (typeof GROUP_SORTBY)[number];
