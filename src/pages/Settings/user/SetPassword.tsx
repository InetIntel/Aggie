import * as Yup from "yup";

import { useMutation } from "@tanstack/react-query";
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

const SetPassword = ({ user, onClose }: IProps) => {
  if (!user) return <></>;

  const doSetPassword = useMutation(setPasswordApi);

  function onSubmitForm(e: IPasswordSchema, resetForm: () => void) {
    if (!user) return;
    doSetPassword.mutate(
      { _id: user._id, pass: e.password },
      {
        onSuccess: () => {
          resetForm();
          onClose();
        },
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
