import { useEffect, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "../../hooks/useQueryParams";
import _ from "lodash";

import { getGroups } from "../../api/groups";
import type { Group, GroupQueryState, Groups } from "../../api/groups/types";

import { Link, useNavigationType } from "react-router-dom";
import IncidentsFilters from "./IncidentsFilters";
import IncidentListItem from "./IncidentListItem";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faRefresh } from "@fortawesome/free-solid-svg-icons";
import Pagination from "../../components/Pagination";
import { formatPageCount } from "../../utils/format";
import AggieButton from "../../components/AggieButton";
import { SocketEvent, useSocketSubscribe } from "../../hooks/WebsocketProvider";
import { updateByIds } from "../../utils/immutable";
import { useUpdateQueryData } from "../../hooks/useUpdateQueryData";

let savedScrollTop: number | null = null;

const Incidents = () => {
  const { searchParams, getAllParams, getParam, setParams, clearAllParams } =
    useQueryParams<GroupQueryState>();
  const queryData = useUpdateQueryData();
  const navigationType = useNavigationType();

  const { data, refetch, isLoading, isFetching } = useQuery(
    ["groups"],
    () => getGroups(getAllParams(searchParams)),
    {
      refetchInterval: 120000,
    }
  );

  useEffect(() => {
    document.title = "Incidents - Aggie";
    // refetch on filter change
    refetch();
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
        <Link
          to='new'
          className='px-3 py-2 flex gap-2 items-center text-sm bg-green-800 hover:text-slate-100 dark:hover:text-gray-300 hover:bg-green-700 text-slate-100 dark:text-gray-300 rounded-lg font-medium dark:bg-green-800 dark:hover:bg-green-700 dark:saturate-[0.7] '
        >
          <FontAwesomeIcon icon={faPlus} /> Create New Incident
        </Link>
      </header>

      <IncidentsFilters
        totalCount={data && data.total}
        get={getParam}
        set={setParams}
        isQuery={!!searchParams.size}
        clearAll={clearAllParams}
      />
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
    </section>
  );
};

export default Incidents;
