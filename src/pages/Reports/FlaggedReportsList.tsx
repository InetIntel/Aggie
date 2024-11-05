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

import { faMinus, faSearch } from "@fortawesome/free-solid-svg-icons";
import MultiSelectActions from "./components/MultiSelectActions";
import { getSearch, SearchQueryState } from "../../api/search";
import { Field, Form, Formik } from "formik";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps {}

const FlaggedReportsList = ({}: IProps) => {
  const { id: currentPageId } = useParams();
  const navigate = useNavigate();

  const { searchParams, getAllParams, setParams, getParam } =
    useQueryParams<Partial<SearchQueryState>>();

  const reportsQuery = useQuery({
    queryKey: ["search"],
    queryFn: () => getSearch(getAllParams(searchParams)),
    enabled: !!getParam("keywords"),
  });

  const { data: reports } = reportsQuery;
  useEffect(() => {
    // refetch on filter change
    if (!getParam("keywords")) return;
    reportsQuery.refetch();
    multiSelect.set([]);
    document.getElementById("main_view")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [searchParams]);

  const multiSelect = useMultiSelect({
    allItems: reports?.results,
    mapFn: (i) => i._id,
  });

  function onReportItemClick(id: string, isRead: boolean) {
    navigate({
      pathname: `/rpt/search/${id}`,
      search: searchParams.toString(),
    });
  }
  if (!reportsQuery.data)
    return (
      <>
        <div className='bg-white rounded-lg border border-slate-300 grid place-items-center w-full mt-3'>
          <Formik
            initialValues={{ keywords: getParam("keywords") }}
            onSubmit={(e) => {
              setParams(e);
            }}
          >
            {({ resetForm, values }) => (
              <Form className='flex gap-2 flex-col text-center my-4'>
                <h1 className='text-xl font-medium'>
                  {" "}
                  Advanced Contextual Search
                </h1>
                <p className='text-slate-700 mb-2 max-w-md'>
                  {" "}
                  find concepts and ideas that are similar, but not exactly the
                  same to the search term
                </p>

                <div className='flex items-center focus-within-theme rounded-lg'>
                  <Field
                    name='keywords'
                    className='focus-theme px-2 py-1 border border-slate-300 bg-white rounded-lg min-w-[20rem] w-full'
                    placeholder={"what do you want to search for?"}
                  />
                </div>
                <div>
                  <AggieButton
                    type='submit'
                    variant='secondary'
                    title='search'
                    disabled={!values.keywords}
                  >
                    Search!
                    <FontAwesomeIcon icon={faSearch} />
                  </AggieButton>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </>
    );
  return (
    <>
      <div className='px-1 py-2 bg-gray-50/75 backdrop-blur-sm sticky top-0 z-10 '>
        <ReportsFilters
          reportCount={reports && reports.total}
          searchPlaceholder='contextual search'
          activeSearch='contextual'
          isFetching={reportsQuery.isFetching}
          refetch={reportsQuery.refetch}
          headerElement={
            <AggieButton
              variant='secondary'
              className='text-xs font-medium '
              onClick={() => multiSelect.toggleActive()}
            >
              {multiSelect.isActive ? "Cancel Selection" : "Select Multiple"}
            </AggieButton>
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

      <div className='flex flex-col border border-slate-300 rounded-lg'>
        {!!reports && reports?.total > 0 && searchParams.size > 0 ? (
          reports?.results.map((report) => (
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

export default FlaggedReportsList;
