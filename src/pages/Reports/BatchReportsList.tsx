import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMultiSelect } from "../../hooks/useMultiSelect";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useReportMutations } from "./useReportMutations";

import { cancelBatch, getBatch, getNewBatch } from "../../api/reports";
import type { Report, ReportQueryState } from "../../api/reports/types";

import AggieButton from "../../components/AggieButton";
import AggieCheck from "../../components/AggieCheck";
import ReportListItem from "./components/ReportListItem";
import MultiSelectActions from "./components/MultiSelectActions";

import { faMinus } from "@fortawesome/free-solid-svg-icons";

interface IProps {}

const BatchReportList = ({}: IProps) => {
  const { id: currentPageId } = useParams();

  const { searchParams, getParam, setParams } =
    useQueryParams<ReportQueryState>();

  const { setRead } = useReportMutations({ key: ["batch"] });
  const navigate = useNavigate();

  const newBatch = useMutation(getNewBatch);
  const cancelCurrentBatch = useMutation(cancelBatch);

  const { data: batchData, refetch: batchRefetch } = useQuery(
    ["batch"],
    getBatch,
    {
      enabled: !!getParam("batch"),
    }
  );

  useEffect(() => {
    if (!batchData || batchData?.results.length === 0) {
      setParams({ batch: undefined });
      return;
    }
    setParams({ batch: true });
  }, [batchData]);
  const multiSelect = useMultiSelect({
    allItems: batchData?.results,
    mapFn: (i) => i._id,
  });

  function onActivateBatchMode() {
    newBatch.mutate(undefined, {
      onSuccess: () => {
        batchRefetch();
      },
    });
  }

  function onCancelBatchMode() {
    cancelCurrentBatch.mutate(undefined, {
      onSuccess: () => {
        setParams({ batch: undefined });
        navigate({ pathname: "/r", search: searchParams.toString() });
      },
    });
  }

  function filteredCount(reports: Report[] | undefined, type: "read" | "") {
    if (!reports) return 0;
    if (type === "read")
      return reports.filter((report) => report.read === true).length || 0;
    return 0;
  }

  function onReportClick(id: string, isRead: boolean) {
    navigate({ pathname: `${id}`, search: searchParams.toString() });
    if (!isRead)
      setRead.mutate({ reportIds: [id], read: true, currentPageId: id });
  }
  // when batch mode not activated
  if (!getParam("batch"))
    return (
      <div className='w-full px-4 py-8 mt-2 rounded-lg border border-slate-300 bg-white flex flex-col items-center'>
        <p className='font-medium mb-1'>
          Get 50 unread reports to look at (assigned individually, each user
          will get a separate batch)
        </p>
        <AggieButton
          className=''
          variant='primary'
          loading={newBatch.isLoading}
          onClick={onActivateBatchMode}
        >
          Assign Me a Batch of Reports
        </AggieButton>
      </div>
    );

  return (
    <>
      <div className='py-2 sticky top-0 z-10 bg-gray-50/75 backdrop-blur-sm'>
        <div className='flex justify-between  mt-1 '>
          <AggieButton
            variant='secondary'
            className='text-xs '
            onClick={() => multiSelect.toggleActive()}
          >
            {multiSelect.isActive ? "Cancel Selection" : "Select Multiple"}
          </AggieButton>

          <div className='flex gap-1 text-xs'>
            <p className='text-sm'>
              {filteredCount(batchData?.results, "read")} read of{" "}
              {batchData?.total}
            </p>
            <AggieButton
              variant='secondary'
              loading={cancelCurrentBatch.isLoading}
              onClick={onCancelBatchMode}
            >
              Cancel Batch
            </AggieButton>
            <AggieButton
              variant='primary'
              loading={newBatch.isLoading}
              onClick={onActivateBatchMode}
            >
              Grab New Batch
            </AggieButton>
          </div>
        </div>
        <div className='px-1 flex gap-2 text-xs font-medium items-center pb-1'>
          {multiSelect.isActive && (
            <>
              <AggieCheck
                active={multiSelect.any()}
                icon={!multiSelect.all() ? faMinus : undefined}
                onClick={() => multiSelect.addRemoveAll(batchData?.results)}
              />
              <p>
                Mark {multiSelect.selection.length} report{"(s)"} as:
              </p>
              <MultiSelectActions
                queryKey={["batch"]}
                selection={multiSelect.selection}
                disabled={!multiSelect.any()}
                addRemoveSelection={multiSelect.addRemove}
                currentPageId={currentPageId}
              />
            </>
          )}
        </div>
      </div>
      <div className='flex flex-col border border-slate-200 rounded-lg bg-white'>
        {batchData &&
          batchData.results.map((report) => (
            <div
              onClick={() => onReportClick(report._id, report.read)}
              className='cursor-pointer group focus-theme'
              key={report._id}
              tabIndex={0}
              role='button'
            >
              <ReportListItem
                report={report}
                isChecked={multiSelect.exists(report)}
                isSelectMode={multiSelect.isActive}
                onCheckChange={() => multiSelect.addRemove(report)}
              />
            </div>
          ))}
      </div>
      <div className='flex gap-1 justify-center w-full mt-3 mb-8'>
        <AggieButton
          className='text-sm'
          variant='secondary'
          loading={cancelCurrentBatch.isLoading}
          onClick={onCancelBatchMode}
        >
          Cancel Batch
        </AggieButton>
        <AggieButton
          className='text-sm'
          variant='primary'
          loading={newBatch.isLoading}
          onClick={onActivateBatchMode}
        >
          Grab New Batch
        </AggieButton>
      </div>
    </>
  );
};

export default BatchReportList;
