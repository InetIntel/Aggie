import { useQuery } from "@tanstack/react-query";
import { getTags } from "../../api/tags";

interface IProps {
  values: string[] | undefined;
}

const TagsList = ({ values }: IProps) => {
  /// do i put this here or in parent idk.
  const { isSuccess, isLoading, data } = useQuery(["tags"], getTags, {
    staleTime: 40000,
  });


  /// lol i should refactor this
  function renderTag(id: string) {
    if (isLoading || !data) return undefined;
    const tag = data.find((i) => i._id === id);
    if (!tag) return undefined;
    return (
      <span
        key={id}
        className='bg-slate-200 dark:bg-gray-600 font-medium px-2 text-slate-700 dark:text-gray-300 rounded-full'
      >
        {tag.name}
      </span>
    );
  }

  if (isSuccess && values) {
    return <>{values.map((id) => renderTag(id))}</>;
  }
  return <></>;
};

export default TagsList;
