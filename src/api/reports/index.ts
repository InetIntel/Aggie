import axios from "axios";
import type { Report, ReportQueryState, Reports } from "./types";

import type { hasId, TernaryOptions, VeracityOptions } from "../common";
import { isString } from "lodash";

export const getReports = async (
  searchState: ReportQueryState,
  alerts?: boolean,
  tagIds: hasId[] | string[] = [],
) => {
  const urlparams = urlFromReportsQuery(searchState, alerts, tagIds);

  if (urlparams != "") {
    const { data } = await axios.get<Reports | undefined>(
      "/api/report?" + urlparams
    );
    return data;
  } else {
    const { data } = await axios.get<Reports | undefined>("/api/report");
    return data;
  }
};

export const getReport = async (id: string | undefined) => {
  if (id) {
    const { data } = await axios.get<Report | undefined>("/api/report/" + id);
    return data;
  }
};

export const editReport = async (report: Report) => {
  const { data } = await axios.put("/api/report/" + report._id, report);
  return data;
};

export const getBatch = async () => {
  const { data } = await axios.get<Reports>("/api/report/batch");
  return data;
};

export const getNewBatch = async () => {
  const { data } = await axios.patch("/api/report/batch");
  return data;
};

export const cancelBatch = async () => {
  const { data } = await axios.put("/api/report/batch");
  return data;
};

export const setSelectedRead = async (reportIds: string[], read = true) => {
  const { data } = await axios.patch("/api/report/_read", {
    ids: reportIds,
    read: read,
  });
  return data;
};

export const setSelectedVeracity = async (
  reportIds: string[],
  veracity: VeracityOptions | string
) => {
  const { data } = await axios.patch("/api/report/_veracity", {
    ids: reportIds,
    veracity: veracity,
  });
  return data;
};

export const setSelectedIrrelevance = async (
  reportIds: string[],
  irrelevance: TernaryOptions | string
) => {
  const { data } = await axios.patch("/api/report/_irrelevance", {
    ids: reportIds,
    irrelevance: irrelevance,
  });
  return data;
};

export const setSelectedNotes = async (reportIds: string[], notes: string) => {
  const { data } = await axios.patch("/api/report/_notes", {
    ids: reportIds,
    notes: notes,
  });
  return data;
};

export const setSelectedEscalated = async (
  reportIds: string[],
  escalated: boolean
) => {
  const { data } = await axios.patch("/api/report/_escalated", {
    ids: reportIds,
    escalated: escalated,
  });
  return data;
};

interface setTagsParams {
  reportIds: string[];
  tagIds: string[];
}
export const setSelectedTags = async (params: setTagsParams) => {
  const { data } = await axios.patch("/api/report/_tags", {
    ids: params.reportIds,
    tags: params.tagIds,
  });
  return data;
};

interface setReportsToGroupParams {
  reportIds: string[];
  groupId: hasId | null;
}
export const setReportsToGroup = async (params: setReportsToGroupParams) => {
  const { data } = await axios.patch<null>("/api/report/_group", {
    ids: params.reportIds,
    group: params.groupId,
  });
  return data;
};

interface removeReportsFromGroupParams {
  reportIds: string[];
  groupId: hasId | null;
}
export const removeReportsFromGroup = async (
  params: removeReportsFromGroupParams
) => {
  const { data } = await axios.patch<null>("/api/report/_group-rm", {
    ids: params.reportIds,
    group: params.groupId,
  });
  return data;
};

/**
 * todo: get rid of tagId? i dont see why this needs to be separated
 * @param queryState
 * @param tagIds
 */
export function urlFromReportsQuery(
  queryState: ReportQueryState,
  alerts?: boolean,
  tagIds: hasId[] | string[] = []
) {
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
  if (!("irrelevant" in queryState)) {
    url.set("irrelevant", "all");
  }
  if (
    alerts &&
    (!("entityLevel" in queryState) ||
      !queryState.entityLevel ||
      queryState.entityLevel.length === 0)
  ) {
    url.set("entityLevel", "Region,AS - Region,AS - Country");
  }
  if (alerts && !("hideDuplicateASNs" in queryState)) {
    url.set("hideDuplicateASNs", "false");
  }
  if (typeof alerts !== "undefined") url.set("alerts", alerts.toString());
  if (tagIds && tagIds.length > 0) {
    if (isString(tagIds[0])) url.set("tags", tagIds.toString());
    else {
      const tostring = tagIds.map((i) => (i as hasId)._id);
      url.set("tags", tostring.toString());
    }
  }
  return url.toString();
}

interface IAITagsFeedback {
  report: Report;
  aitags_feedback: Record<string, unknown>;
}
/**
 * ai tags feedback submissions
 */
export async function setAITagsFeedback(params: IAITagsFeedback) {
  const combine = {
    ...params.report,
    aitags_feedback: [
      ...(params.report.aitags_feedback || []),
      params.aitags_feedback,
    ],
  };
  console.log(combine);
  const data = await editReport(combine);
  return data;
}
