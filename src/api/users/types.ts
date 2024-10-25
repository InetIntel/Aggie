import { hasId } from "../common";

export const USER_ROLES = ["viewer", "monitor", "admin"] as const;
export type UserRoles = (typeof USER_ROLES)[number];

export interface User extends hasId {
  provider: string;
  hasDefaultPassword: boolean;
  role: UserRoles | string; // string for backwards compat
  email: string;
  username: string;
  displayName?: string;
  __v: number;
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
