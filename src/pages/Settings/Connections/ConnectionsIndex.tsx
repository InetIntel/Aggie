import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSources } from "../../../api/sources";
import { getCredentials } from "../../../api/credentials";
import { getSession } from "../../../api/session";
import { CREDENTIAL_OPTIONS } from "../../../api/common";

import AxiosErrorCard from "../../../components/AxiosErrorCard";
import Configuration from "../Configuration";
import ApiTypeSection from "./ApiTypeSection";

// Consolidated connections page: one section per API type, each co-locating that
// type's credentials and sources (grouped by `credential.type` / `source.media`).
const ConnectionsIndex = () => {
  useEffect(() => {
    document.title = "Feeds - Aggie";
  }, []);

  const {
    data: sources,
    isError: sourcesError,
    error: sourcesErr,
  } = useQuery(["sources"], getSources);
  const { data: credentials } = useQuery(["credentials"], getCredentials);
  const { data: session } = useQuery(["session"], getSession);

  const isManager =
    session?.role === "admin" || session?.role === "team_lead";

  if (sourcesError)
    return (
      <div className='mt-4'>
        <AxiosErrorCard error={sourcesErr} />
      </div>
    );

  return (
    <div className='mt-3'>
      <h1 className='font-medium text-3xl mb-1'>Feeds</h1>
      <p className='text-sm text-slate-500 dark:text-gray-400 mb-4 max-w-3xl'>
        Feeds collect posts, alerts, and signals into Reports. Each feed runs
        through a Connection &mdash; the login or API key for its provider.
        Connect a provider first, then add feeds to it.
      </p>
      {isManager && (
        <div className='mb-6'>
          <Configuration />
        </div>
      )}

      {CREDENTIAL_OPTIONS.map((type) => (
        <ApiTypeSection
          key={type}
          type={type}
          sources={sources ?? []}
          credentials={credentials ?? []}
          isManager={isManager}
        />
      ))}
    </div>
  );
};

export default ConnectionsIndex;
