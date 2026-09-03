import axios from "axios";
import type { Team, TeamDetailResponse, TeamPermission } from "./types";

export const getTeams = async () => {
  const { data } = await axios.get<Team[]>("/api/team");
  return data;
};

export const getTeam = async (teamId: string) => {
  const { data } = await axios.get<TeamDetailResponse>("/api/team/" + teamId);
  return data;
};

export const getManageableTeams = async () => {
  const { data } = await axios.get<Team[]>("/api/team/manageable");
  return data;
};

export const createTeam = async (team: {
  name: string;
  description?: string;
  active?: boolean;
}) => {
  const { data } = await axios.post<Team>("/api/team", team);
  return data;
};

export const deleteTeam = async (teamId: string) => {
  const { data } = await axios.delete("/api/team/" + teamId);
  return data;
};

export const addTeamMember = async (params: {
  teamId: string;
  userId: string;
  role: string;
}) => {
  const { data } = await axios.put<TeamDetailResponse>(
    "/api/team/" + params.teamId + "/member",
    {
      userId: params.userId,
      role: params.role,
    }
  );

  return data;
};

export const removeTeamMember = async (params: {
  teamId: string;
  userId: string;
}) => {
  const { data } = await axios.delete<TeamDetailResponse>(
    "/api/team/" + params.teamId + "/member/" + params.userId
  );

  return data;
};

export const updateTeamMemberPermissions = async (params: {
  teamId: string;
  userId: string;
  allow: TeamPermission[];
  deny: TeamPermission[];
}) => {
  const { data } = await axios.put<TeamDetailResponse>(
    "/api/team/" + params.teamId + "/member/" + params.userId + "/permissions",
    {
      allow: params.allow,
      deny: params.deny,
    }
  );

  return data;
};

export const updateTeamPermissionLimits = async (params: {
  teamId: string;
  deny: TeamPermission[];
}) => {
  const { data } = await axios.put<TeamDetailResponse>(
    "/api/team/" + params.teamId + "/permissions",
    { deny: params.deny }
  );

  return data;
};

export const updateTeamStatus = async (params: {
  teamId: string;
  active: boolean;
}) => {
  const { data } = await axios.put<TeamDetailResponse>(
    "/api/team/" + params.teamId + "/status",
    { active: params.active }
  );

  return data;
};

export const getIncidentAccessTeams = async () => {
  const { data } = await axios.get<Team[]>('/api/team/incident-access');
  return data;
};
