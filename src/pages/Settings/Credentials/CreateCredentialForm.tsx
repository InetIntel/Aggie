import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Yup from "yup";
import { newCredential } from "../../../api/credentials";

import { Listbox } from "@headlessui/react";
import FormikInput from "../../../components/FormikInput";
import FormikWithSchema from "../../../components/FormikWithSchema";

import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CredentialOption, CREDENTIAL_OPTIONS } from "../../../api/common";

// credential type dropdown

interface IProps {
  onClose: () => void;
}
const CreateCredentialForm = ({ onClose }: IProps) => {
  const [credentialType, setCredentialType] =
    //useState<CredentialOption>("junkipedia");
    useState<CredentialOption>("ioda");

  const queryClient = useQueryClient();
  const doCreateCredential = useMutation(newCredential, {
    onSuccess: () => {
      queryClient.invalidateQueries(["credentials"]);
      onClose();
    },
  });

  // junkpedia credential
  // could be cleaner but idk how to work the type inferencing with yup
  /*const junkipediaSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    junkipediaAPIKey: Yup.string().required("API Token required"),
  });
  type IJunkipediaSchema = Yup.InferType<typeof junkipediaSchema>;

  const junkipediaForm = (
    <FormikWithSchema
      schema={junkipediaSchema}
      onSubmit={(values: IJunkipediaSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "junkipedia",
          secrets: {
            junkipediaAPIKey: values.junkipediaAPIKey,
          },
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput name='name' label='Credential Name' />
      <FormikInput name='junkipediaAPIKey' label='Junkipedia API Token' />
    </FormikWithSchema>
  );


  // rss credential
  // could be cleaner but idk how to work the type inferencing with yup
  const rssSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required")
  });
  type IRssSchema = Yup.InferType<typeof rssSchema>;

  const rssForm = (
    <FormikWithSchema
      schema={rssSchema}
      onSubmit={(values: IRssSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "rss",
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput name='name' label='Credential Name' />
    </FormikWithSchema>
  );
  const twitterSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    consumerKey: Yup.string().required("Consumer key required."),
    consumerSecret: Yup.string().required("Consumer secret required."),
    accessToken: Yup.string().required("Access Token required."),
    accessTokenSecret: Yup.string().required("Access Token secret required."),
  });
  type ITwitterSchema = Yup.InferType<typeof twitterSchema>;

  const twitterForm = (
    <FormikWithSchema
      schema={twitterSchema}
      onSubmit={(values: ITwitterSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "twitter",
          secrets: {
            consumerKey: values.consumerKey,
            consumerSecret: values.consumerSecret,
            accessToken: values.accessToken,
            accessTokenSecret: values.accessTokenSecret,
          },
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput name='name' label='Credential Name' />
      <FormikInput name='consumerKey' label='Twitter API Token' />
      <FormikInput name='consumerSecret' label='Twitter API Token Secret' />
      <FormikInput name='accessToken' label='Twitter Access Token' />
      <FormikInput name='accessTokenSecret' label='Twitter Access Token Secret' />
    </FormikWithSchema>
  );*/

  // const crowdTangleSchema = Yup.object().shape({
  //   name: Yup.string().required("Credentials name required"),
  //   dashboardAPIToken: Yup.string().required("API Token required"),
  // });

  const iodaSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required")
  });
  type IodaSchema = Yup.InferType<typeof iodaSchema>;

  const iodaForm = (
    <FormikWithSchema
      schema={iodaSchema}
      onSubmit={(values: IodaSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "ioda",
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput name='name' label='Credential Name' />
    </FormikWithSchema>
  );

  const cloudflareSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    cloudflareApiToken: Yup.string().required("Cloudflare API Token required."),
  });
  type CloudflareSchema = Yup.InferType<typeof cloudflareSchema>;

  const cloudflareForm = (
    <FormikWithSchema
      schema={cloudflareSchema}
      onSubmit={(values: CloudflareSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "cloudflare",
          secrets: {
            cloudflareApiToken: values.cloudflareApiToken,
          },
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput name='name' label='Credential Name' />
      <FormikInput name='cloudflareApiToken' label='Cloudflare API Token' />
    </FormikWithSchema>
  );

  return (
    <>
      <label className='text-slate-600'>Credential Type</label>
      <Listbox
        value={credentialType}
        onChange={setCredentialType}
        as='div'
        className='relative font-medium mb-3'
      >
        <Listbox.Button className='px-3 py-2 focus-theme flex justify-between items-center bg-slate-50 border border-slate-300 w-full hover:bg-slate-100 text-left ui-active:bg-slate-200  rounded'>
          {credentialType || "Select Credential"}
          <FontAwesomeIcon
            icon={faChevronDown}
            className='ui-active:rotate-180 text-slate-400'
          />
        </Listbox.Button>
        <Listbox.Options className='absolute left-0 mt-1 right-0 shadow-md border border-slate-300 bg-white rounded'>
          {[...CREDENTIAL_OPTIONS].map((item) => (
            <Listbox.Option
              key={item}
              value={item}
              className='flex justify-between px-3 py-2 hover:bg-slate-100 ui-selected:bg-slate-100 cursor-pointer items-center'
            >
              {item}

              <FontAwesomeIcon
                icon={faCheck}
                className={`text-slate-400 ${
                  item === credentialType ? "" : "hidden"
                }`}
              />
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </Listbox>
      { /*{credentialType === "junkipedia" && junkipediaForm}
      {credentialType === "rss" && rssForm}
      {credentialType === "twitter" && twitterForm}*/ }
      {credentialType === "ioda" && iodaForm}
      {credentialType === "cloudflare" && cloudflareForm}
    </>
  );
};

export default CreateCredentialForm;
