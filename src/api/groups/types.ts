import { hasId, GroupSortBy } from "../common";
import { User } from "../users/types";

export const PUBLISHED_OPTIONS = [
  "Not Published",
  "Published",
  "Shared with Networks",
] as const;
export type PublishedOptions = (typeof PUBLISHED_OPTIONS)[number];

interface AssignedToUser extends hasId {
  username: string;
}
interface Creator extends hasId {
  username: string;
}

export interface Group extends hasId {
  tags: string[];
  id?: number;
  smtcTags: string[];
  status: string;
  verification_status: boolean;
  confirmation_status: boolean;
  publication_status: PublishedOptions[];
  escalated: boolean;
  closed: boolean;
  public: boolean;
  _reports: string[];
  title: string;
  assignedTo?: AssignedToUser[] | User[]; // AssignedToUser | AssignedToUser[] <- i dont think its ever not an array
  creator: Creator | null;
  storedAt: string;
  updatedAt: string;
  idnum: number;
  __v: number;
  notes?: string;
  locationName: string;
  comments?: GroupComment[];
  incidentStartedAt: Date;
  incidentEndedAt: Date;
}

export interface Groups {
  total: number;
  results: Group[];
}

export interface GroupEditableData extends Partial<hasId> {
  title: string;
  notes: string;
  verification_status: boolean;
  confirmation_status: boolean;
  publication_status: PublishedOptions[];
  closed: boolean;
  assignedTo: string[];
  locationName: string;
  public: boolean;
  escalated: boolean;
  incidentStartedAt: Date;
  incidentEndedAt: Date;
}

export interface GroupCreateData extends GroupEditableData {
  user: User;
}

export interface GroupQueryState {
  escalated?: string | boolean;
  closed?: string | boolean;
  title?: string;
  totalReports?: string | number;
  assignedTo?: string;
  creator?: string;
  after?: string;
  before?: string;
  idnum?: string | number;
  locationName?: string;
  page?: string | number;
  sortBy?: GroupSortBy;
}

export interface GroupComment extends EditableGroupComment {
  createdAt: string;
  updatedAt: string;
  _id: string;
}

export interface EditableGroupComment {
  data: string;
  author: string;
  attachments: (GroupCommentAttachment | File)[] | null;
}

export const MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export type MimeTypes = (typeof MIME_TYPES)[number];

export interface GroupCommentAttachment {
  _id: string;
  fileName: string;
  path: string;
  mimeType: MimeTypes;
  fileSize: number;
}
