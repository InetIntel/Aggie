import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMultiSelect } from "../../hooks/useMultiSelect";
import { useQueryParams } from "../../hooks/useQueryParams";

import { formatPageCount } from "../../utils/format";
import { getReports } from "../../api/reports";
import type { ReportQueryState } from "../../api/reports/types";

import ReportListItem from "./components/ReportListItem";
import ReportsFilters from "./components/ReportsFilters";
import Pagination from "../../components/Pagination";
import AggieCheck from "../../components/AggieCheck";
import AggieButton from "../../components/AggieButton";

import { faMinus } from "@fortawesome/free-solid-svg-icons";
import MultiSelectActions from "./components/MultiSelectActions";
import { report } from "process";
import AddReportsToIncidents from "./components/AddReportsToIncident";

interface IProps {}

const AllReportsList = ({}: IProps) => {
  const { id: currentPageId } = useParams();
  const navigate = useNavigate();
  const { searchParams, getAllParams, setParams, getParam } =
    useQueryParams<ReportQueryState>();

  const reportsQuery = useQuery(
    ["reports"],
    () => getReports(getAllParams(searchParams)),
    {
      refetchInterval: 120000,
    }
  );
  useEffect(() => {
    // refetch on filter change
    multiSelect.set([]);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [searchParams]);

  // useEffect(() => {
  //   if (reportsStatus === "success") {
  //     window.scrollTo(0, 0);
  //   }
  // }, [reportsStatus]);

  const multiSelect = useMultiSelect({
    allItems: reportsQuery.data?.results,
    mapFn: (i) => i._id,
  });

  function onReportItemClick(id: string, isRead: boolean) {
    navigate({ pathname: `${id}`, search: searchParams.toString() });
  }

  return (
    <>
      <div className='px-1 py-2 bg-gray-50/75 backdrop-blur-sm sticky top-0 z-10 '>
        <ReportsFilters
          reportCount={reportsQuery.data && reportsQuery.data.total}
          headerElement={
            multiSelect.isActive ? (
              <AggieButton
                variant='secondary'
                className='text-xs font-medium '
                onClick={() => multiSelect.toggleActive()}
              >
                Cancel Selection
              </AggieButton>
            ) : (
              <AggieCheck
                active={multiSelect.isActive}
                onClick={() => {
                  multiSelect.toggleActive();
                  multiSelect.addRemoveAll(reportsQuery.data?.results);
                }}
              />
            )
          }
        />
        <div
          className={`px-1 flex gap-2 text-xs font-medium items-center ${
            multiSelect.isActive ? "mt-2" : ""
          }`}
        >
          {multiSelect.isActive && (
            <>
              <AggieCheck
                active={multiSelect.any()}
                icon={!multiSelect.all() ? faMinus : undefined}
                onClick={() =>
                  multiSelect.addRemoveAll(reportsQuery.data?.results)
                }
              />
              <p>
                Mark {multiSelect.selection.length} report{"(s)"} as:
              </p>
              <MultiSelectActions
                queryKey={["reports"]}
                selection={multiSelect.selection}
                disabled={!multiSelect.any()}
                currentPageId={currentPageId}
                addRemoveSelection={multiSelect.addRemove}
              />
            </>
          )}
        </div>
      </div>

      <div className='flex flex-col border border-slate-300 rounded-lg bg-white'>
        {!!reportsQuery.data?.results && reportsQuery.data?.total > 0 ? (
          reportsQuery.data?.results.map((report) => (
            <div
              onClick={() => onReportItemClick(report._id, report.read)}
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
          ))
        ) : (
          <div className='w-full bg-white py-12 grid place-items-center font-medium'>
            <p>
              {reportsQuery.isLoading ? "Loading data..." : "No Results Found"}
            </p>
          </div>
        )}
      </div>
      <div className='flex flex-col items-center justify-center mt-3 mb-40 w-full'>
        <div className='w-fit text-sm'>
          <Pagination
            currentPage={Number(getParam("page")) || 0}
            totalCount={reportsQuery.data?.total || 0}
            onPageChange={(num) => setParams({ page: num })}
            size={4}
          />
        </div>
        <small className={"text-center font-medium w-full mt-2"}>
          {formatPageCount(
            Number(getParam("page")),
            50,
            reportsQuery.data?.total
          )}
        </small>
      </div>
    </>
  );
};

export default AllReportsList;
