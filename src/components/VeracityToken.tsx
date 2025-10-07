import { type VeracityOptions } from "../api/common";
import { type IconDefinition } from "@fortawesome/fontawesome-common-types";
import { faCheck, faMinus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import PlaceholderDiv from "../components/PlaceholderDiv";

type VeracityKeyMap<T> = {
  [key in VeracityOptions]: T;
};

const VeracityColor: VeracityKeyMap<string> = {
  Unconfirmed: "text-gray-500 bg-slate-100 dark:bg-gray-700",
  "Confirmed True": "bg-lime-100 dark:bg-lime-100 dark:saturate-[0.7] text-lime-700 ",
  "Confirmed False": "bg-red-100 dark:bg-red-100 dark:saturate-[0.7] text-red-700 ",
};

const VeracityText: VeracityKeyMap<string> = {
  Unconfirmed: "Unconfirmed",
  "Confirmed True": "True",
  "Confirmed False": "False",
};

const VeracityIcon: VeracityKeyMap<IconDefinition> = {
  Unconfirmed: faMinus,
  "Confirmed True": faCheck,
  "Confirmed False": faXmark,
};

interface IProps {
  value?: VeracityOptions;
}
const VeracityToken = ({ value }: IProps) => {
  if (!value)
    return (
      <span className='h-[1.2em] w-[8em] inline-flex animate-pulse rounded-lg bg-slate-200 dark:bg-gray-600 '></span>
    );
  return (
    <span
      className={`font-medium px-1 inline-flex gap-1 items-center ${VeracityColor[value]}`}
    >
      <FontAwesomeIcon icon={VeracityIcon[value]} />
      {VeracityText[value]}
    </span>
  );
};

export default VeracityToken;
