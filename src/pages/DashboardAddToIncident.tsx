import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@headlessui/react";

import { updateNotableActivityIncident } from "../api/analytics";
import type { NotableActivity } from "../api/analytics/types";
import { getGroups } from "../api/groups";
import type { Group, GroupQueryState } from "../api/groups/types";
import { useQueryParamsInternal } from "../hooks/useQueryParamsInternal";

import AggieButton from "../components/AggieButton";
import IncidentsFilters from "./incidents/IncidentsFilters";
import NestedIncidentsList from "./Reports/components/NestedIncidentsList";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faWarning } from "@fortawesome/free-solid-svg-icons";

interface IProps {
  isOpen: boolean;
  /** notable activity whose reports get attached to the picked incident */
  activity: NotableActivity | null;
  /** cacheKey of the notable activities response the activity came from */
  cacheKey: string;
  windowLabel: string;
  locationLabel: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Attaches every report of a dashboard notable activity card to an existing
 * incident. Mirrors the reports list "Add to Incident" flow, but goes through
 * the analytics endpoint so the notable activity snapshot gets linked too.
 */
const DashboardAddToIncident = ({
  isOpen,
  activity,
  cacheKey,
  windowLabel,
  locationLabel,
  onClose,
  onSuccess,
}: IProps) => {
  const queryClient = useQueryClient();
  const { searchParams, query, getAllParams, getParam, setParams, clearAllParams } =
    useQueryParamsInternal<GroupQueryState>();

  const { data: incidents } = useQuery({
    queryKey: ["groups", "notable-activity-picker", query],
    queryFn: () => getGroups(getAllParams()),
    enabled: isOpen && !!activity,
    keepPreviousData: true,
    staleTime: 10000,
  });

  const addToIncident = useMutation({
    mutationFn: updateNotableActivityIncident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      onClose();
      if (onSuccess) onSuccess();
    },
  });

  function onIncidentClicked(incident: Group) {
    if (!activity || !cacheKey || addToIncident.isLoading) return;

    addToIncident.mutate({
      cacheKey,
      eventAggKey: activity.eventAggKey,
      mode: "add",
      groupId: incident._id,
    });
  }

  if (!isOpen || !activity) return <></>;
  return (
    <Dialog
      open
      onClose={() => {
        if (!addToIncident.isLoading) onClose();
      }}
      className='relative z-50'
    >
      <div className='fixed inset-0 bg-black/30 dark:bg-white/20' aria-hidden='true' />
      <div className='fixed inset-0 flex w-screen items-center justify-center p-4'>
        <Dialog.Panel className='bg-gray-50 dark:bg-gray-800 rounded-xl border border-slate-200 shadow-xl min-w-24 h-[90vh] min-h-12 p-3 grid grid-cols-4 gap-y-1 gap-x-4 w-full grid-rows-[auto_1fr]'>
          <div className='col-span-full flex items-center justify-center'>
            <AggieButton
              variant='secondary'
              onClick={onClose}
              disabled={addToIncident.isLoading}
              className='absolute left-7'
            >
              Cancel
            </AggieButton>

            <p className='font-medium text-xl'>Select an Incident Below:</p>
          </div>

          <div className='overflow-y-auto flex flex-col gap-3 h-full col-span-1 border-2 border-dashed border-slate-300 bg-slate-50 dark:bg-gray-900 rounded-lg p-3'>
            <h2 className='font-medium text-lg'>
              <span className='bg-slate-100 dark:bg-gray-700 rounded-lg px-2 py-1 text-slate-700 dark:text-gray-300'>
                {activity.totalReports}
              </span>{" "}
              Report{activity.totalReports === 1 ? "" : "s"} from this activity
            </h2>
            <div className='rounded-lg border border-slate-300 bg-white dark:bg-gray-800 p-3 text-sm'>
              <p className='font-medium text-slate-900 dark:text-white'>{windowLabel}</p>
              <p className='mt-1 italic text-slate-600 dark:text-gray-400'>
                {locationLabel || "Location details unavailable"}
              </p>
              <div className='mt-3 flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-gray-400'>
                <span>{activity.sourceCnt} sources</span>
                <span>{activity.signalCnt} signals</span>
              </div>
            </div>
            <p className='text-xs text-slate-500 dark:text-gray-400'>
              Every report in this card is added to the incident you pick, and the card
              gets linked to it.
            </p>
            {addToIncident.isError && (
              <p className='flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700'>
                <FontAwesomeIcon icon={faWarning} className='mt-0.5' />
                <span>Could not add these reports to the incident. Please try again.</span>
              </p>
            )}
          </div>

          <div className='flex flex-col h-full overflow-y-auto col-span-3 overflow-x-hidden w-full'>
            <IncidentsFilters
              get={getParam}
              set={setParams}
              isQuery={!!searchParams.size}
              clearAll={clearAllParams}
              totalCount={incidents && incidents.total}
            />
            <div className='relative overflow-y-auto bg-white dark:bg-gray-800 border border-slate-300 rounded-lg'>
              {addToIncident.isLoading && (
                <div className='absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/70 dark:bg-gray-800/70 font-medium'>
                  <FontAwesomeIcon icon={faSpinner} className='animate-spin' />
                  Adding reports to incident
                </div>
              )}
              <NestedIncidentsList
                incidents={incidents}
                onIncidentClicked={onIncidentClicked}
              />
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default DashboardAddToIncident;
