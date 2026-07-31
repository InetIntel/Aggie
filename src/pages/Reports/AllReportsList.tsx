import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import _ from "lodash";
import { useMultiSelect } from "../../hooks/useMultiSelect";
import { useQueryParams } from "../../hooks/useQueryParams";

import { formatPageCount } from "../../utils/format";
import { getReports, getReport } from "../../api/reports";
import type { Report, ReportQueryState } from "../../api/reports/types";
import { ALERT_MEDIA_OPTIONS, SOCIAL_MEDIA_OPTIONS } from "../../api/common";

import ReportListItem from "./components/ReportListItem";
import ReportsFilters from "./components/ReportsFilters";
import ReportsTable from "./TableView/ReportsTable";
import ReportsCompareModal from "./TableView/ReportsCompareModal";
import Pagination from "../../components/Pagination";
import AggieCheck from "../../components/AggieCheck";
import AggieButton from "../../components/AggieButton";
import CompareIcon from "../../components/icons/CompareIcon";
import CompareActionBar from "../../components/CompareModal/CompareActionBar";

import {
  faList,
  faMinus,
  faRefresh,
  faSpinner,
  faSquareCheck,
  faTable,
} from "@fortawesome/free-solid-svg-icons";
import MultiSelectActions from "./components/MultiSelectActions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps { alerts: boolean }

type ReportsViewMode = "list" | "table";
type ReportsQueryStateWithView = ReportQueryState & { view?: ReportsViewMode };

const VIEW_STORAGE_KEY = "alerts:view";
// Max alerts that can be compared side-by-side at once (3×2 grid in the design).
const MAX_COMPARE = 6;

const AllReportsList = ({ alerts }: IProps) => {
  const { id: currentPageId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { searchParams, getAllParams, setParams, getParam } =
    useQueryParams<ReportsQueryStateWithView>();

  // Table view is alerts-only; social posts keep the list.
  const urlView = getParam("view");
  const view: ReportsViewMode =
    !alerts
      ? "list"
      : urlView === "table" || urlView === "list"
      ? urlView
      : localStorage.getItem(VIEW_STORAGE_KEY) === "table"
      ? "table"
      : "list";

  const platformOptions: string[] = [
    ...(alerts ? ALERT_MEDIA_OPTIONS : SOCIAL_MEDIA_OPTIONS),
  ];
  const currentMedia = getParam("media");
  const entityLevelParam = getParam("entityLevel");
  const dataSourcesParam = getParam("dataSources");
  const hideDuplicateASNsParam = getParam("hideDuplicateASNs");
  const shouldClearMedia = !!currentMedia && !platformOptions.includes(currentMedia);
  const shouldResetSocialFilters =
    !alerts &&
    (shouldClearMedia ||
      !!entityLevelParam ||
      !!dataSourcesParam ||
      !!hideDuplicateASNsParam);
  // `view` is a UI-only param: keep it out of the query key (so toggling
  // doesn't refetch) and out of the request to the API.
  const apiSearchParams = new URLSearchParams(searchParams);
  apiSearchParams.delete("view");
  const reportsQueryKey = [
    "reports",
    alerts ? "alerts" : "mediaposts",
    apiSearchParams.toString(),
  ];

  const {
    data: reports,
    refetch,
    isLoading,
    isFetching,
  } = useQuery(
    reportsQueryKey,
    () =>
      getReports(
        _.omit(getAllParams(apiSearchParams), "view") as ReportQueryState,
        alerts,
      ),
    {
      refetchInterval: 120000,
      enabled: !shouldResetSocialFilters,
    },
  );
  useEffect(() => {
    document.title = alerts ? "Alerts - Aggie" : "Social Media Posts - Aggie";
    multiSelect.set([]);
    setCompareMode(false);
    setCompareOpen(false);
    document.getElementById("main_view")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [alerts, searchParams]);

  const multiSelect = useMultiSelect({
    allItems: reports?.results,
    mapFn: (i) => i._id,
  });

  // Compare mode reuses the table's multi-select to pick up to MAX_COMPARE
  // alerts, then opens a side-by-side comparison modal.
  const [compareMode, setCompareMode] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  function toggleCompareMode() {
    const next = !compareMode;
    setCompareMode(next);
    multiSelect.set([]);
    multiSelect.setActive(next);
    if (!next) setCompareOpen(false);
  }

  // Reset compare mode + selection whenever the view (list/table) changes so
  // checkboxes and the compare set never leak from the table into the list.
  useEffect(() => {
    setCompareMode(false);
    setCompareOpen(false);
    multiSelect.set([]);
    multiSelect.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Warm the per-report chart image so the compare modal renders it immediately.
  // The dedup list endpoint strips metadata.rawAPIResponse.image (see report.js),
  // so cards would otherwise lazily fetch N charts at once when the modal opens;
  // prefetching as each row is selected spreads those fetches out ahead of time.
  function prefetchChart(report: Report) {
    if (report?.metadata?.rawAPIResponse?.image) return;
    queryClient.prefetchQuery(
      ["report", report._id, "chart-image"],
      () => getReport(report._id),
      { staleTime: 5 * 60 * 1000 }
    );
  }

  // Compare-mode selection toggle shared by the table rows and the list rows:
  // enforce the MAX_COMPARE cap (allow deselect) and warm the chart image on add
  // so the compare modal renders it immediately.
  function toggleReportForCompare(report: Report) {
    if (
      !multiSelect.exists(report) &&
      multiSelect.selection.length >= MAX_COMPARE
    )
      return;
    if (!multiSelect.exists(report)) prefetchChart(report);
    multiSelect.addRemove(report);
  }

  // List rows can start a comparison straight from a row checkbox while keeping
  // the mark relevant/irrelevant bar available on the same selection: the first
  // check flips compare mode on (so the Compare bar + cap kick in), then selects
  // the report. The relevance bar still renders in list view (see its gate).
  function selectReportFromList(report: Report) {
    if (!compareMode) {
      setCompareMode(true);
      multiSelect.setActive(true);
    }
    toggleReportForCompare(report);
  }

  // "Select all on this page" is an uncapped relevance action, incompatible with
  // the 6-item compare cap — so leave compare mode when it's used, keeping just
  // the mark relevant/irrelevant selection (this also hides the CompareActionBar).
  function selectAllOnPage() {
    if (compareMode) setCompareMode(false);
    multiSelect.addRemoveAll(reports?.results);
  }

  // List view opens a report's detail in the persistent right panel (1/3 column
  // in Reports/index.tsx). Table view shows detail inline instead.
  function onReportItemClick(id: string) {
    navigate({ pathname: `${id}`, search: searchParams.toString() });
  }

  const viewToggle = alerts ? (
    <div className='flex items-center gap-2'>
      <div
        role='group'
        aria-label='View mode'
        className='inline-flex border border-slate-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800'
      >
        <AggieButton
          icon={faList}
          override
          className={`px-3 py-1 text-sm font-medium flex gap-2 items-center ${
            view === "list"
              ? "bg-aggie-secondary-500 text-white"
              : "text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
          }`}
          aria-pressed={view === "list"}
          onClick={() => {
            localStorage.setItem(VIEW_STORAGE_KEY, "list");
            setParams({ view: undefined });
          }}
        >
          List
        </AggieButton>
        <AggieButton
          icon={faTable}
          override
          className={`px-3 py-1 text-sm font-medium flex gap-2 items-center border-l border-slate-300 dark:border-gray-600 ${
            view === "table"
              ? "bg-aggie-secondary-500 text-white"
              : "text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
          }`}
          aria-pressed={view === "table"}
          onClick={() => {
            localStorage.setItem(VIEW_STORAGE_KEY, "table");
            // If a report detail is open (list view's right panel = the
            // /alerts/:id route), drop the :id so it doesn't re-render as a
            // slide-over drawer in table view. Otherwise just flip the param.
            if (currentPageId) {
              const params = new URLSearchParams(searchParams);
              params.set("view", "table");
              navigate({
                pathname: alerts ? "/alerts" : "/mediaposts",
                search: params.toString(),
              });
            } else {
              setParams({ view: "table" });
            }
          }}
        >
          Table
        </AggieButton>
      </div>
      <AggieButton
        className={`px-3 py-1 text-sm rounded-lg border ${
          compareMode
            ? "bg-aggie-secondary-500 text-white border-aggie-secondary-500 hover:bg-aggie-secondary-500/90"
            : "bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
        }`}
        aria-pressed={compareMode}
        onClick={toggleCompareMode}
      >
        <CompareIcon className='w-4 h-4' />
        Compare
      </AggieButton>
    </div>
  ) : undefined;

  useEffect(() => {
    if (!shouldResetSocialFilters) return;

    setParams({
      media: shouldClearMedia ? undefined : currentMedia,
      entityLevel: undefined,
      dataSources: undefined,
      hideDuplicateASNs: undefined,
    });
  }, [currentMedia, setParams, shouldClearMedia, shouldResetSocialFilters]);

  // The filters bar is sticky at the top of the page scroller; the table below
  // now flows with the page (no inner scroll box), so its sticky header must
  // park just beneath the bar. The bar's height is dynamic (grows in
  // select/compare mode, wraps when narrow), so measure it and publish it as
  // the `--dt-sticky-top` CSS var that DataTable's header reads.
  const filtersRef = useRef<HTMLDivElement>(null);
  const [filtersHeight, setFiltersHeight] = useState(0);
  useEffect(() => {
    const el = filtersRef.current;
    if (!el) return;
    const measure = () => setFiltersHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ ["--dt-sticky-top" as any]: `${filtersHeight}px` }}>
      <header className='my-4 flex flex-wrap justify-between items-center gap-2'>
        <div className='flex gap-2 items-baseline'>
          <h1 className='text-3xl font-medium'>
            {alerts ? "Alerts" : "Social Media Posts"}
          </h1>
          <AggieButton
            icon={faRefresh}
            variant='transparent'
            className='text-slate-700 dark:text-gray-300'
            title='refresh page'
            loading={isFetching}
            disabled={isFetching}
            onClick={() => refetch()}
          ></AggieButton>
        </div>
      </header>

      <div
        ref={filtersRef}
        className='px-1 py-2 bg-gray-50 dark:bg-gray-800 backdrop-blur-sm sticky top-0 z-20 '
      >
        <ReportsFilters
          reportCount={reports && reports.total}
          isFetching={isFetching}
          refetch={refetch}
          platformOptions={platformOptions}
          showEntityLevelFilter={alerts}
          showSignalSourcesFilter={alerts}
          headerElement={
            compareMode ? undefined : multiSelect.isActive ? (
              <AggieButton
                variant='secondary'
                className='text-xs font-medium '
                onClick={() => multiSelect.toggleActive()}
              >
                Cancel Selection
              </AggieButton>
            ) : (
              <AggieButton
                icon={faSquareCheck}
                variant='secondary'
                className='text-xs font-medium'
                onClick={() => multiSelect.toggleActive()}
              >
                Select
              </AggieButton>
            )
          }
        />
        {multiSelect.isActive && (!compareMode || view === "list") && (
          <div className='px-1 flex flex-wrap gap-2 text-xs font-medium items-center mt-2'>
            <AggieCheck
              active={multiSelect.any()}
              icon={!multiSelect.all() ? faMinus : undefined}
              onClick={selectAllOnPage}
            />
            <span
              className='cursor-pointer select-none'
              onClick={selectAllOnPage}
            >
              Select all on this page ({reports?.results?.length ?? 0})
            </span>
            <span className='text-slate-400 dark:text-gray-500'>·</span>
            <p>
              Mark {multiSelect.selection.length} report{"(s)"} as:
            </p>
            <MultiSelectActions
              queryKey={reportsQueryKey}
              selection={multiSelect.selection}
              disabled={!multiSelect.any()}
              currentPageId={currentPageId}
              addRemoveSelection={multiSelect.addRemove}
            />
          </div>
        )}
        {alerts && (
          <div className='px-1 flex flex-wrap items-center gap-2 mt-2 text-xs font-medium'>
            {viewToggle}
            {compareMode && (
              <p className='text-slate-600 dark:text-gray-400'>
                Select up to {MAX_COMPARE} alerts, then compare them from the bar
                below.
              </p>
            )}
          </div>
        )}
      </div>

      {view === "table" ? (
        <ReportsTable
          data={reports?.results ?? []}
          isLoading={isLoading}
          queryKey={reportsQueryKey}
          currentPageId={currentPageId}
          selection={{
            isActive: multiSelect.isActive,
            isChecked: (report) => multiSelect.exists(report),
            onToggle: (report) =>
              compareMode
                ? toggleReportForCompare(report)
                : multiSelect.addRemove(report),
          }}
        />
      ) : (
      <div className='flex flex-col border border-slate-300 rounded-lg bg-white dark:bg-gray-800'>
        {!!reports?.results && reports?.total > 0 ? (
          reports?.results.map((report) => (
            <div
              onClick={() =>
                compareMode
                  ? toggleReportForCompare(report)
                  : onReportItemClick(report._id)
              }
              className='cursor-pointer group focus-theme'
              key={report._id}
              tabIndex={0}
              role='button'
            >
              <ReportListItem
                report={report}
                queryKey={reportsQueryKey}
                isChecked={multiSelect.exists(report)}
                isSelectMode={multiSelect.isActive}
                onCheckChange={() => selectReportFromList(report)}
              />
            </div>
          ))
        ) : (
          <div className='w-full bg-white dark:bg-gray-800 py-12 grid place-items-center font-medium dark:bg-gray-800'>
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
      )}
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

      {compareMode && multiSelect.selection.length >= 1 && (
        <CompareActionBar
          count={multiSelect.selection.length}
          noun='alert'
          onCompare={() => setCompareOpen(true)}
          onClear={() => multiSelect.set([])}
        />
      )}

      {compareMode && (
        <ReportsCompareModal
          isOpen={compareOpen}
          onClose={() => setCompareOpen(false)}
          reports={multiSelect.selection}
          queryKey={reportsQueryKey}
          currentPageId={currentPageId}
          onRemoveReport={(report) => multiSelect.addRemove(report)}
        />
      )}
    </div>
  );
};

export default AllReportsList;
