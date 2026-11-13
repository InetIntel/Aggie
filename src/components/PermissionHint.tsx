import { ReactNode, useState } from "react";
import {
  autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss,
  useFloating, useFocus, useHover, useInteractions, useRole,
} from "@floating-ui/react";
import { permissionMessage } from "../utils/permissions";

interface Props { denied: boolean; children: ReactNode; className?: string; }

function DeniedHint({ children, className = "" }: Omit<Props, "denied">) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: setOpen, placement: "top", strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  const hover = useHover(context);
  const focus = useFocus(context);
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);
  return (
    <>
      <span ref={refs.setReference} tabIndex={0} role="group" aria-label={permissionMessage}
        className={`inline-flex cursor-not-allowed ${className}`}
        {...getReferenceProps({ onClick: (event) => event.stopPropagation() })}>
        {children}
      </span>
      {open && <FloatingPortal>
        <span ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}
          className="z-[100] w-64 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal text-white shadow-lg">
          {permissionMessage}
        </span>
      </FloatingPortal>}
    </>
  );
}

/** Explain a disabled action on hover, focus, or tap without clipping in menus. */
export default function PermissionHint({ denied, ...props }: Props) {
  return denied ? <DeniedHint {...props} /> : <>{props.children}</>;
}
