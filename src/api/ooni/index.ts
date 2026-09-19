import axios from "axios";
import type { OoniSeries } from "./types";

export const getOoniSeries = async (asn: number, until: string) => {
  const { data } = await axios.get<OoniSeries>("/api/ooni/series", {
    params: { asn, until },
  });
  return data;
};
