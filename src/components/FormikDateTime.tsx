import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { useField } from "formik";

interface IProps {
  name: string;
  label?: string;
  icon?: IconProp;
}
const FormikDateTime = ({ name, label, icon }: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue } = helpers;
  return (
    <label className='flex flex-col gap-1 text-slate-600 dark:text-gray-400'>
      <span>{icon && <FontAwesomeIcon icon={icon} />} {label ? label : name}</span>

      <input
        name={name}
        type='datetime-local'
        value={value.toString().slice(0, 16) || ""}
        onChange={(e) => setValue(e.target.value + ":00.000Z")}
        className='px-3 py-2 focus-theme rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 text-black '
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
export default FormikDateTime;
