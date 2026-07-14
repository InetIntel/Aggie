import axios from "axios";
import type { User, UserEditableData } from "./types";

export const getUsers = async () => {
  const { data } = await axios.get<User[] | undefined>("/api/user");
  return data;
};


export const getManageableUsers = async () => {
  const { data } = await axios.get<User[] | undefined>("/api/user/manageable");
  return data;
};


export const getUser = async (id: string) => {
  const { data } = await axios.get<User | undefined>("/api/user/" + id);
  return data;
};

// We use UserEditableData because we don't actually pass a full user object when creating one.
export const newUser = async (user: UserEditableData) => {
  const { data } = await axios.post("/api/user/", user);
  return data;
};

// We use UserEditableData because we don't actually pass a full user object when editing one.
export const editUser = async (user: UserEditableData) => {
  const { data } = await axios.put("/api/user/" + user._id, user);
  return data;
};

export const deleteUser = async (user: User) => {
  const { data } = await axios.delete("/api/user/" + user._id);
  return data;
};

export const setPassword = async (params: { _id: string; pass: string }) => {
  const { data } = await axios.put("/api/user/password_set/" + params._id, {
    password: params.pass,
  });
  return data;
};

export const updateUserTeams = async (params: { _id: string; teams: string[] }) => {
  const { data } = await axios.put<User>("/api/user/" + params._id + "/teams", {
    teams: params.teams,
  });
  return data;
};