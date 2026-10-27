import { Permission, Session } from "../api/session/types";

export type ActionPermission = Permission | "create incident";

export interface PermissionResource {
  canEdit?: boolean;
  accessPolicy?: { mode?: string; teams?: (string | { _id: string })[] };
}

// Match allowGlobalOrScoped and canModifyIncidentWithScope on the server.
export function hasPermission(session: Session | undefined, permission: ActionPermission,
  resource?: PermissionResource): boolean {
  if (!session) return false;
  // Cached capabilities must never promote a user who has no edit permission.
  if (permission === "edit data" && session.role !== "admin" && !session.permissions?.includes("edit data")) return false;
  if (resource?.canEdit === false && (permission === "create incident" || permission === "edit data")) return false;
  if (permission === "create incident") {
    const account = session.accountPermissions || session.permissions || [];
    return session.role === "admin" || account.includes("edit data") ||
      (session.role !== "team_lead" && getIncidentCreationTeamIds(session).length > 0);
  }
  if (permission === "edit data" && resource?.canEdit !== undefined) return resource.canEdit;
  if (session.role === "admin") return true;
  const account = session.accountPermissions || session.permissions || [];
  if (session.role === "team_lead") return account.includes(permission);
  // Policy controls restrict their choices to teams the user may manage.
  if (permission === "manage incident access") return session.permissions?.includes(permission) === true;
  if (!resource) return session.permissions?.includes(permission) === true;
  if (resource.accessPolicy?.mode !== "restricted") return account.includes(permission);
  return (resource.accessPolicy.teams || []).some((team) =>
    session.teamPermissions?.[typeof team === "string" ? team : team._id]?.includes(permission)
  );
}

export const permissionMessage = "Your permissions do not allow this action. Contact an administrator if you need access.";

// A scoped creator must also be able to set the new incident's team policy.
export function getIncidentCreationTeamIds(session: Session | undefined): string[] {
  if (!session) return [];
  const canSetAnyPolicy = session.accountPermissions?.includes("manage incident access");
  return Object.entries(session.teamPermissions || {}).filter(([, permissions]) =>
    permissions.includes("edit data") &&
    (canSetAnyPolicy || permissions.includes("manage incident access"))
  ).map(([id]) => id);
}
