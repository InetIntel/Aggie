import { useState } from "react";
import { faCircleXmark, faDotCircle, faFileImage, faFile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FieldProps } from "formik";

interface FileChipProps {
  name: string;
  index: number;
  path: string;
  onRemove?: (i: number) => void;
  form?: FieldProps["form"];
  hoveredIndex: number;
  setHoveredIndex: (i: number) => void;
  edit?: boolean;
}

export default function FileChip({
  name, index, path,
  onRemove,
  form,
  hoveredIndex, setHoveredIndex,
  edit,
}: FileChipProps) {
  return (
    <span
      key={name + index}
      className='bg-white hover:bg-slate-200 border border-slate-300 flex gap-1 items-center px-2 py-1 rounded-lg text-sm'
      onMouseOver={() => setHoveredIndex(index)}
      onMouseOut={() => setHoveredIndex(-1)}
    >
      {(edit && form && onRemove) ? (
        <span
          className='flex h-4 items-center justify-center w-4'
          onClick={() => {
            if (hoveredIndex === index) {
              setHoveredIndex(-1);
              onRemove(index);
              if (form) {
                form.setFieldValue(
                  "attachments",
                  [...form.values.attachments.slice(0, index), ...form.values.attachments.slice(index + 1)]
                ); // ensure value gets to Formik
              }
            }
          }}
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
            className={hoveredIndex === index ? "text-red-500 cursor-pointer" : "cursor-default"}
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
      <a href={path} target='_blank' className='hover:underline'>{name}</a>
    </span>
  );
}

interface FileChipListProps {
  nameList: string[];
  pathList: string[];
  onRemove?: (i: number) => void;
  form?: FieldProps["form"];
  hoveredIndex?: number;
  setHoveredIndex?: (i: number) => void;
  edit?: boolean;
}

export function FileChipList({
  nameList, pathList,
  onRemove,
  form,
  hoveredIndex: externalHoveredIndex, setHoveredIndex: setExternalHoveredIndex,
  edit,
}: FileChipListProps) {
  if (nameList.length < 1 || pathList.length < 1) return <></>;

  const [internalHoveredIndex, setInternalHoveredIndex] = useState(-1);
  const hoveredIndex = externalHoveredIndex ?? internalHoveredIndex;
  const setHoveredIndex = setExternalHoveredIndex ?? setInternalHoveredIndex;

  const fileList = nameList.map((name, index) => (
    <FileChip
      name={name}
      index={index}
      path={pathList[index]}
      onRemove={onRemove}
      form={form}
      hoveredIndex={hoveredIndex}
      setHoveredIndex={setHoveredIndex}
      edit={edit}
    />
  ));

  return <div className='flex flex-wrap gap-1'>{fileList}</div>
}
