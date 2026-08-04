import axios from "axios";
import type { Permission } from "../session/types";
import type { UserPermissionSettings } from "./types";

export const getUserPermissions = async (userId: string) => {
  const { data } = await axios.get<UserPermissionSettings>(
    `/api/permission/user/${userId}`
  );
  return data;
};

export const updateUserPermissions = async (params: {
  userId: string;
  allow: Permission[];
  deny: Permission[];
}) => {
  const { data } = await axios.put<UserPermissionSettings>(
    `/api/permission/user/${params.userId}`,
    { allow: params.allow, deny: params.deny }
  );
  return data;
};
