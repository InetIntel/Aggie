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
  "tiktok",
  "instagram",
  "RSS",
  // "elmo",
  // "SMS GH",
  "truthsocial",
  "youtube",
  "facebook",
] as const;
export type MediaOptions = (typeof MEDIA_OPTIONS)[number];

export const ESCALATED_OPTIONS = ["true", "false"] as const;
export type EscalatedOptions = (typeof ESCALATED_OPTIONS)[number];

export const CLOSED_OPTIONS = ["true", "false"] as const;
export type ClosedOptions = (typeof CLOSED_OPTIONS)[number];

export const IRRELEVANCE_OPTIONS = ["true", "maybe", "false"] as const;
export type IrrelevanceOptions = (typeof IRRELEVANCE_OPTIONS)[number];

export const CREDENTIAL_OPTIONS = ["junkipedia", 'rss'] as const;
export type CredentialOption = (typeof CREDENTIAL_OPTIONS)[number];
