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
