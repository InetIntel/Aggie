import { hasId } from "../common";

export interface Credential extends hasId {
  id: string;
  name: string;
  type: string;
  secrets: {
    dashboardAPIToken: string;
  };
  __v: number;
}

export interface TelegramUserAuthStartResponse {
  authRequestId: string;
}

export interface TelegramUserAuthVerifyResponse {
  status: "AUTHORIZED" | "PASSWORD_REQUIRED";
}

export interface MastodonAuthStartResponse {
  authRequestId: string;
  authUrl: string;
}

export interface MastodonAuthStatusResponse {
  status: "PENDING" | "AUTHORIZED";
  authRequestId: string;
  account: {
    id?: string;
    username?: string;
    acct?: string;
    url?: string;
    displayName?: string;
  } | null;
}
