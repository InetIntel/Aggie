import { ActionPermission } from "../utils/permissions";
import { usePermission } from "../hooks/usePermission";
import type { AnySchema } from "yup";

import { Formik, Form } from "formik";
import AggieButton from "./AggieButton";

interface IProps {
  permission?: ActionPermission;
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
  permission,
  schema,
  children,
  onSubmit,
  initialValues,
  onSubmitText,
  loading = false,
  disabled = false,
  onClose,
}: IProps) => {
  const allowed = usePermission(permission);
  return (
    <Formik
      enableReinitialize
      initialValues={initialValues ? initialValues : schema.getDefault()}
      validationSchema={schema}
      onSubmit={(e) => { if (allowed && !disabled && !loading) onSubmit(e); }}
    >
      {({ isValid, dirty }) => (
        <Form className='flex flex-col gap-3'>
          <fieldset disabled={!allowed} className={!allowed ? "contents opacity-50" : "contents"}>{children}</fieldset>
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
              permission={permission}
              variant='primary'
              // Block submission until the user has actually changed something
              // (`dirty`), so nothing can be confirmed on a pristine form.
              disabled={disabled || !isValid || !dirty || loading}
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
