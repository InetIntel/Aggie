import PermissionHint from "./PermissionHint";
import { usePermission } from "../hooks/usePermission";
import { ActionPermission, PermissionResource, permissionMessage } from "../utils/permissions";
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
  permission?: ActionPermission;
  permissionResource?: PermissionResource;
  children: React.ReactNode;
  buttonElement: React.ReactNode;
  variant?: keyof typeof styleVariants;
  disabled?: boolean;
  className?: string;
  panelClassName?: string;
  overrideStyles?: boolean;
}

const DropdownMenu = ({
  permission,
  permissionResource,
  children,
  buttonElement,
  variant,
  overrideStyles = false,
  disabled = false,
  className = "",
  panelClassName = "",
}: IProps) => {
  const allowed = usePermission(permission, permissionResource);
  // wrapped in an extra div to make react ref error go away (cloneElement tries to attach a ref to the element, but custom components do not thave that)
  const ChildrenWithProps = Children.map(children, (child) => (
    <Menu.Item>
      {({ active }) => cloneElement(<div>{child as JSX.Element}</div>)}
    </Menu.Item>
  ));
  const defaultButtonStyle =
    "focus-theme disabled:opacity-70 disabled:cursor-not-allowed font-medium";

  const defaultPanelStyle = "absolute top-full mt-1 shadow-md z-10";
  return (
    <Menu as='div' className='relative'>
      <PermissionHint denied={!allowed}>
      <Menu.Button
        className={`${overrideStyles ? "" : defaultButtonStyle} ${
          variant ? styleVariants[variant].button : ""
        } ${className}`}
        style={!allowed ? { pointerEvents: "none" } : undefined}
        disabled={disabled || !allowed}
        aria-label={!allowed ? permissionMessage : undefined}
      >
        {!allowed && <span aria-hidden="true">🔒 </span>}
        {buttonElement}
      </Menu.Button>
      </PermissionHint>
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
