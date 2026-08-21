import {
  faExclamationTriangle,
  faInfoCircle,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Field, useField } from "formik";

interface IProps {
  name: string;
  label?: string;
  type?: string;
  placeholder?: string;
  icon?: IconProp;
  disabled?:boolean;
  // Explanation text rendered directly under the label and above the input,
  // matching the label→hint→value order the details view uses.
  hint?: React.ReactNode;
}
const FormikInput = ({ name, label, type, placeholder, icon, disabled, hint }: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue } = helpers;
  return (
    <label className='flex flex-col gap-1 text-slate-600 dark:text-gray-400'>
      <span>{icon && <FontAwesomeIcon icon={icon} />} {label ? label : name}</span>
      {hint && (
        <p className='text-xs text-slate-500 dark:text-gray-400'>{hint}</p>
      )}

      <input
        name={name}
        type={type || "text"}
        placeholder={placeholder ? placeholder : "Enter " + label}
        value={value || ""}
        // onChange={(e) => setValue(e.target.value)}
        // className='px-3 py-2 focus-theme rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 text-black dark:text-gray-300'
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-disabled={disabled ? true : undefined}
        className={
          'px-3 py-2 focus-theme rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 text-black dark:text-gray-300 ' +
          (disabled ? 'opacity-60 cursor-not-allowed' : '')
        }
      />
      {meta.touched && meta.error ? (
        <p className='text-orange-600 my-1 ml-1 inline-flex gap-1 items-center text-sm'>
          <FontAwesomeIcon icon={faExclamationTriangle} size='sm' />
          {meta.error}
        </p>
      ) : null}
    </label>
  );
};
export default FormikInput;
