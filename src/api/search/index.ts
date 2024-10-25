import axios from "axios";
import { QueryToUrlParams } from "../../utils/QueryToUrlParams";
import { Reports } from "../reports/types";

export interface SearchQueryState extends Record<string, unknown> {
  keywords: string;
  page: number;
  red_flag: boolean;
}

export const getSearch = async (searchState: Partial<SearchQueryState>) => {
  const query = QueryToUrlParams({ query: searchState });
  const queryString = query.size > 0 ? query.toString() : "";
  console.log("queryString", queryString);
  const { data } = await axios.get<Reports | undefined>(
    "/api/search?" + queryString
  );

  return data;
};
