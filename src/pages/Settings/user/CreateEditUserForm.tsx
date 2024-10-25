import * as Yup from "yup";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { newUser, editUser } from "../../../api/users";
import { type User, USER_ROLES } from "../../../api/users/types";

import { Form, Formik } from "formik";
import FormikDropdown from "../../../components/FormikDropdown";
import FormikInput from "../../../components/FormikInput";
import AggieButton from "../../../components/AggieButton";

const userEditSchema = Yup.object().shape({
  username: Yup.string()
    .required("Username is required")
    .min(6, "Username should be atleast 6 characters long."),
  displayName: Yup.string(),
  role: Yup.mixed()
    .required("User Role is required")
    .oneOf([...USER_ROLES], "Invalid user role."),
  email: Yup.string()
    .email("Please provide valid email address.")
    .required("Email address is required."),
});

type editSchema = Yup.InferType<typeof userEditSchema>;

const userCreateSchema = Yup.object().shape({
  username: Yup.string()
    .required("Username is required")
    .min(6, "Username should be atleast 6 characters long."),
  displayName: Yup.string(),
  role: Yup.mixed()
    .oneOf([...USER_ROLES], "Invalid user role.")
    .required("User Role is required")
    .default("viewer"),
  email: Yup.string()
    .email("Please provide valid email address.")
    .required("Email address is required."),
  password: Yup.string()
    .required("Password is required.")
    .min(7, "Password must be greater than 7 characters"),
  confirmPassword: Yup.string()
    .required("Please re-type your password")
    // use oneOf to match one of the values inside the array.
    // use "ref" to get the value of passwrod.
    .oneOf([Yup.ref("password")], "Passwords does not match"),
});

type createSchema = Yup.InferType<typeof userCreateSchema>;

const defaultCreateSchema = userCreateSchema.getDefault();

interface IProps {
  user?: User;
  onClose: () => void;
}

const CreateEditUserForm = ({ user, onClose }: IProps) => {
  const queryClient = useQueryClient();

  const doCreateUser = useMutation(newUser, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["users"]);
    },
  });
  const doEditUser = useMutation(editUser, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["users"]);
    },
  });

  function onSubmitForm(data: editSchema | createSchema) {
    if (!user) {
      doCreateUser.mutate(data);
    } else {
      const withId = { ...data, _id: user._id };
      doEditUser.mutate(withId);
    }
  }

  const isLoading = doCreateUser.isLoading || doEditUser.isLoading;

  const schema = !user ? userCreateSchema : userEditSchema;
  const defaultUser = !user
    ? (defaultCreateSchema as createSchema)
    : ({
        username: user.username,
        role: user.role,
        email: user.email,
      } as editSchema);
  return (
    <Formik
      initialValues={defaultUser}
      onSubmit={(e) => onSubmitForm(e)}
      validationSchema={schema}
      validateOnBlur={true}
    >
      <Form className='flex flex-col gap-3'>
        <FormikDropdown
          label='Role'
          name='role'
          list={[...USER_ROLES].map((i) => {
            return { _id: i, label: i };
          })}
        />
        <FormikInput label='Username' name='username' />
        <FormikInput
          label='Display Name'
          name='displayName'
          placeholder='(optional) display name'
        />
        <FormikInput label='Email' name='email' type='email' />
        {!user && (
          <>
            <FormikInput name='password' label='Password' type='password' />
            <FormikInput
              name='confirmPassword'
              label='Re-type Password'
              type='password'
            />
          </>
        )}
        <div className='flex justify-between'>
          <AggieButton
            disabled={isLoading}
            variant='secondary'
            type='button'
            onClick={onClose}
          >
            Cancel
          </AggieButton>
          <AggieButton
            variant='primary'
            disabled={isLoading}
            loading={isLoading}
            type={"submit"}
          >
            Confirm
          </AggieButton>
        </div>
      </Form>
    </Formik>
  );
};

export default CreateEditUserForm;
