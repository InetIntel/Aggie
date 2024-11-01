import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Popover } from "@headlessui/react";
import React from "react";
//BACKLOG: use popper-react for nicer pop-overs
interface passToChildProps {
  close: () => void;
}

interface IProps {
  label: string;
  children: (props: passToChildProps) => React.ReactNode;
  value?: string;
  onReset?: () => void;
  headerChild?: React.ReactNode;
}

const FilterDropdown = ({
  label,
  children,
  value,
  onReset = () => {},
  headerChild,
}: IProps) => {
  return (
    <Popover className='relative'>
      <Popover.Button
        className={({ open }) =>
          `focus-theme py-1 hover:bg-slate-100 hover:underline line-clamp-1 max-w-[24em] ${
            open ? "bg-slate-100" : ""
          } rounded ${value ? "bg-slate-200 px-2" : "px-1"}`
        }
      >
        {({ open }) => (
          <>
            <FontAwesomeIcon
              icon={faCaretDown}
              className={`${open ? "rotate-180" : ""} mr-1 text-slate-500`}
            />
            {value ? value : label}
          </>
        )}
      </Popover.Button>
      <Popover.Panel className='absolute mt-1 right-0 rounded-lg border border-slate-300  bg-slate-100 overflow-hidden min-w-[12em] drop-shadow-lg z-10'>
        {({ close }) => (
          <>
            <header className='py-1 px-1 border-b border-slate-300 relative'>
              <div className='flex justify-between mb-1 ml-1 items-center'>
                <h3 className='text-sm font-medium '>{label}</h3>

                {value && (
                  <button
                    className='px-1 -mr-1 rounded hover:bg-slate-200 absolute right-2 text-slate-600  underline '
                    onClick={() => {
                      onReset();
                      close();
                    }}
                  >
                    clear
                  </button>
                )}
              </div>
              {headerChild && headerChild}
            </header>
            {children({ close })}
          </>
        )}
      </Popover.Panel>
    </Popover>
  );
};

export default FilterDropdown;
