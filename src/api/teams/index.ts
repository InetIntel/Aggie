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