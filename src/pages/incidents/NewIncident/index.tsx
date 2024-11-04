import { useQueryParams } from "../../../hooks/useQueryParams";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { newGroup } from "../../../api/groups";
import { setReportsToGroup } from "../../../api/reports";
import type { Report, Reports } from "../../../api/reports/types";

import { Dialog } from "@headlessui/react";
import SocialMediaPost from "../../../components/SocialMediaPost";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faSpinner,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import CreateEditIncidentForm from "../CreateEditIncidentForm";

interface NewIncidentQueryState {
  reports?: string;
  key?: string;
}

const NewIncident = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reportsData, setReportsData] = useState<Report[]>([]);
  const [showDialog, setShowDialog] = useState(false);

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
        navigate(`/incidents/${data._id}`);
        return;
      }

      doAddReports.mutate({
        reportIds: paramToArray(getParam("reports")),
        groupId: data,
      });
    },
  });

  useEffect(() => {
    const key = getParam("key") || "reports";
    const data = queryClient.getQueryData<Reports>([key]);
    if (!data) return;
    const ids = paramToArray(getParam("reports"));
    const selectedReports = data.results.filter((i) => ids.includes(i._id));
    setReportsData(selectedReports);
  }, [searchParams]);

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
      <div className='px-2 py-1 border border-slate-200 bg-slate-100 rounded-lg flex gap-1 items-center'>
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
          <div className='max-h-[75vh] overflow-y-scroll flex flex-col gap-1'>
            {reportsData &&
              reportsData.map((item) => (
                <SocialMediaPost report={item} key={item._id} />
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
        <div className='fixed inset-0 bg-black/30' aria-hidden='true' />
        <div className='fixed inset-0 flex w-screen items-center justify-center p-4'>
          <Dialog.Panel className='bg-white rounded-xl border border-slate-200 shadow-xl min-w-24 min-h-12 p-4 flex flex-col gap-2'>
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
