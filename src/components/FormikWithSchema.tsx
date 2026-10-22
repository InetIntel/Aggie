import type { AnySchema } from "yup";

import { Formik, Form } from "formik";
import AggieButton from "./AggieButton";

interface IProps {
  schema: AnySchema;
  children: React.ReactNode;
  initialValues?: any;
  onSubmit: (e: any) => void;
  loading?: boolean;
  disabled?: boolean;
  onSubmitText?: React.ReactNode;
  onClose?: () => void;
  // Allow submitting a valid but untouched (pristine) form. Set this for
  // create forms whose `initialValues` are already valid on mount (e.g. a
  // pre-generated connection name), so the user doesn't have to edit the field
  // just to enable the button. Defaults off to keep edit/rename dialogs from
  // being confirmed without a change.
  allowPristineSubmit?: boolean;
}
const FormikWithSchema = ({
  schema,
  children,
  onSubmit,
  initialValues,
  onSubmitText,
  loading = false,
  disabled = false,
  onClose,
  allowPristineSubmit = false,
}: IProps) => {
  return (
    <Formik
      enableReinitialize
      initialValues={initialValues ? initialValues : schema.getDefault()}
      validationSchema={schema}
      onSubmit={(e) => onSubmit(e)}
    >
      {({ isValid, dirty }) => (
        <Form className='flex flex-col gap-3'>
          {children}
          <div className='flex justify-between '>
            <AggieButton
              disabled={loading}
              variant='secondary'
              type='button'
              onClick={onClose}
            >
              Cancel
            </AggieButton>
            <AggieButton
              variant='primary'
              // Block submission until the user has actually changed something
              // (`dirty`), so nothing can be confirmed on a pristine form —
              // unless `allowPristineSubmit` is set for a form whose initial
              // values are already valid (e.g. a pre-generated name).
              disabled={
                disabled ||
                !isValid ||
                (!dirty && !allowPristineSubmit) ||
                loading
              }
              loading={loading}
              type={"submit"}
            >
              {onSubmitText || "Confirm"}
            </AggieButton>
          </div>
        </Form>
      )}
    </Formik>
  );
};

export default FormikWithSchema;
