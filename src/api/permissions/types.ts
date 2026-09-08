import type { Permission } from "../session/types";

export type PermissionOverride = "default" | "allow" | "deny";

export interface PermissionSetting {
  permission: Permission;
  roleDefault: boolean;
  effective: boolean;
  override: PermissionOverride;
}

export interface UserPermissionSettings {
  userId: string;
  role: string;
  editable: boolean;
  permissions: PermissionSetting[];
}
