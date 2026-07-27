import type { Group } from "../../../api/groups/types";

export type IncidentTableStatus = "Open" | "Closed" | "In Progress";

export function statusFromGroup(group: Group): IncidentTableStatus {
  if (group.closed) return "Closed";
  if (group.escalated) return "In Progress";
  return "Open";
}
