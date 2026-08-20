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
  "twitter",
  // "tiktok",
  // "instagram",
  // "RSS",
  // "truthsocial",
  // "youtube",
  // "facebook",
  // "telegram",
  "telegramUser",
  "mastodon",
  "ioda",
  "cloudflare",
] as const;
export type MediaOptions = (typeof MEDIA_OPTIONS)[number];

export const SOCIAL_MEDIA_OPTIONS = [
  "twitter",
  // "telegram",
  "telegramUser",
  "mastodon",
  // "tiktok",
  // "instagram",
  // "RSS",
  // "truthsocial",
  // "youtube",
  // "facebook",
] as const satisfies readonly MediaOptions[];

export const ALERT_MEDIA_OPTIONS = [
  "ioda",
  "cloudflare",
] as const satisfies readonly MediaOptions[];

export const DATA_SOURCE_OPTIONS = [
  "Active Probing",
  "BGP",
  "Telescope",
  "Cloudflare Traffic",
] as const;
export type DataSourceOptions = (typeof DATA_SOURCE_OPTIONS)[number];

export const ENTITY_LEVEL_OPTIONS = [
  "Region",
  "AS - Region",
  "AS - Country",
  "AS",
]
export type ENTITY_LEVEL_OPTIONS = (typeof ENTITY_LEVEL_OPTIONS)[number];

export const OUTAGE_STATUS_OPTIONS = ["All", "Ongoing", "Ended"] as const;
export type OutageStatusOption = (typeof OUTAGE_STATUS_OPTIONS)[number];

export const ESCALATED_OPTIONS = ["true", "false"] as const;
export type EscalatedOptions = (typeof ESCALATED_OPTIONS)[number];

export const CLOSED_OPTIONS = ["true", "false"] as const;
export type ClosedOptions = (typeof CLOSED_OPTIONS)[number];

export const TERNARY_OPTIONS = ["true", "maybe", "false"] as const;
export type TernaryOptions = (typeof TERNARY_OPTIONS)[number];

export const CREDENTIAL_OPTIONS = [
  "junkipedia",
  // "telegramBot",
  "telegramUser",
  "mastodon",
  "ioda",
  "cloudflare",
] as const;
export type CredentialOption = (typeof CREDENTIAL_OPTIONS)[number];

// Temporary product cap: one Connection per provider. The multi-connection UI
// (the "Connect {provider}" button when a connection already exists) is kept in
// place and simply gated on this flag — flip to `true` to re-enable it later.
export const ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER = false;

// The Feeds page lets managers override the cap above per-browser (persisted in
// localStorage). Read that override anywhere the connection picker needs to know
// whether multiple connections are allowed — the Feeds page and the edit form
// reached from a feed's details both rely on this single source of truth.
export const MULTI_CONNECTION_STORAGE_KEY = "feeds:allowMultipleConnections";

export const getAllowMultipleConnections = (): boolean => {
  const stored = localStorage.getItem(MULTI_CONNECTION_STORAGE_KEY);
  return stored === null
    ? ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER
    : stored === "true";
};

// Friendly, user-facing name for each provider type. Use this anywhere a
// provider/credential type would otherwise be shown as its raw identifier
// (e.g. "telegramUser", "ioda") in the UI.
export const PROVIDER_LABELS: Record<string, string> = {
  junkipedia: "Junkipedia",
  telegramBot: "Telegram Bot",
  telegramUser: "Telegram",
  mastodon: "Mastodon",
  ioda: "IODA",
  cloudflare: "Cloudflare",
};

// Fall back to the raw value if we don't have a friendly label for it.
export const providerLabel = (type?: string) =>
  (type && PROVIDER_LABELS[type]) || type || "";

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
