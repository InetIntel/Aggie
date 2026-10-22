// this is the goofy goober implementation of a confirmation dialog
// if u need a more flexiable dialog, use AggieDialog.tsx
import { useEffect } from "react";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { Dialog } from "@headlessui/react";
import AggieButton, { VariantCSS } from "./AggieButton";

interface IProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  confirmText?: React.ReactNode;
  variant: keyof typeof VariantCSS;
  disabled?: boolean;
  className?: string;
  icon?: IconProp;
  loading?: boolean;
}

const ConfirmationDialog = ({
  isOpen = false,
  onClose,
  onConfirm,
  children,
  variant,
  title,
  icon,
  description,
  disabled = false,
  loading = false,
  confirmText,
  className,
}: IProps) => {
  useEffect(() => {
    if (!isOpen || disabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, isOpen, onClose]);

  if (!isOpen) return <></>;

  return (
    <Dialog
      static
      open
      onClose={() => {}}
      className='relative z-50 '
    >
      <div className='fixed inset-0 bg-black/30 dark:bg-white/20' aria-hidden='true' />
      <div className='fixed inset-0 flex w-screen items-center justify-center p-4'>
        <Dialog.Panel
          className={`bg-white dark:bg-gray-800 rounded-xl border border-slate-200 shadow-xl min-w-24 min-h-12 ${className}`}
        >
          <header className='px-3 py-3'>
            <Dialog.Title className='text-xl font-medium'>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </header>

          {children}
          <div className='flex gap-1 justify-between border-t px-3 py-3 w-full max-w-lg text-center border-slate-200'>
            <AggieButton
              variant='secondary'
              onClick={onClose}
              className='w-full justify-center'
              disabled={disabled}
            >
              Cancel
            </AggieButton>

            <AggieButton
              variant={variant}
              className='w-full justify-center'
              loading={loading}
              onClick={() => {
                onConfirm();
              }}
              icon={variant === "danger" ? faTrash : icon}
              disabled={disabled}
            >
              {confirmText ? confirmText : "Confirm"}
            </AggieButton>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default ConfirmationDialog;
