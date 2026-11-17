import { useQueryParams } from "../../../hooks/useQueryParams";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { newGroup } from "../../../api/groups";
import { getReport, setReportsToGroup } from "../../../api/reports";
import type { Report, Reports } from "../../../api/reports/types";

import { Dialog } from "@headlessui/react";
import SocialMediaListItem from "../../../components/SocialMediaListItem";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faSpinner,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import CreateEditIncidentForm from "../CreateEditIncidentForm";



const NewIncident = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);


  interface NewIncidentQueryState {
    reports?: string;
  }
  const { searchParams, getParam } = useQueryParams<NewIncidentQueryState>();

  const doCreateNewGroup = useMutation({
    mutationFn: newGroup,
    onMutate: () => {
      setShowDialog(true);
    },
    onSuccess: (data) => {
      if (!data) {
        navigate(-1);
        return;
      }
      if (!getParam("reports")) {
        navigate(`/incidents/${data._id}`, { replace: true });
        return;
      }

      doAddReports.mutate({
        reportIds: paramToArray(getParam("reports")),
        groupId: data,
      });
    },
  });

  useEffect(() => {
    document.title = "New Incident - Aggie";
  }, []);

  const reportIds = useMemo(
    () => paramToArray(getParam("reports")).filter(Boolean),
    [searchParams]
  );

  // Callers cache their lists under different keys (e.g. alerts live under
  // ["reports", "alerts", params]), so scan the whole cache for the selected
  // reports and only fetch the ones that aren't there (e.g. after a reload).
  const { data: reportsData = [] } = useQuery(
    ["new-incident-reports", reportIds],
    async () => {
      const found = findCachedReports(reportIds);
      const missing = reportIds.filter((id) => !found.has(id));
      const fetched = await Promise.all(missing.map((id) => getReport(id)));
      fetched.forEach((report) => report && found.set(report._id, report));
      return reportIds
        .map((id) => found.get(id))
        .filter((report): report is Report => !!report);
    },
    { enabled: reportIds.length > 0, staleTime: Infinity }
  );

  function findCachedReports(ids: string[]) {
    const found = new Map<string, Report>();
    queryClient
      .getQueryCache()
      .getAll()
      .forEach(({ state }) => {
        const data = state.data as Reports | Report | undefined;
        if (!data || typeof data !== "object") return;
        const items = "results" in data ? data.results : [data];
        if (!Array.isArray(items)) return;
        items.forEach((item) => {
          if (item?._id && ids.includes(item._id) && !found.has(item._id))
            found.set(item._id, item);
        });
      });
    return found;
  }

  const doAddReports = useMutation({
    mutationFn: setReportsToGroup,
    onSuccess: () => {
      navigate(-1);
    },
  });

  function paramToArray(value: string) {
    return value.split(":");
  }

  type statusEnum = "error" | "idle" | "loading" | "success";
  function mutationIndicator(
    status: statusEnum,
    data: { [key in statusEnum]?: string }
  ) {
    const defaultWarnings = {
      error: "error",
      idle: "",
      loading: "loading",
      success: "success",
    };
    if (status === "idle")
      return <div className='px-2 py-1 opacity-0'>idle</div>;
    return (
      <div className='px-2 py-1 border border-slate-200 bg-slate-100 dark:bg-gray-700 rounded-lg flex gap-1 items-center'>
        {status === "loading" && (
          <FontAwesomeIcon icon={faSpinner} className='animate-spin' />
        )}
        {status === "success" && <FontAwesomeIcon icon={faCheck} />}
        {status === "error" && <FontAwesomeIcon icon={faWarning} />}
        {{ ...defaultWarnings, ...data }[status]}
      </div>
    );
  }

  return (
    <section className='max-w-screen-xl mx-auto px-4 pb-10 grid grid-cols-2 gap-4'>
      <header className='mt-2 flex justify-between items-center col-span-2'>
        <h1 className='text-3xl font-medium'>Create New Incident</h1>
      </header>
      <div>
        <CreateEditIncidentForm
          onSubmit={(values) => doCreateNewGroup.mutate(values)}
          onCancel={() => navigate(-1)}
          isLoading={doCreateNewGroup.isLoading}
        />
      </div>
      {getParam("reports") && (
        <div className='flex flex-col gap-2'>
          <h2 className='font-medium text-lg'>
            ({reportsData.length}) Reports to Attach:
          </h2>
          <div className='max-h-[75vh] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-300'>
            {reportsData.map((item) => (
              <div
                key={item._id}
                className='bg-white dark:bg-gray-800 border-b last:border-b-0 border-slate-300 p-3 text-sm'
              >
                <SocialMediaListItem report={item} />
              </div>
            ))}
          </div>
        </div>
      )}
      <Dialog
        open={showDialog}
        onClose={() => {
          return undefined;
        }}
        className='relative z-50'
      >
        <div className='fixed inset-0 bg-black/30 dark:bg-white/20' aria-hidden='true' />
        <div className='fixed inset-0 flex w-screen items-center justify-center p-4'>
          <Dialog.Panel className='bg-white dark:bg-gray-800 rounded-xl border border-slate-200 shadow-xl min-w-24 min-h-12 p-4 flex flex-col gap-2'>
            <p>Creating incident... Please don't close the page!</p>
            {mutationIndicator(doCreateNewGroup.status, {
              loading: "creating Incident...",
              success: "Incident created!",
            })}

            {searchParams.size > 0 &&
              mutationIndicator(doAddReports.status, {
                loading: "adding Reports...",
                success: "Reports Added!",
              })}
          </Dialog.Panel>
        </div>
      </Dialog>
    </section>
  );
};

export default NewIncident;
