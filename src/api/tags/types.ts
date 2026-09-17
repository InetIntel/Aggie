import { hasId } from "../common";

export const TAG_CATEGORIES = [
  "measurement",
  "protocol_affected",
  "cause",
  "circumvention_solution",
] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number];

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  measurement: "Measurements",
  protocol_affected: "Protocols Affected",
  cause: "Cause",
  circumvention_solution: "Circumvention Solution",
};

export interface Tag extends hasId {
  isCommentTag: boolean;
  name: string;
  category: TagCategory;
  color: string;
  description: string;
  user: {
    _id: string;
    username: string;
  };
  updatedAt: string;
  storedAt: string;
  __v: number;
  isBeingEdited?: boolean;
  isBeingEditedBy?: string;
}

export interface TagEditableData {
  name: string;
  category: TagCategory;
  description?: string;
  isCommentTag: boolean;
  color: string;
  _id?: string;
  isBeingEdited?: boolean;
  isBeingEditedBy?: string;
}
