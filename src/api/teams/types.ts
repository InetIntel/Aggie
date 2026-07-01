import { hasId } from "../common";

export interface Team extends hasId {
  name: string;
  description?: string;
  active?: boolean;
}