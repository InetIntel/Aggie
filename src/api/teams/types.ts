import { hasId } from "../common";

export type TeamPermission =
  | "view data"
  | "edit data"
  | "manage incident access";

export interface Team extends hasId {
  name: string;
  description?: string;
  active?: boolean;
  leads?: Array<string | { _id: string }>;
  permissionLimits?: {
    deny: TeamPermission[];
  };
}

export interface TeamMember {
  _id: string;
  username: string;
  displayName?: string;
  email: string;
  role: string;
  accountRole?: string;
  teamRole?: "viewer" | "monitor" | "team_lead";
  teamPermissionOverrides?: {
    allow: TeamPermission[];
    deny: TeamPermission[];
  };
  teamPermissions?: TeamPermission[];
  createdBy?: string;
  isTeamLead?: boolean;
}

export interface TeamDetailResponse {
  team: Team;
  members: TeamMember[];
}
