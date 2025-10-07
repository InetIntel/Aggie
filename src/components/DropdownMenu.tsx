import { Menu } from "@headlessui/react";
import React, { Children, cloneElement } from "react";

const styleVariants = {
  secondary: {
    button:
      "border-slate-300 hover:bg-slate-300 dark:hover:bg-gray-500 bg-slate-100 dark:bg-gray-700 ui-open:bg-slate-300 dark:ui-open:bg-gray-500",
    panel: "bg-white dark:bg-gray-800 border border-slate-300 rounded-lg",
  },
};

interface IProps {
  children: React.ReactNode;
  buttonElement: React.ReactNode;
  variant?: keyof typeof styleVariants;
  disabled?: boolean;
  className?: string;
  panelClassName?: string;
  overrideStyles?: boolean;
}

const DropdownMenu = ({
  children,
  buttonElement,
  variant,
  overrideStyles = false,
  disabled = false,
  className = "",
  panelClassName = "",
}: IProps) => {
  // wrapped in an extra div to make react ref error go away (cloneElement tries to attach a ref to the element, but custom components do not thave that)
  const ChildrenWithProps = Children.map(children, (child) => (
    <Menu.Item>
      {({ active }) => cloneElement(<div>{child as JSX.Element}</div>)}
    </Menu.Item>
  ));
  const defaultButtonStyle =
    "focus-theme disabled:opacity-70 disabled:pointer-events-none font-medium";

  const defaultPanelStyle = "absolute top-full mt-1 shadow-md z-10";
  return (
    <Menu as='div' className='relative'>
      <Menu.Button
        className={`${overrideStyles ? "" : defaultButtonStyle} ${
          variant ? styleVariants[variant].button : ""
        } ${className}`}
        disabled={disabled}
      >
        {buttonElement}
      </Menu.Button>
      <Menu.Items
        className={`${overrideStyles ? "" : defaultPanelStyle} ${
          variant ? styleVariants[variant].panel : ""
        } ${panelClassName}`}
      >
        {children && ChildrenWithProps}
      </Menu.Items>
    </Menu>
  );
};

export default DropdownMenu;
