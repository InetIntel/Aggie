import { hasId } from "../common";

export const TAG_CATEGORIES = [
  "measurement",
  "protocol_affected",
  "cause",
  "circumvention_solution",
  "special",
] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number];

export const UNCATEGORIZED_TAG_CATEGORY = "uncategorized" as const;
export type TagCategoryGroup =
  | TagCategory
  | typeof UNCATEGORIZED_TAG_CATEGORY;

export const TAG_CATEGORY_GROUPS = [
  ...TAG_CATEGORIES,
  UNCATEGORIZED_TAG_CATEGORY,
] as const;

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  measurement: "Measurements",
  protocol_affected: "Protocols Affected",
  cause: "Cause",
  circumvention_solution: "Circumvention Solution",
  special: "Custom tags",
};

export const TAG_CATEGORY_GROUP_LABELS: Record<TagCategoryGroup, string> = {
  ...TAG_CATEGORY_LABELS,
  uncategorized: "Uncategorized",
};

export const getTagCategoryGroup = (
  category: TagCategory | undefined
): TagCategoryGroup =>
  TAG_CATEGORIES.some((item) => item === category)
    ? (category as TagCategory)
    : UNCATEGORIZED_TAG_CATEGORY;

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

export const tagLabel = (tag: Pick<Tag, "name" | "category">) =>
  tag.category === "special" ? `✦ ${tag.name} ✦` : tag.name;

export const tagColor = (tag: Pick<Tag, "category" | "color">) => {
  const colors: Record<TagCategoryGroup, string> = {
    measurement: "#0369a1",
    protocol_affected: "#7c3aed",
    cause: "#b45309",
    circumvention_solution: "#047857",
    special: "#7c3aed",
    uncategorized: "#475569",
  };
  return tag.category === "special" && /^#[0-9a-f]{6}$/i.test(tag.color || "")
    ? tag.color : colors[getTagCategoryGroup(tag.category)];
};
