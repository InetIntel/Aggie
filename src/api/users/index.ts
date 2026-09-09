import axios from "axios";
import type {
  TeamMemberCandidate,
  User,
  UserCreationData,
  UserDirectoryEntry,
  UserEditableData,
} from "./types";
import type { UserPreferences } from "../session/types";

export const getUsers = async () => {
  const { data } = await axios.get<User[] | undefined>("/api/user");
  return data;
};

export const getUserDirectory = async () => {
  const { data } = await axios.get<UserDirectoryEntry[] | undefined>(
    "/api/user/directory"
  );
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
export const newUser = async (user: UserCreationData) => {
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

// Admin-only: clear another user's MFA (TOTP + WebAuthn) so a locked-out user can recover.
// Hits the root-level auth route (mounted outside /api), same as the other MFA calls.
export const adminResetUserMfa = async (userId: string) => {
  const { data } = await axios.post("/admin/reset-mfa/" + userId);
  return data;
};

export const updateUserTeams = async (params: { _id: string; teams: string[] }) => {
  const { data } = await axios.put<User>("/api/user/" + params._id + "/teams", {
    teams: params.teams,
  });
  return data;
};
// Date/time display preferences are self-service; the backend user_update handler
// whitelists the nested `preferences` object separately from the other fields.
export const updateUserPreferences = async (params: {
  _id: string;
  preferences: UserPreferences;
}) => {
  const { data } = await axios.put<User>("/api/user/" + params._id, {
    preferences: params.preferences,
  });
  return data;
};

export const searchTeamMemberCandidates = async (search: string) => {
  const { data } = await axios.get<TeamMemberCandidate[]>(
    "/api/user/member-candidates",
    { params: { q: search } }
  );
  return data;
};
