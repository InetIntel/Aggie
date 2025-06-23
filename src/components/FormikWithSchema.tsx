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
}: IProps) => {
  return (
    <Formik
      enableReinitialize
      initialValues={initialValues ? initialValues : schema.getDefault()}
      validationSchema={schema}
      onSubmit={(e) => onSubmit(e)}
    >
      {({ isValid }) => (
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
              disabled={disabled || !isValid || loading}
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
