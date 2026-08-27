import type {
  hasId,
  VeracityOptions,
  MediaOptions,
  TernaryOptions,
} from "../common";

export interface Report extends hasId {
  veracity: VeracityOptions;
  smtcTags: string[];
  hasSMTCTags: boolean;
  read: boolean;
  _sources: string[];
  _media: MediaOptions[];
  _sourceNicknames: string[];
  asn?: string; // outage alerts (ioda/cloudflare), e.g. "as15169"; absent for social/region-scoped
  escalated: boolean;
  _group?: string;
  authoredAt: string;
  fetchedAt: string;
  content: string;
  author: string;
  metadata: BaseMetadata;
  url: string;
  storedAt: string;
  commentTo: string;
  notes: string;
  originalPost: string;
  irrelevant?: TernaryOptions;
  __v: number;
  aitags: GeneratedTags;
  aitagnames: string[];
  aitags_feedback: Record<string, unknown>[];
  red_flag: boolean;
}

export interface GeneratedTagValue {
  value: string | boolean;
  rationale: string | null;
}
export type GeneratedTags = Record<string, string | boolean>;

export interface Reports {
  total: number;
  results: Report[];
}

export interface ReportQueryState {
  keywords?: string;
  author?: string;
  groupId?: string;
  media?: string;
  dataSources?: string[];
  entityLevel?: string[];
  hideDuplicateASNs?: string; // 'true' or 'false'
  sourceId?: string;
  list?: string;
  reportIds?: string;
  before?: Date | string;
  after?: Date | string;
  tagNames?: string[];
  page?: number;
  batch?: boolean;
  irrelevant?: string;
  alerts?: boolean;
  ongoing?: string;
}

// metadata typed
export interface BaseMetadata {
  imageText: any;
  junkipediaId: number;
  channelId: number;
  accountHandle: string;
  accountUrl: any;
  mediaUrl: string | null;
  attachments?: SocialAttachment[];
  actualStatistics: Statistics;
  rawAPIResponse: RawApiResponse;
  testingFlagForPotentialDeletion: boolean;
}

export interface SocialAttachment {
  type: string;
  imageKey?: string;
  thumbnailKey?: string;
  mimeType?: string | null;
  sourcePlatform?: string | null;
  imageUrl?: string;
  thumbnailUrl?: string;
}

// IODA signal series stored inline on the report (replaces the scraped chart SVG).
// Points are compact [unixSeconds, value|null] pairs; timestamps are reconstructed from
// each series' own step, so series with different steps coexist.
export type IodaChartPoint = [number, number | null];

export interface IodaChartSeries {
  datasource: string; // "bgp" | "ping-slash24" | "merit-nt"
  step: number; // seconds between points
  points: IodaChartPoint[];
}

export interface IodaChartData {
  from: number; // window fetched (unix seconds)
  until: number;
  entity: string; // "region/4442"
  series: IodaChartSeries[];
  // gtr-based predicted-normal band; null when the entity has no gtr data.
  predicted: {
    step: number;
    norm: IodaChartPoint[];
    sarima: IodaChartPoint[];
  } | null;
}

interface RawApiResponse {
  id: string;
  type: string;
  attributes: unknown;
  // IODA/Cloudflare chart: `image` is the media-storage key, `imageUrl` the served URL.
  // Legacy IODA reports carry `image`; new IODA reports carry `chart` (signal series).
  image?: string;
  imageUrl?: string;
  chart?: IodaChartData;
  // IODA/Cloudflare outage alerts: entityName is `${networkName} - ${entityScope}`.
  entityName?: string;
  entityScope?: string;
  [key: string]: any;
}
// i need to redo this...
export type Statistics =
  | TwitterStatistics
  | TiktokStatistics
  | FacebookStatistics
  | YoutubeStatistics;

export interface FacebookStatistics {
  sadCount: number;
  wowCount: number;
  careCount: number;
  hahaCount: number;
  likeCount: number;
  loveCount: number;
  angryCount: number;
  shareCount: number;
  commentCount: number;
  thankfulCount: number;
}
export interface TiktokStatistics {
  awemeId: string;
  diggCount: number;
  loseCount: number;
  playCount: number;
  shareCount: number;
  repostCount: number;
  collectCount: number;
  commentCount: number;
  forwardCount: number;
  downloadCount: number;
  loseCommentCount: number;
  whatsappShareCount: number;
}

export interface TwitterStatistics {
  like_count: number;
  view_count: string | number;
  reply_count: number;
  retweet_count: number;
}

export interface YoutubeStatistics {
  like_count: number;
  view_count: number | string;
  comment_count: number;
  dislike_count: number | null;
  favorite_count: number;
}
