import { FloatingPortal } from "@floating-ui/react";
import React from "react";
import { usePopover } from "../hooks/usePopover";
const starIcon = (
  <svg
    width='16'
    height='16'
    fill='none'
    className='text-purple-600'
    xmlns='http://www.w3.org/2000/svg'
  >
    <path
      d='M9.346 3.114c.093-.321.549-.321.641 0l.953 3.315c.03.107.112.191.218.225l3.19 1.029c.309.099.309.535 0 .634l-3.19 1.029a.333.333 0 0 0-.218.225l-.953 3.315c-.092.321-.548.321-.64 0L8.392 9.57a.333.333 0 0 0-.218-.225l-3.19-1.029a.333.333 0 0 1 0-.634l3.19-1.029a.333.333 0 0 0 .218-.225l.953-3.315ZM3.348 2.381a.333.333 0 0 1 .638 0l.329 1.082c.032.107.116.19.222.222l1.082.33a.333.333 0 0 1 0 .637l-1.082.33a.333.333 0 0 0-.222.222l-.33 1.082a.333.333 0 0 1-.637 0l-.33-1.082a.333.333 0 0 0-.221-.222l-1.083-.33a.333.333 0 0 1 0-.637l1.083-.33a.333.333 0 0 0 .221-.222l.33-1.082ZM4.681 10.381a.333.333 0 0 1 .638 0l.33 1.082c.032.107.115.19.221.222l1.082.33a.333.333 0 0 1 0 .637l-1.082.33a.333.333 0 0 0-.222.222l-.33 1.082a.333.333 0 0 1-.637 0l-.33-1.082a.333.333 0 0 0-.221-.222l-1.082-.33a.333.333 0 0 1 0-.637l1.082-.33a.333.333 0 0 0 .222-.222l.33-1.082Z'
      fill='currentColor'
    />
  </svg>
);

interface IProps {
  name: string;
  children?: React.ReactNode;
  className?: string;
}
const GeneratedTag = ({ name, children, className }: IProps) => {
  const { isOpen, refs, getReferenceProps, getFloatingProps, floatingStyles } =
    usePopover();

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <>
      <span
        key={name}
        ref={refs.setReference}
        {...getReferenceProps()}
        className={`pl-1 pr-2 flex items-center gap-1 font-medium ${
          className ||
          " rounded-full bg-purple-200 hover:bg-purple-300 text-purple-900 "
        }`}
      >
        {starIcon}
        {name}
      </span>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            onClick={onClick}
            className={`max-h-[50vh] shadow-md overflow-y-auto top-full rounded-lg inline-block pointer-events-none z-10 bg-purple-50 border border-purple-400 min-w-20 w-max max-w-md `}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  );
};
export default GeneratedTag;
