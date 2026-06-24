import { hasId } from "../common";

export const USER_ROLES = ["viewer", "monitor", "admin", "team_lead"] as const;
export type UserRoles = (typeof USER_ROLES)[number];

export interface UserTeam {
  _id: string;
  name: string;
  description?: string;
  active?: boolean;
}

export interface User extends hasId {
  provider: string;
  hasDefaultPassword: boolean;
  role: UserRoles | string; // string for backwards compat
  email: string;
  username: string;
  displayName?: string;
  teams?: UserTeam[];
  __v: number;
  createdBy?: string;
  mfa?: {
    totp?: {
      enabled?: boolean;
      issuer?: string;
      digits?: number;
      period?: number;
      algo?: string;
    };
  };
}

export interface UserEditableData {
  username: string;
  displayName?: string;
  email: string;
  role: UserRoles;
  _id?: string;
}

export interface UserCreationData extends UserEditableData {
  password: string;
}
