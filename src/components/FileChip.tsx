import { faCircleXmark, faDotCircle, faFileImage, faFile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface FileChipProps {
  name: string;
  index: number;
  path: string;
  onRemove: (i: number) => void;
  hoveredIndex: number | null;
  setHoveredIndex: (i: number | null) => void;
  edit: boolean;
}

export default function FileChip({ name, index, path, onRemove, hoveredIndex, setHoveredIndex, edit, }: FileChipProps) {
  return (
    <span
      key={name + index}
      className='bg-white hover:bg-slate-200 border border-slate-300 flex gap-1 items-center px-2 py-1 rounded-lg text-sm'
      onMouseOver={() => setHoveredIndex(index)}
      onMouseOut={() => setHoveredIndex(null)}
    >
      {edit ? (
        <span
          className='flex h-4 items-center justify-center w-4'
          onClick={() => {
            if (hoveredIndex === index) {
              setHoveredIndex(null);
              onRemove(index);
            }
          }}
          style={{ cursor: hoveredIndex === index ? "pointer" : "default" }}
        >
          <FontAwesomeIcon
            icon={
              hoveredIndex === index
              ? faCircleXmark
              : [".jpeg", ".jpg", ".png"].some(
                ext => name.toLowerCase().endsWith(ext)
              )
                ? faFileImage
                : faFile
            }
            size='lg'
            className={hoveredIndex === index ? "text-red-500" : ""}
          />
        </span>
      ) : (
        <span
          className='flex h-4 items-center justify-center w-4'
        >
          <FontAwesomeIcon
            icon={
              [".jpeg", ".jpg", ".png"].some(
                ext => name.toLowerCase().endsWith(ext)
              )
                ? faFileImage
                : faFile
            }
            size='lg'
          />
        </span>
      )}
      <a href={path} className='hover:underline'>{name}</a>
    </span>
  );
}

interface FileChipListProps {
  nameList: string[];
  pathList: string[];
  onRemove: (i: number) => void;
  hoveredIndex: number | null;
  setHoveredIndex: (i: number | null) => void;
  edit: boolean;
}

export function FileChipList({
  nameList, pathList,
  onRemove,
  hoveredIndex, setHoveredIndex,
  edit,
}: FileChipListProps) {
  if (nameList.length < 1) return <></>;
  const fileList = nameList.map((name, index) => (
    <FileChip
      name={name}
      index={index}
      path={pathList[index]}
      onRemove={onRemove}
      hoveredIndex={hoveredIndex}
      setHoveredIndex={setHoveredIndex}
      edit={edit}
    />
  ));
  return <div className='flex flex-wrap gap-1'>{fileList}</div>
}
