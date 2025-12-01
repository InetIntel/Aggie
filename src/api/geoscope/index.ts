import axios from "axios";

export interface GeoScopeOption {
  key: string;
  value: string;
  level?: string;
  countryCode?: string;
}

export const getGeoScopes = async () => {
  const { data } = await axios.get<GeoScopeOption[]>("/api/geoscope");
  return data;
};