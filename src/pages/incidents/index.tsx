import { useEffect, useLayoutEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useMultiSelect } from "../../hooks/useMultiSelect";
import _ from "lodash";

import { getGroups } from "../../api/groups";
import type { Group, GroupQueryState, Groups } from "../../api/groups/types";

import { Link, useNavigationType } from "react-router-dom";
import IncidentsFilters from "./IncidentsFilters";
import IncidentListItem from "./IncidentListItem";
import IncidentsTable from "./TableView/IncidentsTable";
import IncidentsCompareModal from "./TableView/IncidentsCompareModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClone,
  faList,
  faPlus,
  faRefresh,
  faTable,
} from "@fortawesome/free-solid-svg-icons";
import Pagination from "../../components/Pagination";
import { formatPageCount } from "../../utils/format";
import AggieButton from "../../components/AggieButton";
import { SocketEvent, useSocketSubscribe } from "../../hooks/WebsocketProvider";
import { updateByIds } from "../../utils/immutable";
import { useUpdateQueryData } from "../../hooks/useUpdateQueryData";

let savedScrollTop: number | null = null;

type IncidentsViewMode = "list" | "table";
type IncidentsQueryState = GroupQueryState & { view?: IncidentsViewMode };

const VIEW_STORAGE_KEY = "incidents:view";
// Max incidents that can be compared side-by-side at once.
const MAX_COMPARE = 6;

const Incidents = () => {
  const { searchParams, getAllParams, getParam, setParams, clearAllParams } =
    useQueryParams<IncidentsQueryState>();
  const queryData = useUpdateQueryData();
  const navigationType = useNavigationType();

  const urlView = getParam("view");
  const view: IncidentsViewMode =
    urlView === "table" || urlView === "list"
      ? urlView
      : localStorage.getItem(VIEW_STORAGE_KEY) === "table"
      ? "table"
      : "list";

  const { data, refetch, isLoading, isFetching } = useQuery(
    ["groups"],
    () => getGroups(_.omit(getAllParams(searchParams), "view") as GroupQueryState),
    {
      refetchInterval: 120000,
    }
  );

  // Compare mode reuses a multi-select to pick up to MAX_COMPARE incidents, then
  // opens a read-only side-by-side comparison modal.
  const multiSelect = useMultiSelect<Group>({
    allItems: data?.results,
    mapFn: (i) => i._id,
  });
  const [compareMode, setCompareMode] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  function toggleCompareMode() {
    const next = !compareMode;
    setCompareMode(next);
    multiSelect.set([]);
    multiSelect.setActive(next);
    if (!next) setCompareOpen(false);
  }

  useEffect(() => {
    document.title = "Incidents - Aggie";
    // refetch on filter change
    refetch();
    multiSelect.set([]);
    setCompareMode(false);
    setCompareOpen(false);
    if (navigationType !== "POP") {
      document.getElementById("main_view")?.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }, [searchParams]);

  useEffect(() => {
    const main = document.getElementById("main_view");
    if (!main) return;
    const onScroll = () => {
      savedScrollTop = main.scrollTop;
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (navigationType === "POP" && savedScrollTop != null && data?.total) {
      document.getElementById("main_view")?.scrollTo({ top: savedScrollTop });
    }
  }, [data, navigationType]);

  interface GroupUpdateEvent extends SocketEvent {
    data: {
      ids: string[];
      update: Record<string, any>;
    };
  }

  const handleSocketUpdate = (message: GroupUpdateEvent) => {
    if (message.event !== "groups:update") return;
    console.log("sockets", message);

    queryData.update<Groups>(["groups"], (data) => {
      const updateData = updateByIds(
        message.data.ids,
        data.results,
        message.data.update
      );
      return {
        results: updateData,
      };
    });
  };
  useSocketSubscribe("groups:update", handleSocketUpdate);

  return (
    <section className='max-w-screen-xl mx-auto px-4 pb-10'>
      <header className='my-4 flex justify-between items-center'>
        <div className='flex gap-2 items-baseline'>
          <h1 className='text-3xl font-medium'>Incidents</h1>
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
        <div className='flex items-center gap-2'>
          <div
            role='group'
            aria-label='View mode'
            className='inline-flex border border-slate-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800'
          >
            <AggieButton
              icon={faList}
              override
              className={`px-3 py-2 text-sm font-medium flex gap-2 items-center ${
                view === "list"
                  ? "bg-slate-200 dark:bg-gray-600 text-slate-900 dark:text-gray-100"
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
              className={`px-3 py-2 text-sm font-medium flex gap-2 items-center border-l border-slate-300 dark:border-gray-600 ${
                view === "table"
                  ? "bg-slate-200 dark:bg-gray-600 text-slate-900 dark:text-gray-100"
                  : "text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
              }`}
              aria-pressed={view === "table"}
              onClick={() => {
                localStorage.setItem(VIEW_STORAGE_KEY, "table");
                setParams({ view: "table" });
              }}
            >
              Table
            </AggieButton>
          </div>
          {view === "table" && (
            <AggieButton
              icon={faClone}
              variant={compareMode ? "primary" : "secondary"}
              className='px-3 py-2 text-sm rounded-lg'
              aria-pressed={compareMode}
              onClick={toggleCompareMode}
            >
              Compare
            </AggieButton>
          )}
          <Link
            to='new'
            className='px-3 py-2 flex gap-2 items-center text-sm bg-green-800 hover:text-slate-100 dark:hover:text-gray-300 hover:bg-green-700 text-slate-100 dark:text-gray-300 rounded-lg font-medium dark:bg-green-800 dark:hover:bg-green-700 dark:saturate-[0.7] '
          >
            <FontAwesomeIcon icon={faPlus} /> Create New Incident
          </Link>
        </div>
      </header>

      <IncidentsFilters
        totalCount={data && data.total}
        get={getParam}
        set={setParams}
        isQuery={!!searchParams.size}
        clearAll={clearAllParams}
      />

      {compareMode && (
        <div className='flex gap-2 items-center text-xs font-medium mb-2'>
          <p>
            Select up to {MAX_COMPARE} incidents to compare (
            {multiSelect.selection.length} selected)
          </p>
          <AggieButton
            variant='primary'
            icon={faClone}
            disabled={multiSelect.selection.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            Compare ({multiSelect.selection.length})
          </AggieButton>
          <AggieButton variant='secondary' onClick={toggleCompareMode}>
            Cancel
          </AggieButton>
        </div>
      )}

      {view === "table" ? (
        <IncidentsTable
          data={data?.results ?? []}
          isLoading={isLoading}
          selection={{
            isActive: multiSelect.isActive,
            isChecked: (group) => multiSelect.exists(group),
            onToggle: (group) => {
              // In compare mode, block selecting past the cap (allow deselect).
              if (
                compareMode &&
                !multiSelect.exists(group) &&
                multiSelect.selection.length >= MAX_COMPARE
              )
                return;
              multiSelect.addRemove(group);
            },
          }}
        />
      ) : (
        <div className='border border-slate-300 rounded-lg bg-white dark:bg-gray-800 z-0 '>
          {!!data && !!data.total ? (
            data.results.map((incident) => (
              <IncidentListItem key={incident._id} item={incident} />
            ))
          ) : (
            <div className='w-full bg-white dark:bg-gray-800 py-12 grid place-items-center font-medium'>
              <p>{isLoading ? "Loading data..." : "No Results Found"}</p>
            </div>
          )}
        </div>
      )}
      <div className='w-full flex items-center flex-col mb-10 mt-3'>
        <div className='w-fit text-sm'>
          <Pagination
            currentPage={Number(getParam("page")) || 0}
            totalCount={data?.total || 0}
            onPageChange={(num) => setParams({ page: num })}
            size={4}
          />
        </div>
        <small className={"text-center font-medium w-full mt-2"}>
          {formatPageCount(Number(getParam("page")), 50, data?.total)}
        </small>
      </div>

      {compareMode && (
        <IncidentsCompareModal
          isOpen={compareOpen}
          onClose={() => setCompareOpen(false)}
          incidents={multiSelect.selection}
          onRemoveIncident={(group) => multiSelect.addRemove(group)}
        />
      )}
    </section>
  );
};

export default Incidents;
