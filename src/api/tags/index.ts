import axios from "axios";
import { Tag, TagEditableData } from "./types";

export const newSpecialTag = async (tag: { name: string; color: string; description?: string }) => {
  const { data } = await axios.post<Tag>("/api/tag/special", tag);
  return data;
};

export const getTags = async () => {
  const { data } = await axios.get<Tag[] | undefined>("/api/tag");
  return data;
};

export const newTag = async (tag: TagEditableData) => {
  const { data } = await axios.post("/api/tag/", tag);
  return data;
};

export const editTag = async (tag: TagEditableData) => {
  const { data } = await axios.put("/api/tag/" + (tag.category === "special" ? "special/" : "") + tag._id, tag);
  return data;
};

export const deleteTag = async (tag: Tag) => {
  const { data } = await axios.delete("/api/tag/" + tag._id);
  return data;
};
