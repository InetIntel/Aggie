// Or known on the backend as groups.
import axios from "axios";
import {
  Group,
  GroupEditableData,
  Groups,
  GroupQueryState,
  GroupComment,
  EditableGroupComment,
} from "./types";
import type { Reports } from "../reports/types";
import { hasId, VeracityOptions } from "../common";
import { omitBy, isNil } from "lodash";
import { ReportQueryState } from "../../objectTypes";
import { urlFromReportsQuery } from "../reports";

export const getGroups = async (
  searchState: GroupQueryState = {},
  tagIds: hasId[] = []
) => {
  const queryState = urlFromQuery(searchState, tagIds);
  if (queryState != "") {
    const { data } = await axios.get<Groups | undefined>(
      "/api/group?" + queryState
    );
    return data;
  } else {
    const { data } = await axios.get<Groups | undefined>("/api/group");
    return data;
  }
};

const defaultAllGroups = {
  lean: "true",
};

export const getAllGroups = async (
  options: Partial<typeof defaultAllGroups> = defaultAllGroups
) => {
  options = { ...defaultAllGroups, ...options };
  const params = new URLSearchParams(options);
  const { data } = await axios.get<
    Pick<Group, "title" | "_id">[] | Groups | undefined
  >("/api/group/all?" + params.toString());

  return data;
};

export const getGroup = async (id: string | undefined) => {
  if (id) {
    const { data } = await axios.get<Group | undefined>("/api/group/" + id);
    return data;
  }
};

export const newGroup = async (groupData: Partial<GroupEditableData>) => {
  const { data } = await axios.post<Group>("/api/group", groupData);
  return data;
};

export const editGroup = async (group: Group | Partial<GroupEditableData>) => {
  const updateValues = omitBy(group, (v) => isNil(v) || v === "");

  const { data } = await axios.put<Group>(
    "/api/group/" + group._id,
    updateValues
  );
  return data;
};

export const deleteGroup = async (group: Group) => {
  const { data } = await axios.delete("/api/group/" + group._id);
  return data;
};

export const getGroupReports = async (searchState: ReportQueryState = {}) => {
  if (!searchState.groupId) return undefined;
  const queryState = urlFromReportsQuery(searchState);
  const { data } = await axios.get<Reports | undefined>(
    "/api/report?" + queryState
  );
  return data;
};

interface Selected {
  ids: string[];
}
interface SelectedOne {
  id: string;
}
interface SetVeracityParams extends Selected {
  veracity: VeracityOptions | string;
}
export const setSelectedVeracity = async (params: SetVeracityParams) => {
  const { data } = await axios.patch("/api/group/_veracity", {
    ids: params.ids,
    veracity: params.veracity,
  });
  return data;
};

interface SetEscalatedParams extends Selected {
  escalated: boolean;
}
export const setSelectedEscalated = async (params: SetEscalatedParams) => {
  const { data } = await axios.patch("/api/group/_escalated", {
    ids: params.ids,
    escalated: params.escalated,
  });
  return data;
};

interface SetClosedParams extends Selected {
  closed: boolean;
}
export const setSelectedClosed = async (params: SetClosedParams) => {
  const { data } = await axios.patch("/api/group/_closed", {
    ids: params.ids,
    closed: params.closed,
  });
  return data;
};

interface SetAssignedToParams extends Selected {
  assignedTo: string[];
}
export const setSelectedAssignedTo = async (params: SetAssignedToParams) => {
  const { data } = await axios.patch("/api/group/_assignedto", {
    ids: params.ids,
    assignedTo: params.assignedTo,
  });
  return data;
};

export const setSelectedTitle = async (groupIds: string[], title: string) => {
  const { data } = await axios.patch("/api/group/_title", {
    ids: groupIds,
    title: title,
  });
  return data;
};

export const setSelectedNotes = async (groupIds: string[], notes: string) => {
  const { data } = await axios.patch("/api/group/_notes", {
    ids: groupIds,
    notes: notes,
  });
  return data;
};

interface addCommentParams extends SelectedOne {
  comment: EditableGroupComment;
}
export const addComment = async (params: addCommentParams) => {
  if (!params.id) return undefined;
  const { data } = await axios.patch("/api/group/_comment_add", {
    ids: [params.id],
    comment: params.comment,
  });
  return data;
};

interface editCommentParams extends Partial<SelectedOne> {
  comment: EditableGroupComment;
}
export const editComment = async (params: editCommentParams) => {
  if (!params.id) return undefined;
  const { data } = await axios.patch("/api/group/_comment_update", {
    ids: [params.id],
    comment: params.comment,
  });
  return data;
};

interface deleteCommentParams extends Partial<SelectedOne> {
  comment: EditableGroupComment | GroupComment;
}
export const removeComment = async (params: deleteCommentParams) => {
  if (!params.id) return undefined;
  const { data } = await axios.patch("/api/group/_comment_remove", {
    ids: [params.id],
    comment: params.comment,
  });
  return data;
};

export const setSelectedLocationName = async (
  groupIds: string[],
  locationName: string
) => {
  const { data } = await axios.patch("/api/group/_locationName", {
    ids: groupIds,
    locationName: locationName,
  });
  return data;
};

/**
 * todo: get rid of tagId? i dont see why this needs to be separated
 * @param queryState
 * @param tagIds
 */
function urlFromQuery(queryState: GroupQueryState, tagIds: hasId[] = []) {
  const url = new URLSearchParams();
  // i think ideally GroupQueryState should convert to record<string,string>
  Object.entries(queryState).forEach(([key, value]) => {
    //overrides:
    if (key === "locationName") {
      url.set("location", value);
    } else {
      url.set(key, value);
    }
  });
  if (tagIds && tagIds.length > 0) {
    url.set("tags", tagIds.toString());
  }
  return url.toString();
}
