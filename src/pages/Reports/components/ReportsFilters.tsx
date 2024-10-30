import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "../../../hooks/useQueryParams";

import { getSources } from "../../../api/sources";
import { MEDIA_OPTIONS } from "../../../api/common";
import type { ReportQueryState } from "../../../api/reports/types";

import FilterComboBox from "../../../components/filters/FilterComboBox";
import FilterListbox from "../../../components/filters/FilterListBox";
import { Field, Form, Formik } from "formik";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faMinusCircle,
  faSearch,
  faXmarkSquare,
} from "@fortawesome/free-solid-svg-icons";
import AggieButton from "../../../components/AggieButton";
import Pagination from "../../../components/Pagination";
import { getAllGroups } from "../../../api/groups";
import { useCallback } from "react";
import FilterRadioGroup from "../../../components/filters/FilterRadioGroup";
import { Link, useNavigate } from "react-router-dom";

interface IReportFilters {
  reportCount?: number;
  headerElement?: React.ReactElement;
  searchPlaceholder?: string;
  activeSearch?: string;
}

const ReportFilters = ({
  reportCount,
  headerElement,
  searchPlaceholder,
  activeSearch,
}: IReportFilters) => {
  const { searchParams, getParam, setParams, clearAllParams } =
    useQueryParams<ReportQueryState>();
  const navigate = useNavigate();
  const { data: sources } = useQuery(["sources"], getSources);
  function sourcesRemapComboBox(query: typeof sources) {
    if (!query) return [];
    const array = query.map((source) => ({
      key: source._id,
      value: source.nickname,
    }));
    return [{ key: "", value: "All Sources" }, ...array];
  }
  const sourcesList = useCallback(sourcesRemapComboBox, [sources]);

  const { data: groups } = useQuery(["allgroups"], () => getAllGroups());

  function groupsRemapComboBox(query: typeof groups) {
    if (!query || "total" in query) return [];
    const array = query?.map((group) => ({
      key: group._id,
      value: group.title,
      data: group,
      searchstring: `${group.title} #${group.idnum} ${
        group.closed ? "closed" : ""
      } ${group.escalated ? "escalated" : ""}`,
    }));
    if (!array) return [];
    return [{ key: "", value: "All Incidents" }, ...array];
  }
  const groupsList = useCallback(groupsRemapComboBox, [groups]);

  return (
    <>
      <div className='flex justify-between mb-2'>
        <div className='flex gap-1'>
          <Formik
            initialValues={{ keywords: getParam("keywords") }}
            onSubmit={(e) => {
              setParams(e);
              (document.activeElement as HTMLElement)?.blur();
            }}
          >
            {({ resetForm, values }) => (
              <Form className='flex gap-2'>
                <div className='flex items-center focus-within-theme rounded-lg'>
                  <div className='group relative'>
                    <Field
                      name='keywords'
                      className='focus-theme px-2 py-1 border border-slate-300 bg-white rounded-lg min-w-[20rem]'
                      placeholder={searchPlaceholder || "Keyword Search"}
                    />
                    <div className='absolute hidden group-focus-within:block py-1 w-[32em]'>
                      <div
                        className={`flex rounded-lg border border-slate-300 bg-white shadow-md overflow-hidden ${
                          !!activeSearch ? "flex-col-reverse" : "flex-col "
                        }`}
                      >
                        <AggieButton
                          type={!activeSearch ? "submit" : "button"}
                          className={`px-4 py-2 h-full w-full hover:bg-slate-50 text-left border-l-4   ${
                            !activeSearch
                              ? "border-green-600 "
                              : "border-transparent "
                          }`}
                          title='search'
                          disabled={!values.keywords}
                          onClick={() => {
                            if (!activeSearch) return;
                            navigate(`/rpt?keywords=${!values.keywords}`);
                          }}
                        >
                          <div className='font-medium text-sm'>
                            {!activeSearch ? (
                              <p>
                                Search for{" "}
                                {!!values.keywords
                                  ? `"${values.keywords}"`
                                  : "Keywords"}{" "}
                              </p>
                            ) : (
                              <p>Search for Keywords</p>
                            )}

                            <p className='text-slate-600 max-w-lg text-wrap'>
                              search for exact words and phrases, like "Fulton
                              County".
                            </p>
                          </div>
                          {!activeSearch && <FontAwesomeIcon icon={faSearch} />}{" "}
                        </AggieButton>
                        <AggieButton
                          type={!!activeSearch ? "submit" : "button"}
                          className={`px-4 py-2 h-full w-full hover:bg-purple-100 bg-purple-50 text-left border-l-4   ${
                            !!activeSearch
                              ? "border-green-600 "
                              : "border-transparent "
                          }`}
                          title='search'
                          disabled={!values.keywords}
                          onClick={() => {
                            if (!!activeSearch) return;
                            navigate(
                              `/rpt/search?keywords=${!values.keywords}`
                            );
                          }}
                        >
                          <div className='font-medium text-sm'>
                            {!!activeSearch ? (
                              <p>
                                Search concepts related to{" "}
                                {!!values.keywords
                                  ? `"${values.keywords}"`
                                  : "Keywords"}{" "}
                              </p>
                            ) : (
                              <p>Advanced Contextual Search</p>
                            )}
                            <p className='text-slate-600 max-w-lg text-wrap'>
                              find concepts and ideas that are similar but not
                              exactly the same to the search term
                            </p>
                          </div>
                          {!!activeSearch && (
                            <FontAwesomeIcon icon={faSearch} />
                          )}
                        </AggieButton>
                      </div>
                    </div>
                  </div>
                </div>

                {!!searchParams.size && (
                  <AggieButton
                    className='hover:underline hover:bg-slate-100 px-2 py-1 text-sm rounded'
                    onClick={() => {
                      clearAllParams();
                      resetForm({ values: { keywords: "" } });
                    }}
                  >
                    <FontAwesomeIcon icon={faXmarkSquare} />
                    Clear All Parameters
                  </AggieButton>
                )}
              </Form>
            )}
          </Formik>
        </div>
        <div className='text-xs'>
          <Pagination
            currentPage={Number(getParam("page")) || 0}
            totalCount={reportCount || 0}
            onPageChange={(num) => setParams({ page: num })}
            size={0}
          />
        </div>
      </div>
      <div className='flex justify-between text-sm'>
        <div className='flex gap-2 items-center'>
          {headerElement}
          <FilterRadioGroup
            options={{
              false: "Relevant/Unmarked",
              true: "Irrelevant",
              all: "All",
            }}
            value={getParam("irrelevant")}
            defaultValue={"false"}
            onChange={(e) =>
              setParams({ irrelevant: e === "false" ? undefined : e })
            }
          />
        </div>
        <div className='flex items-center gap-1'>
          <FilterListbox
            label='Platforms'
            options={[...MEDIA_OPTIONS]}
            value={getParam("media")}
            onChange={(e) => setParams({ media: e })}
          />
          <FilterComboBox
            label='Sources'
            list={sourcesList(sources)}
            onChange={(e) => {
              setParams({ sourceId: e.key });
            }}
            selectedKey={getParam("sourceId")}
          />
          <FilterComboBox
            label='Incidents'
            list={groupsList(groups)}
            itemElement={(i) => (
              <div className='flex gap-1 flex-wrap max-w-prose items-center'>
                {i.value}
                {i.data?.escalated && (
                  <FontAwesomeIcon
                    icon={faExclamationTriangle}
                    className='text-red-400'
                  />
                )}{" "}
                {i.data?.closed && (
                  <FontAwesomeIcon
                    icon={faMinusCircle}
                    className='text-purple-400'
                  />
                )}
              </div>
            )}
            onChange={(e) => {
              setParams({ groupId: e.key });
            }}
            selectedKey={getParam("groupId")}
          />
        </div>
      </div>
    </>
  );
};

export default ReportFilters;
