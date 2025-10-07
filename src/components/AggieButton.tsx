import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { forwardRef } from "react";

const defaultCSS =
  "disabled:pointer-events-none disabled:opacity-50 inline-flex gap-1 items-center text-nowrap focus-theme font-medium";

export const VariantCSS = {
  primary:
    "bg-green-800 text-slate-100 dark:text-gray-300  hover:bg-green-700 border border-green-600 rounded-lg dark:bg-green-800 dark:hover:bg-green-700 dark:border-green-700 dark:saturate-[0.7]",
  secondary:
    "bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 border border-slate-300 rounded-lg",
  transparent: "hover:bg-slate-200 dark:hover:bg-gray-600 hover:underline  rounded-lg",
  danger: "bg-red-700 text-white dark:text-gray-300 hover:bg-red-600 dark:bg-red-700 dark:hover:bg-red-600 dark:saturate-[0.7] rounded-lg ",
  warning: "bg-red-200 text-red-700 hover:bg-red-300 rounded-lg dark:bg-red-200 dark:hover:bg-red-300 dark:saturate-[0.7]",
  "light:green": "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-100 dark:hover:bg-green-200 dark:saturate-[0.7]",
  "light:lime": "hover:bg-lime-200 bg-lime-100 text-lime-800 dark:bg-lime-100 dark:hover:bg-lime-200 dark:saturate-[0.7]",
  "light:amber": "hover:bg-amber-200 bg-amber-100 text-amber-800 dark:bg-amber-100 dark:hover:bg-amber-100 dark:saturate-[0.7]",
  "light:rose": "bg-rose-200 text-rose-800 hover:bg-rose-300 dark:bg-rose-200 dark:hover:bg-rose-200 dark:saturate-[0.7]",
};

interface IProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  override?: boolean;
  variant?: keyof typeof VariantCSS;
  padding?: string;
  loading?: boolean;
  icon?: IconProp;
  stopPropagation?: boolean;
}

const AggieButton = forwardRef(
  ({
    className,
    override = false,
    loading = false,
    variant,
    padding,
    icon,
    children,
    ...props
  }: IProps) => {
    return (
      <button
        className={
          override
            ? className
            : `${defaultCSS} ${padding ? padding : "px-2 py-1"} ${className} ${
                variant ? VariantCSS[variant] : ""
              }`
        }
        {...props}
      >
        {loading ? (
          <FontAwesomeIcon icon={faSpinner} className={"animate-spin"} />
        ) : (
          !!icon && <FontAwesomeIcon icon={icon} />
        )}
        {children}
      </button>
    );
  }
);

export default AggieButton;
