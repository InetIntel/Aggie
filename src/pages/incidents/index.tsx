import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "../../hooks/useQueryParams";
import _ from "lodash";

import { getGroups } from "../../api/groups";
import type { GroupQueryState } from "../../api/groups/types";

import { Link } from "react-router-dom";
import IncidentsFilters from "./IncidentsFilters";
import IncidentListItem from "./IncidentListItem";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import Pagination from "../../components/Pagination";
import { formatPageCount } from "../../utils/format";

const Incidents = () => {
  const { searchParams, getAllParams, getParam, setParams, clearAllParams } =
    useQueryParams<GroupQueryState>();

  const { data, refetch, isLoading } = useQuery(
    ["groups"],
    () => getGroups(getAllParams(searchParams)),
    {
      refetchInterval: 120000,
    }
  );

  useEffect(() => {
    // refetch on filter change
    refetch();
  }, [searchParams]);

  return (
    <section className='max-w-screen-xl mx-auto px-4 pb-10'>
      <header className='my-4 flex justify-between items-center'>
        <h1 className='text-3xl font-medium'>Incidents</h1>
        <Link
          to='new'
          className='px-3 py-2 flex gap-2 items-center text-sm bg-green-800 hover:text-slate-100 hover:bg-green-700 text-slate-100 rounded-lg font-medium'
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
      <div className='border border-slate-300 rounded-lg bg-white'>
        {!!data && !!data.total ? (
          data.results.map((incident) => (
            <IncidentListItem key={incident._id} item={incident} />
          ))
        ) : (
          <div className='w-full bg-white py-12 grid place-items-center font-medium'>
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
