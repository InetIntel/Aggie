import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "../api/session";
import { ActionPermission, hasPermission, PermissionResource } from "../utils/permissions";

export const PermissionResourceContext = createContext<PermissionResource | undefined>(undefined);

export function usePermission(permission?: ActionPermission, resource?: PermissionResource) {
  const inherited = useContext(PermissionResourceContext);
  const { data: session } = useQuery(["session"], getSession, { staleTime: 50000, enabled: !!permission });
  return !permission || hasPermission(session, permission, resource || inherited);
}
