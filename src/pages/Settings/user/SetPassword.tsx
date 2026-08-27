import * as Yup from "yup";

import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { setPassword as setPasswordApi } from "../../../api/users";
import type { User } from "../../../api/users/types";

import { Formik, Form } from "formik";
import AggieButton from "../../../components/AggieButton";
import FormikInput from "../../../components/FormikInput";
import { Session } from "../../../api/session/types";

const updatePasswordSchema = Yup.object().shape({
  password: Yup.string()
    .required("Password is required.")
    .min(7, "Password must be greater than 7 characters"),
  confirmPassword: Yup.string()
    .required("Please re-type your password")
    // use oneOf to match one of the values inside the array.
    // use "ref" to get the value of passwrod.
    .oneOf([Yup.ref("password")], "Passwords does not match"),
});
type IPasswordSchema = Yup.InferType<typeof updatePasswordSchema>;

interface IProps {
  user?: User | Session;
  onClose: () => void;
}

// Pull the backend's plain-text error message out of an axios error.
function errorMessage(err: unknown): string {
  const axiosErr = err as AxiosError;
  const data = axiosErr?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  return axiosErr?.message || "Could not update the password. Please try again.";
}

const SetPassword = ({ user, onClose }: IProps) => {
  const doSetPassword = useMutation(setPasswordApi);

  if (!user) return <></>;

  function onSubmitForm(e: IPasswordSchema, resetForm: () => void) {
    if (!user) return;
    doSetPassword.mutate(
      { _id: user._id, pass: e.password },
      {
        onSuccess: () => {
          resetForm();
          onClose();
        },
        // Keep the dialog open on failure so the error is visible instead of
        // silently swallowed (see doSetPassword.isError render below).
      }
    );
  }
  return (
    <Formik
      initialValues={{ password: "", confirmPassword: "" } as IPasswordSchema}
      onSubmit={(e, { resetForm }) => onSubmitForm(e, resetForm)}
      validationSchema={updatePasswordSchema}
      validateOnBlur={true}
    >
      <Form className='flex flex-col gap-3'>
        <FormikInput name='password' label='Password' type='password' />
        <FormikInput
          name='confirmPassword'
          label='Re-type Password'
          type='password'
        />
        {doSetPassword.isError && (
          <p className='text-sm text-red-600' role='alert'>
            {errorMessage(doSetPassword.error)}
          </p>
        )}
        <div className='flex justify-between'>
          <AggieButton
            disabled={doSetPassword.isLoading}
            variant='secondary'
            type='button'
            onClick={onClose}
          >
            Cancel
          </AggieButton>
          <AggieButton
            variant='primary'
            disabled={doSetPassword.isLoading}
            loading={doSetPassword.isLoading}
            type={"submit"}
          >
            Confirm
          </AggieButton>
        </div>
      </Form>
    </Formik>
  );
};

export default SetPassword;
