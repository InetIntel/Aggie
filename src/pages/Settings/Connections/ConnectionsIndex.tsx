import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSources } from "../../../api/sources";
import { getCredentials } from "../../../api/credentials";
import { getSession } from "../../../api/session";
import {
  CREDENTIAL_OPTIONS,
  ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER,
} from "../../../api/common";

import AxiosErrorCard from "../../../components/AxiosErrorCard";
import AggieSwitch from "../../../components/AggieSwitch";
import Configuration from "../Configuration";
import ApiTypeSection from "./ApiTypeSection";

const MULTI_CONNECTION_STORAGE_KEY = "feeds:allowMultipleConnections";

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

  // Allow more than one connection per provider. Seeded from the code default,
  // then persisted per-browser so the choice survives reloads.
  const [allowMultipleConnections, setAllowMultipleConnections] =
    useState<boolean>(() => {
      const stored = localStorage.getItem(MULTI_CONNECTION_STORAGE_KEY);
      return stored === null
        ? ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER
        : stored === "true";
    });
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
      <h1 className='font-medium text-3xl mb-1'>Feeds</h1>
      <p className='text-sm text-slate-500 dark:text-gray-400 mb-4 max-w-3xl'>
        Feeds collect posts, alerts, and signals into the Alerts page. Each feed
        runs through a Connection (the login or API key for its provider).
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
          allowMultipleConnections={allowMultipleConnections}
        />
      ))}

      {isManager && (
        <label className='flex items-center gap-3 mt-8 pt-4 border-t border-slate-200 dark:border-gray-700 text-sm'>
          <AggieSwitch
            checked={allowMultipleConnections}
            onChange={() => setAllowMultipleConnections((prev) => !prev)}
            label='Allow multiple connections per provider'
          />
          <span>
            Allow multiple connections per provider
            <span className='block text-xs text-slate-500 dark:text-gray-400'>
              When off, each provider is limited to a single connection.
            </span>
          </span>
        </label>
      )}
    </div>
  );
};

export default ConnectionsIndex;
