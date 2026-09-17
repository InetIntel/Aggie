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
  autoComplete?: string;
  icon?: IconProp;
  disabled?:boolean;
  // Explanation text rendered directly under the label and above the input,
  // matching the label→hint→value order the details view uses.
  hint?: React.ReactNode;
  // Render a multi-line <textarea> instead of a single-line <input>, so long
  // values (e.g. comma/newline-separated lists) wrap instead of overflowing.
  multiline?: boolean;
  rows?: number;
}
const FormikInput = ({
  name,
  label,
  type,
  placeholder,
  autoComplete,
  icon,
  disabled,
  hint,
  multiline,
  rows,
}: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue } = helpers;
  return (
    <label className='flex flex-col gap-1 min-w-0 text-slate-600 dark:text-gray-400'>
      <span>{icon && <FontAwesomeIcon icon={icon} />} {label ? label : name}</span>
      {hint && (
        <p className='text-xs text-slate-500 dark:text-gray-400'>{hint}</p>
      )}

      {multiline ? (
        <textarea
          name={name}
          placeholder={placeholder ? placeholder : "Enter " + label}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          aria-disabled={disabled ? true : undefined}
          rows={rows || 3}
          className={
            'w-full min-w-0 resize-y px-3 py-2 focus-theme rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 text-black dark:text-gray-300 ' +
            (disabled ? 'opacity-60 cursor-not-allowed' : '')
          }
        />
      ) : (
        <input
          name={name}
          type={type || "text"}
          placeholder={placeholder ? placeholder : "Enter " + label}
          autoComplete={autoComplete}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          aria-disabled={disabled ? true : undefined}
          className={
            'w-full min-w-0 px-3 py-2 focus-theme rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 text-black dark:text-gray-300 ' +
            (disabled ? 'opacity-60 cursor-not-allowed' : '')
          }
        />
      )}
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
