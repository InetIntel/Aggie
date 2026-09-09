import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSources } from "../../../api/sources";
import { getCredentials } from "../../../api/credentials";
import { getSession } from "../../../api/session";
import {
  CREDENTIAL_OPTIONS,
  MULTI_CONNECTION_STORAGE_KEY,
  getAllowMultipleConnections,
} from "../../../api/common";

import AxiosErrorCard from "../../../components/AxiosErrorCard";
import AggieSwitch from "../../../components/AggieSwitch";
import Configuration from "../Configuration";
import ApiTypeSection from "./ApiTypeSection";

// Consolidated connections page: one section per API type, each co-locating that
// type's credentials and sources (grouped by `credential.type` / `source.media`).
const ConnectionsIndex = () => {
  useEffect(() => {
    document.title = "Providers and Feeds - Aggie";
  }, []);

  const {
    data: sources,
    isError: sourcesError,
    error: sourcesErr,
  } = useQuery(["sources"], getSources);
  const { data: credentials } = useQuery(["credentials"], getCredentials);
  const { data: session } = useQuery(["session"], getSession);

  const canManageConnections =
    session?.permissions?.includes("change settings") === true;
  const canManageSources =
    session?.permissions?.includes("manage sources") === true;

  // Allow more than one connection per provider. Seeded from the code default,
  // then persisted per-browser so the choice survives reloads.
  const [allowMultipleConnections, setAllowMultipleConnections] =
    useState<boolean>(getAllowMultipleConnections);
  useEffect(() => {
    localStorage.setItem(
      MULTI_CONNECTION_STORAGE_KEY,
      String(allowMultipleConnections)
    );
  }, [allowMultipleConnections]);

  if (sourcesError)
    return (
      <div className='mt-4'>
        <AxiosErrorCard error={sourcesErr} />
      </div>
    );

  return (
    <div className='mt-3 pb-16'>
      <h1 className='font-medium text-3xl mb-1'>Providers and Feeds</h1>
      <p className='text-sm text-slate-500 dark:text-gray-400 mb-4 max-w-3xl'>
        A <span className='font-medium'>Provider</span> is a platform Aggie pulls
        from, like Mastodon or IODA. A{" "}
        <span className='font-medium'>Connection</span> is the login or API key
        that lets Aggie reach a Provider. A{" "}
        <span className='font-medium'>Feed</span> then runs on top of a Connection
        to collect the posts and signals you care about, which show up as Alerts.
        Connect a Provider first, then add Feeds to it.
      </p>
      {canManageConnections && (
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
          canManageConnections={canManageConnections}
          canManageSources={canManageSources}
          allowMultipleConnections={allowMultipleConnections}
        />
      ))}

      {canManageConnections && (
        <label className='flex items-center gap-3 mt-8 pt-4 border-t border-slate-200 dark:border-gray-700 text-sm'>
          <AggieSwitch
            checked={allowMultipleConnections}
            onChange={() => setAllowMultipleConnections((prev) => !prev)}
            label='Allow multiple connections per Provider'
          />
          <span>
            Allow multiple connections per Provider
            <span className='block text-xs text-slate-500 dark:text-gray-400'>
              When off, each Provider is limited to a single connection.
            </span>
          </span>
        </label>
      )}
    </div>
  );
};

export default ConnectionsIndex;
