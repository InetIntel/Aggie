import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Field, useField } from "formik";

interface IProps {
  name: string;
  label?: string;
}
const FormikDate = ({ name, label }: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue } = helpers;
  return (
    <label className='flex flex-col gap-1 text-slate-600'>
      {label ? label : name}

      <input
        name={name}
        type='date'
        value={value || ""}
        onChange={(e) => setValue(e.target.value)}
        className='px-3 py-2 focus-theme rounded border border-slate-300 bg-slate-50 text-black'
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
export default FormikDate;
