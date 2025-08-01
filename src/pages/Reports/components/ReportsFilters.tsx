import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "../../../hooks/useQueryParams";

import { getSources } from "../../../api/sources";
import { DATA_SOURCE_OPTIONS, ENTITY_LEVEL_OPTIONS, MEDIA_OPTIONS } from "../../../api/common";
import type { ReportQueryState } from "../../../api/reports/types";

import FilterComboBox from "../../../components/filters/FilterComboBox";
import FilterListbox from "../../../components/filters/FilterListBox";
import { Field, Form, Formik } from "formik";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faMinusCircle,
  faRefresh,
  faSearch,
  faXmarkSquare,
} from "@fortawesome/free-solid-svg-icons";
import AggieButton from "../../../components/AggieButton";
import Pagination from "../../../components/Pagination";
import { getAllGroups } from "../../../api/groups";
import { useCallback } from "react";
import FilterRadioGroup from "../../../components/filters/FilterRadioGroup";
import { Link, useNavigate } from "react-router-dom";
import FilterDateTime from "../../../components/filters/FilterDateTime";

interface IReportFilters {
  reportCount?: number;
  headerElement?: React.ReactElement;
  searchPlaceholder?: string;
  activeSearch?: string;
  fromGroup?: string;
  refetch: () => void;
  isFetching: boolean;
}

const ReportFilters = ({
  reportCount,
  headerElement,
  searchPlaceholder,
  activeSearch,
  fromGroup,
  refetch,
  isFetching,
}: IReportFilters) => {
  const {
    searchParams,
    getParam,
    setParams: setParamsQuery,
    clearAllParams,
  } = useQueryParams<ReportQueryState>();
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
      searchstring: `${group.title} #${group.idnum} ${group.closed ? "closed" : ""
        } ${group.escalated ? "escalated" : ""}`,
    }));
    if (!array) return [];
    return array;
  }

  function setParams(values: ReportQueryState) {
    if (!("page" in values)) {
      values = { ...values, page: undefined };
    }
    console.log(values);
    setParamsQuery(values);
  }

  // const dataSourceParam = getParam("dataSources");
  // console.log('debugging- dataSrouceParam: (mid)', dataSourceParam,"(mid).");
  // if (!dataSourceParam) {
  //   console.log('debugging-empty dataSourceParam');
  // }
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
                  </div>
                </div>
                <AggieButton
                  icon={faRefresh}
                  variant='transparent'
                  className='text-slate-700'
                  title='refresh page'
                  loading={isFetching}
                  disabled={isFetching}
                  onClick={() => refetch()}
                ></AggieButton>
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
              all: "All",
              false: "Relevant",
              true: "Irrelevant",
            }}
            value={getParam("irrelevant")}
            defaultValue={"all"}
            onChange={(e) =>
              setParams({ irrelevant: e === "all" ? undefined : e })
            }
          />
        </div>
        <div className='flex items-center gap-1'>
          <FilterDateTime
            before={getParam("before")}
            onSetBefore={(d) => setParams({ before: d })}
            after={getParam("after")}
            onSetAfter={(d) => setParams({ after: d })}
          />
          <FilterListbox
            label='Platforms'
            options={[...MEDIA_OPTIONS]}
            value={getParam("media") as string}
            onChange={(e) => setParams({ media: e as string})}
          />
          <FilterListbox
            label='Entity Level'
            options={[...ENTITY_LEVEL_OPTIONS]}
            value={getParam("entityLevel") as string}
            onChange={(e) => setParams({ entityLevel: e as string})}
          />
          <FilterListbox
            label='Signal Sources'
            options={[...DATA_SOURCE_OPTIONS]}
            value={getParam("dataSources") ? getParam("dataSources").split(",") as string[] : []}
            onChange={(e) => setParams({ dataSources: e as string[]})}
            isMultiSelect={true}
          />
          {/* <FilterComboBox
            label='Sources'
            list={sourcesList(sources)}
            onChange={(e) => {
              setParams({ sourceId: e.key });
            }}
            selectedKey={getParam("sourceId")}
          /> */}
          {/* {!fromGroup && (
            <FilterComboBox
              label='Incidents'
              list={groupsList(groups)}
              itemElement={(i) => (
                <div className='inline-flex gap-1 flex-wrap max-w-prose text-start items-center'>
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
              optionalItems={[
                { key: "", value: "All" },
                { key: "none", value: "Not Added to Any Incident" },
              ]}
            />
          )} */}
        </div>
      </div>
    </>
  );
};

export default ReportFilters;
