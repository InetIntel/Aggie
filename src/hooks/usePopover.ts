import {
  useFloating,
  useInteractions,
  useHover,
  useFocus,
  safePolygon,
  flip,
  shift,
  offset,
} from "@floating-ui/react";
import { useState } from "react";
/***
 * abstracting away @floating-ui/react things
 * https://floating-ui.com/docs/getting-started
 */
const defaultOptions = {
  offset: 3,
};
export function usePopover(
  userOptions: Partial<typeof defaultOptions> = defaultOptions
) {
  const options = { ...defaultOptions, ...userOptions };

  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    placement: "bottom",
    middleware: [flip(), shift(), offset(options.offset)],

    open: isOpen,
    onOpenChange: setIsOpen,
  });
  const hover = useHover(context, {
    restMs: 100,
    // If their cursor never rests, open it after 1000ms as a
    // fallback.
    delay: { open: 500 },
    handleClose: safePolygon({ blockPointerEvents: true }),
  });
  const focus = useFocus(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
  ]);

  return {
    isOpen,
    refs,
    getReferenceProps,
    getFloatingProps,
    floatingStyles,
  };
}
