import axios from "axios";
import type { Team } from "./types";

export const getTeams = async () => {
  const { data } = await axios.get<Team[]>("/api/team");
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