import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const cssBase = "flex gap-1 px-2 font-medium items-center ";

const variants = {
  "light:red": "bg-red-200 dark:bg-red-200 dark:saturate-[0.7] text-red-800",
  "dark:red": "bg-red-600 dark:bg-red-600 dark:saturate-[0.7] text-red-50",
  "light:amber": "bg-amber-200 dark:bg-amber-200 dark:saturate-[0.7] text-amber-800",
  "light:green": "bg-green-200 dark:bg-green-200 dark:saturate-[0.7] text-green-800",
};

interface IProps {
  icon?: IconProp;
  className?: string;
  variant?: keyof typeof variants;
  children: React.ReactNode;
}

const AggieToken = ({ children, icon, className = "", variant }: IProps) => {
  return (
    <span className={`${className} ${variant && (cssBase + variants[variant])}`}>
      {icon && <FontAwesomeIcon icon={icon} />}
      {children}
    </span>
  );
};

export default AggieToken;
