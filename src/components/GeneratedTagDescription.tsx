import { isBoolean, startCase } from "lodash";
import { GeneratedTags } from "../api/reports/types";
import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
interface IProps {
  k: string;
  v: string | boolean;
  tags: GeneratedTags;
}

const GeneratedTagDescription = ({ k, v, tags }: IProps) => {
  const [show, setShow] = useState(false);

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setShow(true);
  }

  return (
    <div
      key={k}
      className={`py-2 px-2 flex justify-between items-center bg-white dark:bg-gray-800 border-y border-purple-100 ${
        isBoolean(v) && v === false ? "hidden" : "block"
      }`}
    >
      <div>
        <div className={``}>
          <span className='rounded-full px-2 py-0.5 mb-1 font-medium text-sm bg-purple-100 dark:bg-purple-100 dark:saturate-[0.7] border border-purple-200'>
            {" "}
            {startCase(k).replaceAll("_", " ")}
          </span>
          {isBoolean(v) ? (
            <span className=''></span>
          ) : (
            <span className='block font-medium'>{v}</span>
          )}
        </div>

        <p
          className={` text-sm italic max-w-prose text-ellipsis ${
            show ? "" : "line-clamp-2"
          }`}
        >
          {`${k}_rationale` in tags && tags[`${k}_rationale`]}
        </p>
        {!show && (
          <button
            type='button'
            className='text-sm flex gap-1 items-center text-blue-700 hover:underline'
            onClick={onClick}
          >
            <FontAwesomeIcon icon={faCaretDown} />
            more
          </button>
        )}
      </div>
    </div>
  );
};

export default GeneratedTagDescription;
