import axios from "axios";
import type { AsnInfo, AsnInfoMap } from "./types";

export const getAllAsns = async () => {
  const { data } = await axios.get<AsnInfo[]>("/api/asn");
  return data;
};


export const getAsnsByIds = async (asns: string[]) => {
  if (!asns || asns.length === 0) return {} as AsnInfoMap;

  const { data } = await axios.post<AsnInfoMap>("/api/asn/bulk", { asns });
  return data;
};