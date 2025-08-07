import { useField } from "formik";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import AggieSwitch from "./AggieSwitch";

interface IProps {
  name: string;
  label?: string;
  icon?: IconProp;
}
const FormikSwitch = ({ name, label, icon }: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue } = helpers;

  return (
    <label className='flex items-center gap-2 w-full'>
      <AggieSwitch checked={value} onChange={() => setValue(!value)} />
      <span className='text-slate-600'>
        {icon && <FontAwesomeIcon icon={icon} />} {label}
      </span>
    </label>
  );
};
export default FormikSwitch;
