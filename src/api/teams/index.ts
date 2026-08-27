import axios from "axios";
import type { Team, TeamDetailResponse } from "./types";

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