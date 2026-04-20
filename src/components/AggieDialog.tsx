import { useEffect } from "react";

// a more generic dialog
import { Dialog } from "@headlessui/react";

interface IProps {
  isOpen: boolean;
  onClose: () => void;
  data?: {
    title: string;
    description?: string;
  };
  children?: React.ReactNode;
  className?: string;
}

const AggieDialog = ({
  isOpen = false,
  onClose,
  children,
  data,
  className,
}: IProps) => {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (isOpen)
    return (
      <Dialog
        static
        open
        onClose={() => {}}
        className='relative z-50'
      >
        <div className='fixed inset-0 bg-black/30 dark:bg-white/20' aria-hidden='true' />
        <div className='fixed inset-0 w-screen overflow-y-auto'>
          <div className='flex min-h-full items-center justify-center p-4'>
            <Dialog.Panel
              className={`bg-white dark:bg-gray-800 rounded-xl border border-slate-200 shadow-xl min-w-24 min-h-12 ${className}`}
            >
              {!!data && (
                <header className=' pb-3 '>
                  <Dialog.Title className='text-xl font-medium'>
                    {data.title}
                  </Dialog.Title>
                  <Dialog.Description>{data.description}</Dialog.Description>
                </header>
              )}

              {children}
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    );
  return <></>;
};
export default AggieDialog;
