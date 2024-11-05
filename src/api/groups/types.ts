import { VeracityOptions, hasId, GroupSortBy } from "../common";
import { User } from "../users/types";

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
  veracity: VeracityOptions;
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
}

export interface Groups {
  total: number;
  results: Group[];
}

export interface GroupEditableData extends Partial<hasId> {
  title: string;
  notes: string;
  veracity: VeracityOptions;
  closed: boolean;
  assignedTo: string[];
  locationName: string;
  public: boolean;
  escalated: boolean;
}

export interface GroupCreateData extends GroupEditableData {
  user: User;
}

export interface GroupQueryState {
  veracity?: string;
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
}
