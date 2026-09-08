import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteCredential, getCredentials } from "../../../api/credentials";
import type { Credential } from "../../../api/credentials/types";

import CreateCredentialForm from "./CreateCredentialForm";
import { providerLabel } from "../../../api/common";
import AxiosErrorCard from "../../../components/AxiosErrorCard";
import AggieButton from "../../../components/AggieButton";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import AggieDialog from "../../../components/AggieDialog";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlusCircle,
  faRefresh,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

// Credentials list + create/delete, extracted so it can render both on its own
// page (`CredentialsIndex`) and inside the consolidated Connections page.
const CredentialsSection = () => {
  const queryClient = useQueryClient();
  const [deletionModal, setDeletionModal] = useState<Credential>();
  const [openCreate, setOpenCreate] = useState(false);

  const { data, isError, error } = useQuery(["credentials"], getCredentials);
  const doDeleteCredential = useMutation(deleteCredential, {
    onSuccess: () => {
      setDeletionModal(undefined);
      queryClient.invalidateQueries(["credentials"]);
    },
  });

  const grid = "grid grid-cols-6";

  if (isError)
    return (
      <section className=' w-full'>
        <AxiosErrorCard error={error} />
      </section>
    );

  return (
    <section className=' w-full'>
      <div className='flex justify-between items-center'>
        <h1 className={"my-3 text-3xl font-medium"}>Connections</h1>
        <AggieButton
          onClick={() => setOpenCreate(true)}
          variant='primary'
          padding='px-3 py-2'
          icon={faPlusCircle}
        >
          Add connection
        </AggieButton>
      </div>
      <p className='text-sm text-slate-500 dark:text-gray-400 mb-3'>
        The logins and API keys your feeds authenticate with. You can add more than
        one for the same provider. The name is just a label to tell them apart, and
        is filled in for you.
      </p>
      <div className='flex flex-col overflow-hidden bg-white dark:bg-gray-800 border border-slate-300 rounded-lg divide-y divide-slate-300'>
        <header
          className={`${grid} px-3 py-3 font-medium text-sm border-b border-slate-300`}
        >
          <p>Provider</p>
          <p>Name</p>
        </header>
        {data ? (
          data.map((credential) => (
            <article
              className={`${grid} px-3 py-3 items-center`}
              key={credential._id}
            >
              <div className='text-sm items-center'>
                <span className='px-2 py-1 rounded bg-slate-200 dark:bg-gray-600 font-medium'>
                  {providerLabel(credential.type)}
                </span>
              </div>
              <p className='col-start-2 -col-end-1 font-medium flex justify-between items-center'>
                {credential.name}
                <AggieButton
                  onClick={() => setDeletionModal(credential)}
                  className='border border-slate-300 bg-slate-100 dark:bg-gray-700 rounded px-2 py-2 hover:bg-slate-200 dark:hover:bg-gray-600 '
                >
                  <FontAwesomeIcon icon={faTrash} />
                </AggieButton>
              </p>
            </article>
          ))
        ) : (
          <article className='grid py-6 font-medium w-full place-items-center'>
            <p className=''>
              <FontAwesomeIcon
                icon={faRefresh}
                className='animate-spin text-slate-600 dark:text-gray-400'
              />{" "}
              Loading
            </p>
          </article>
        )}
        <ConfirmationDialog
          isOpen={!!deletionModal}
          variant='danger'
          disabled={doDeleteCredential.isLoading}
          className='w-full max-w-lg text-center'
          title={`Delete connection: ${
            data?.find((c) => c._id === deletionModal?._id)?.name
          }?`}
          confirmText={"Delete"}
          onClose={() => setDeletionModal(undefined)}
          onConfirm={() =>
            !!deletionModal && doDeleteCredential.mutate(deletionModal)
          }
        ></ConfirmationDialog>
      </div>
      <AggieDialog
        isOpen={openCreate}
        onClose={() => setOpenCreate(false)}
        data={{ title: "Add connection" }}
        className='p-3 w-full max-w-lg'
      >
        <CreateCredentialForm onClose={() => setOpenCreate(false)} />
      </AggieDialog>
    </section>
  );
};

export default CredentialsSection;
