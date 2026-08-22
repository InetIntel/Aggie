import { hasId } from "../common";

export interface Team extends hasId {
  name: string;
  description?: string;
  active?: boolean;
  leads?: Array<string | { _id: string }>;
}

export interface TeamMember {
  _id: string;
  username: string;
  displayName?: string;
  email: string;
  role: string;
  accountRole?: string;
  teamRole?: "viewer" | "monitor" | "team_lead";
  createdBy?: string;
  isTeamLead?: boolean;
}

export interface TeamDetailResponse {
  team: Team;
  members: TeamMember[];
}
