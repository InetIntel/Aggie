import { hasId } from "../common";
import { Credential } from "../credentials/types";

interface SourceEvent {
  datetime: string;
  type: string;
  message: string;
}

export interface Source extends hasId {
  enabled: boolean;
  unreadErrorCount: number;
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
}
