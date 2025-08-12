import * as Yup from "yup";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { getCredentials } from "../../../api/credentials";
import { editSource, newSource } from "../../../api/sources";
import type { Source } from "../../../api/sources/types";

import { Listbox } from "@headlessui/react";
import FormikDropdown from "../../../components/FormikDropdown";
import FormikInput from "../../../components/FormikInput";
import FormikWithSchema from "../../../components/FormikWithSchema";

import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CredentialOption, CREDENTIAL_OPTIONS } from "../../../api/common";

interface IProps {
  source?: Source;
  onClose: () => void;
}
const CreateEditSourceForm = ({ source, onClose }: IProps) => {
  const [credentialType, setCredentialType] =
    useState<CredentialOption>("ioda");

  const queryClient = useQueryClient();

  const { data: credentials } = useQuery(["credentials"], getCredentials, {
    staleTime: 50000,
  });

  const defaultCredential =
    credentials && credentials.find((cred) => cred.type === credentialType);

  const credentialsList =
    credentials && credentials.filter((cred) => cred.type === credentialType);

  function onSubmit(data: any) {
    data = { ...data, media: credentialType };

    if (!source) {
      doCreateSource.mutate(data);
      return;
    }
    doEditSource.mutate({ ...data, _id: source._id });
  }

  const doCreateSource = useMutation(newSource, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const doEditSource = useMutation(editSource, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const isLoading = doCreateSource.isLoading || doEditSource.isLoading;

  // junkpedia credential
  // could be cleaner but idk how to work the type inferencing with yup
  const JunkipediaSchema = Yup.object().shape({
    nickname: Yup.string().required("Source name is a required field"),
    // sourceKeywords: Yup.string().required(
    //   "Keywords are required to create a Junkipedia source"
    // ),
    // lists: Yup.string().required(
    //   "Lists are required to create a Junkipedia source"
    // ),
    credentials: Yup.string().required(
      "A credential is required to create a source"
    ),
  });
  type IJunkipediaSchema = Yup.InferType<typeof JunkipediaSchema>;

  const JunkipediaForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || defaultCredential?._id,
        sourceURL: source?.url || "",
        url: "https://www.junkipedia.com/",
      }}
      schema={JunkipediaSchema}
      onSubmit={(values: IJunkipediaSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <FormikInput name='nickname' label='Source Name' />
      <FormikInput name='lists' label='Lists' />

      <FormikDropdown
        list={
          credentialsList?.map((i) => {
            return { _id: i._id, label: i.name };
          }) || [{ _id: "", label: "loading" }]
        }
        label={"API Credentials"}
        name={"credentials"}
      />
    </FormikWithSchema>
  );


  const iodaSchema = Yup.object().shape({
    nickname: Yup.string().required("Source Name is required"),
    keywords: Yup.string().required("Country Code is required"),
  });
  type IodaSchema = Yup.InferType<typeof iodaSchema>;
  const iodaForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || defaultCredential?._id,
        sourceURL: source?.url || "",
        url: "",
      }}
      schema={iodaSchema}
      onSubmit={(values: IodaSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <FormikInput name='nickname' label='Source Name' />
      <FormikDropdown
        list={
          [{ _id: "IR", label: "IR" }]
        }
        label={"Two-Letter Country Code"}
        name={"keywords"}
      />
    </FormikWithSchema>
  );

  const cloudflareSchema = Yup.object().shape({
    nickname: Yup.string().required("Source Name is required"),
    keywords: Yup.string().required("Country Code is required"),
  });
  type CloudflareSchema = Yup.InferType<typeof cloudflareSchema>;
  const cloudflareForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || defaultCredential?._id,
        sourceURL: source?.url || "",
        url: "",
      }}
      schema={cloudflareSchema}
      onSubmit={(values: CloudflareSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <FormikInput name='nickname' label='Source Name' />
      <FormikDropdown
        list={
          [{ _id: "IR", label: "IR" }]
        }
        label={"Two-Letter Country Code"}
        name={"keywords"}
      />
    </FormikWithSchema>
  );


  /*const RssSchema = Yup.object().shape({
    nickname: Yup.string().required("Source name is a required field"),
    // sourceKeywords: Yup.string().required(
    //   "Keywords are required to create a Junkipedia source"
    // ),
    lists: Yup.string().required(
      "Lists are required to create a Junkipedia source"
    ),
  });
  type IRssSchema = Yup.InferType<typeof RssSchema>;


  const RSSForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "",
      }}
      schema={RssSchema}
      onSubmit={(values: IRssSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <FormikInput name='nickname' label='Source Name' />
      <FormikInput name='lists' label='Lists' />
      <FormikInput name='regex' label='regex' />
      <FormikDropdown
        list={
          credentialsList?.map((i) => {
            return { _id: i._id, label: i.name };
          }) || [{ _id: "", label: "loading" }]
        }
        label={"API Credentials"}
        name={"credentials"}
      />
    </FormikWithSchema>
  );

  const twitterSchema = Yup.object().shape({
    nickname: Yup.string().required("Source name is a required field"),
    // regex: Yup.string().required(
    //   "Query is required to create a Twitter source"
    // ),
    credentials: Yup.string().required(
      "A credential is required to create a source"
    ),
  });
  type ITwitterSchema = Yup.InferType<typeof twitterSchema>;

  const TwitterForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || defaultCredential?._id,
        sourceURL: source?.url || "",
        url: "https://www.x.com/",
      }}
      schema={twitterSchema}
      onSubmit={(values: ITwitterSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <FormikInput name='nickname' label='Credential Name' />

      <FormikInput name='regex' label='regex' />
      { /*<FormikInput name='lists' label='Lists' /> }

      <FormikDropdown
        list={
          credentialsList?.map((i) => {
            return { _id: i._id, label: i.name };
          }) || [{ _id: "", label: "loading" }]
        }
        label={"API Credentials"}
        name={"credentials"}
      />
    </FormikWithSchema>
  );*/

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
      {credentialType === "junkipedia" && JunkipediaForm}
      {/*credentialType === "rss" && RSSForm*/}
      {/*credentialType === "twitter" && TwitterForm*/}
      {credentialType === "ioda" && iodaForm}
      {credentialType === "cloudflare" && cloudflareForm}
    </>
  );
};

export default CreateEditSourceForm;
