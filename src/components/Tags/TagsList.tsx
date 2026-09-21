import { useQuery } from "@tanstack/react-query";
import { getTags } from "../../api/tags";
import {
  getTagCategoryGroup,
  TAG_CATEGORY_GROUP_LABELS,
  TAG_CATEGORY_GROUPS,
  type Tag,
} from "../../api/tags/types";

interface IProps {
  values: string[] | undefined;
  maxVisible?: number;
}

const TagsList = ({ values, maxVisible }: IProps) => {
  const { isSuccess, isLoading, data } = useQuery(["tags"], getTags, {
    staleTime: 40000,
  });

  if (!isSuccess || isLoading || !data || !values) return <></>;

  const tags = values
    .map((id) => data.find((tag) => tag._id === id))
    .filter((tag): tag is Tag => tag !== undefined)
    .sort((a, b) => {
      const categoryOrder =
        TAG_CATEGORY_GROUPS.indexOf(getTagCategoryGroup(a.category)) -
        TAG_CATEGORY_GROUPS.indexOf(getTagCategoryGroup(b.category));
      return categoryOrder || a.name.localeCompare(b.name);
    });
  const visibleTags = maxVisible ? tags.slice(0, maxVisible) : tags;
  const hiddenTags = maxVisible ? tags.slice(maxVisible) : [];

  return (
    <>
      {visibleTags.map((tag) => (
        <span
          key={tag._id}
          title={`${TAG_CATEGORY_GROUP_LABELS[getTagCategoryGroup(tag.category)]}: ${tag.name}${
            tag.description ? `\n${tag.description}` : ""
          }`}
          className='bg-slate-200 dark:bg-gray-600 font-medium px-2 text-slate-700 dark:text-gray-300 rounded-full whitespace-nowrap'
        >
          {tag.name}
        </span>
      ))}
      {hiddenTags.length > 0 && (
        <span
          title={hiddenTags
            .map(
              (tag) =>
                `${TAG_CATEGORY_GROUP_LABELS[getTagCategoryGroup(tag.category)]}: ${tag.name}`
            )
            .join("\n")}
          className='bg-slate-100 dark:bg-gray-700 font-medium px-2 text-slate-600 dark:text-gray-300 rounded-full whitespace-nowrap'
        >
          +{hiddenTags.length} more
        </span>
      )}
    </>
  );
};

export default TagsList;
