import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryParamsInternal } from "../../../hooks/useQueryParamsInternal";
import { useUpdateQueryData } from "../../../hooks/useUpdateQueryData";

import { getGroups } from "../../../api/groups";
import { setReportsToGroup } from "../../../api/reports";
import type { Group, GroupQueryState } from "../../../api/groups/types";
import type { Report, Reports } from "../../../api/reports/types";
import { updateByIds } from "../../../utils/immutable";

import { Dialog } from "@headlessui/react";
import AggieButton from "../../../components/AggieButton";

import SocialMediaPost from "../../../components/SocialMediaPost";

import NestedIncidentsList from "./NestedIncidentsList";
import IncidentsFilters from "../../incidents/IncidentsFilters";
import SocialMediaListItem from "../../../components/SocialMediaListItem";
import AggieCheck from "../../../components/AggieCheck";
import {
  faFileCirclePlus,
  faFileEdit,
  faMinus,
  faMinusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { Link, useNavigate } from "react-router-dom";

interface IAddReportsToIncidents {
  isOpen: boolean;
  selection?: Report[];
  queryKey: any[];
  onSuccess?: () => void;
  onClose: () => void;
  addRemove: (r: Report) => void;
}
const AddReportsToIncidents = ({
  isOpen,
  selection,
  queryKey,
  onClose,
  onSuccess,
  addRemove,
}: IAddReportsToIncidents) => {
  const [selectedIncident, setSelectedIncident] = useState<Group>();
  const queryClient = useQueryClient();
  const queryData = useUpdateQueryData();
  const navigate = useNavigate();
  const {
    searchParams,
    query,
    getAllParams,
    getParam,
    setParams,
    clearAllParams,
  } = useQueryParamsInternal<GroupQueryState>();

  const { data: incidents, refetch } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(getAllParams()),
    enabled: isOpen && !!selection,
    staleTime: 10000,
  });

  useEffect(() => {
    if (!isOpen || !selection) return;
    refetch();
  }, [query]);

  const doAddReportToIncident = useMutation({
    mutationFn: setReportsToGroup,
    onSuccess: (_, params) => {
      onClose();
      // update reports list
      queryData.update<Reports>(queryKey, (previousData) => {
        const updateData = updateByIds(params.reportIds, previousData.results, {
          _group: params.groupId?._id,
        });
        return {
          results: updateData,
        };
      });
      if (!!onSuccess) onSuccess();
    },
  });

  function onAddIncident(item: Group) {
    if (!selection || selection.length === 0 || !item) return;
    doAddReportToIncident.mutate({
      reportIds: selection.map((i) => i._id),
      groupId: item,
    });
  }

  function onNewIncidentFromReports() {
    if (!selection || selection.length === 0) return;

    const params = new URLSearchParams({
      reports: selection.map((i) => i._id).join(":"),
    });
    if (queryKey.includes("batch")) params.append("key", "batch");
    console.log(queryKey);
    navigate({ pathname: "/incidents/new", search: params.toString() });
  }

  if (!isOpen) return <></>;
  return (
    <Dialog open={isOpen} onClose={onClose} className='relative z-50'>
      <div className='fixed inset-0 bg-black/30' aria-hidden='true' />
      <div className='fixed inset-0 flex w-screen items-center justify-center p-4'>
        <Dialog.Panel className='bg-gray-50 rounded-xl border border-slate-200 shadow-xl min-w-24 h-[90vh] min-h-12 p-3 grid grid-cols-4 gap-y-1 gap-x-4 w-full	grid-rows-[auto_1fr]'>
          <div className='col-span-full flex justify-between '>
            <div className='flex-1'>
              <AggieButton variant='secondary' onClick={onClose}>
                Cancel
              </AggieButton>
            </div>

            <p className='font-medium text-lg'>Select an Incident Below:</p>
            <div className='flex-1 flex justify-end gap-1'>
              {/*<AggieButton
                variant='secondary'
                icon={faFileCirclePlus}
                onClick={onNewIncidentFromReports}
                className='hover:bg-slate-50 hover:underline text-blue-600 text-sm'
              >
                Create New Incident
              </AggieButton>
              <AggieButton
                variant='primary'
                onClick={onAddIncident}
                loading={doAddReportToIncident.isLoading}
                disabled={doAddReportToIncident.isLoading || !selectedIncident}
              >
                Add {selection ? `${selection.length}` : ""} report(s) to
                incident
              </AggieButton>
              */}
            </div>
          </div>

          <div className='overflow-y-auto flex flex-col gap-1 h-full col-span-1 border-2 border-dashed border-slate-300 bg-slate-50 rounded-lg p-3'>
            <h2 className='font-medium text-lg mb-1'>
              <span className='bg-slate-100 rounded-lg px-2 py-1  text-slate-700'>
                {selection?.length || 0}
              </span>{" "}
              Selected Reports
            </h2>
            <div className='rounded-lg border overflow-x-hidden border-slate-300 overflow-y-auto'>
              {selection &&
                selection.map((report) => (
                  <div className='bg-white hover:bg-slate-100 border-b border-slate-300 group p-3 relative text-sm'>
                    <SocialMediaListItem
                      report={report}
                      header={
                        <span className='flex gap-1 group-hover:opacity-100 opacity-0'>
                          <AggieButton
                            variant='light:rose'
                            className='rounded-lg text-xs border border-slate-300 '
                            icon={faMinusCircle}
                            onClick={() => addRemove(report)}
                          >
                            Remove
                          </AggieButton>
                        </span>
                      }
                    />
                  </div>
                ))}
            </div>
          </div>

          <div className='flex flex-col h-full overflow-y-auto col-span-3 overflow-x-hidden w-full'>
            <IncidentsFilters
              get={getParam}
              set={setParams}
              isQuery={!!searchParams.size}
              clearAll={clearAllParams}
              totalCount={incidents && incidents.total}
            />
            <div className='overflow-y-auto bg-white border border-slate-300 rounded-lg'>
            <AggieButton
              className='hover:bg-green-100 border-b border-slate-200 font-medium gap-2 h-16 items-center text-left w-full'
              icon={faFileCirclePlus}
              padding='px-2 py-2'
              onClick={onNewIncidentFromReports}
            >
              Create new incident
            </AggieButton>
              <NestedIncidentsList
                incidents={incidents}
                selectedIncident={selectedIncident}
                onIncidentClicked={(item) => {
                  setSelectedIncident(item);
                  onAddIncident(item);
                }}
              />
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default AddReportsToIncidents;
