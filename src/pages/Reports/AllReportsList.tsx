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

import { faMinus, faSpinner } from "@fortawesome/free-solid-svg-icons";
import MultiSelectActions from "./components/MultiSelectActions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps { alerts: boolean }

const AllReportsList = ({ alerts }: IProps) => {
  const { id: currentPageId } = useParams();
  const navigate = useNavigate();
  const { searchParams, getAllParams, setParams, getParam } =
    useQueryParams<ReportQueryState>();

  const {
    data: rawReports,
    refetch,
    isLoading,
    isFetching,
  } = useQuery(["reports"], () => getReports(getAllParams(searchParams)), {
    refetchInterval: 120000,
  });
  const reports = rawReports && {...rawReports, results: (rawReports.results.filter(
    obj => (
      obj.metadata
      && (
        alerts
        ? !obj.metadata.hasOwnProperty("junkipediaId")
        : obj.metadata.hasOwnProperty("junkipediaId")
      )
    )
  ))};
  useEffect(() => {
    // refetch on filter change
    multiSelect.set([]);
    // apparanty not the way its supposed to be done but i cant do it another way
    refetch();
    document.getElementById("main_view")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [searchParams]);

  const multiSelect = useMultiSelect({
    allItems: reports?.results,
    mapFn: (i) => i._id,
  });

  function onReportItemClick(id: string) {
    navigate({ pathname: `${id}`, search: searchParams.toString() });
  }

  return (
    <>
      <div className='px-1 py-2 bg-gray-50/75 backdrop-blur-sm sticky top-0 z-10 '>
        <ReportsFilters
          reportCount={reports && reports.total}
          isFetching={isFetching}
          refetch={refetch}
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
                  multiSelect.addRemoveAll(reports?.results);
                }}
              />
            )
          }
        />
        <div
          className={`px-1 flex gap-2 text-xs font-medium items-center ${multiSelect.isActive ? "mt-2" : ""
            }`}
        >
          {multiSelect.isActive && (
            <>
              <AggieCheck
                active={multiSelect.any()}
                icon={!multiSelect.all() ? faMinus : undefined}
                onClick={() => multiSelect.addRemoveAll(reports?.results)}
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
        {!!reports?.results && reports?.total > 0 ? (
          reports?.results.map((report) => (
            <div
              onClick={() => onReportItemClick(report._id)}
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
              {isLoading ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className='animate-spin' />{" "}
                  Loading data...
                </>
              ) : (
                "No Results Found"
              )}
            </p>
          </div>
        )}
      </div>
      <div className='flex flex-col items-center justify-center mt-3 mb-40 w-full'>
        <div className='w-fit text-sm'>
          <Pagination
            currentPage={Number(getParam("page")) || 0}
            totalCount={reports?.total || 0}
            onPageChange={(num) => setParams({ page: num })}
            size={4}
          />
        </div>
        <small className={"text-center font-medium w-full mt-2"}>
          {formatPageCount(Number(getParam("page")), 50, reports?.total)}
        </small>
      </div>
    </>
  );
};

export default AllReportsList;
