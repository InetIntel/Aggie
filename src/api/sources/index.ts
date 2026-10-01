import axios from "axios";
import { ObservedAsn, Source } from "./types";

export const getSources = async () => {
  const { data } = await axios.get<Source[] | undefined>("/api/source");
  return data;
};

// Read-only summary of the ASNs a source has recently produced reports for.
export const getObservedAsns = async (id: string | undefined) => {
  if (!id) return [] as ObservedAsn[];
  const { data } = await axios.get<ObservedAsn[]>(
    "/api/source/" + id + "/observed-asns"
  );
  return data;
};

export const getSource = async (id: string | undefined) => {
  if (id) {
    const { data } = await axios.get<Source | undefined>("/api/source/" + id);
    return data;
  }
};

export const newSource = async (sourceData: any) => {
  const { data } = await axios.post("/api/source", sourceData);
  return data;
};

export const editSource = async (sourceData: any) => {
  const { data } = await axios.put("/api/source/" + sourceData._id, sourceData);
  return data;
};

export const deleteSource = async (source: Source) => {
  const { data } = await axios.delete("/api/source/" + source._id);
  return data;
};
