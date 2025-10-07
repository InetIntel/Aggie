import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQueryParams } from "../hooks/useQueryParams";

import * as Yup from "yup";
import { logIn } from "../api/session";

import { Field, Formik, FormikValues, Form } from "formik";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import AggieButton from "../components/AggieButton";

const loginFormSchema = Yup.object().shape({
  loginUsername: Yup.string().required("Username required"),
  loginPassword: Yup.string().required("Password required"),
});

interface IProps { }

const Login = ({ }: IProps) => {
  const { getParam } = useQueryParams<{ to: string }>();

  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const loginQuery = useMutation(logIn, {
    onSuccess: (_) => {
      // if theres a return parameter, return to that url
      if (!!getParam("to")) {
        navigate(getParam("to"));
      }
      //reload website to check for session in root
      navigate(0);
    },
    onError: (_) => { },
  });
  const [passwordVisibility, setPasswordVisibility] = useState(false);
  const formValuesToLogin = (values: FormikValues) => {
    return {
      username: values.loginUsername,
      password: values.loginPassword,
    };
  };
  useEffect(() => {document.title = "Aggie"}, []);
  return (
    <main
      className='grid place-items-center h-[100svh]'
      style={{
        background: "linear-gradient(to bottom right, #2D9242, #0d6efd)",
      }}
    >
      <section className='rounded-lg bg-white dark:bg-gray-800 shadow-xl mb-24 p-4 w-full max-w-lg'>
        <div className='flex justify-center text-[#416B34]'>
          <div>
            <svg
              fill='none'
              viewBox='0 0 62 62'
              className='w-24 h-24   px-2 rounded-lg'
            >
              <path
                d='M31 39a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm15-15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-4-14a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 29a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-43 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm30 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14-28a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-43 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm16 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z'
                fill='currentColor'
              />
            </svg>

            <h2 className={"mb-3 mt-1 text-center text-xl font-medium"}>
              Aggie
            </h2>
          </div>
        </div>
        <div
          className={`px-2 py-2 bg-red-100 border border-red-800 text-red-700 font-medium rounded-lg ${loginQuery.isError ? " " : "hidden"
            }`}
        >
          <span>
            Your username and password combination was not correct, please try
            again.
          </span>
        </div>
        <Formik
          initialValues={{ loginUsername: "", loginPassword: "" }}
          validationSchema={loginFormSchema}
          onSubmit={(values) => {
            loginQuery.mutate(formValuesToLogin(values), {
              onSuccess: (_) => queryClient.invalidateQueries(["session"]),
            });
          }}
        >
          {({
            values,
            handleChange,
            handleSubmit,
          }) => (
            <Form noValidate onSubmit={handleSubmit}>
              <label
                htmlFor='loginPassword'
                className='font-medium text-sm text-slate-600 dark:text-gray-400'
              >
                Username
              </label>
              <Field
                className='focus-theme px-3 py-2 border mb-2 border-slate-300 bg-slate-50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-800 rounded-lg w-full'
                required
                type='text'
                placeholder='Username'
                name='loginUsername'
                onChange={handleChange}
                value={values.loginUsername}
              />

              <label
                htmlFor='loginPassword'
                className='font-medium text-sm text-slate-600 dark:text-gray-400'
              >
                Password
              </label>
              <div className='flex mb-6'>
                <Field
                  className='focus-theme px-3 py-2 border-y border-l border-slate-300 bg-slate-50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-800 rounded-l-lg w-full'
                  required
                  type={passwordVisibility ? "text" : "password"}
                  placeholder='Password'
                  name='loginPassword'
                  onChange={handleChange}
                  value={values.loginPassword}
                  spellCheck={false}
                  autoCorrect={"off"}
                  autoCapitalize={"off"}
                  autoComplete={"loginPassword"}
                />
                <AggieButton
                  type='button'
                  className='rounded-r-lg w-12 bg-slate-100 dark:bg-gray-700 border-y border-r border-slate-300 justify-center hover:bg-slate-200 dark:hover:bg-gray-600 '
                  onClick={() => setPasswordVisibility(!passwordVisibility)}
                >
                  <FontAwesomeIcon
                    icon={passwordVisibility ? faEyeSlash : faEye}
                  />
                </AggieButton>
              </div>

              <div className='flex justify-end'>
                {/* <Button variant='link'>Forgot your username?</Button> */}
                <AggieButton
                  variant='primary'
                  className='w-full justify-center text-lg'
                  type='submit'
                  loading={loginQuery.isLoading}
                  disabled={
                    loginQuery.isLoading ||
                    !values.loginPassword ||
                    !values.loginUsername
                  }
                >
                  Sign in
                </AggieButton>
              </div>
            </Form>
          )}
        </Formik>
      </section>
    </main>
  );
};

export default Login;
