import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "../../../hooks/useQueryParams";

import { getSources } from "../../../api/sources";
import { DATA_SOURCE_OPTIONS, ENTITY_LEVEL_OPTIONS, MEDIA_OPTIONS, OUTAGE_STATUS_OPTIONS } from "../../../api/common";
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
  platformOptions?: string[];
  showEntityLevelFilter?: boolean;
  showSignalSourcesFilter?: boolean;
  showOngoingFilter?: boolean;
  showDedupToggle?: boolean;
  autoEnableDedup?: boolean;
  defaultEntityLevelSelection?: string[];
}

const ReportFilters = ({
  reportCount,
  headerElement,
  searchPlaceholder,
  activeSearch,
  fromGroup,
  refetch,
  isFetching,
  platformOptions = [...MEDIA_OPTIONS],
  showEntityLevelFilter = true,
  showSignalSourcesFilter = true,
  showOngoingFilter = true,
  showDedupToggle = true,
  autoEnableDedup = true,
  defaultEntityLevelSelection,
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

  const entityLevelDefaults = defaultEntityLevelSelection ?? (
    showEntityLevelFilter ? [...ENTITY_LEVEL_OPTIONS] : []
  );

  // normalize entity level array and dedup toggle rules
  const currentEntityLevel = getParam("entityLevel")
    ? getParam("entityLevel").split(",").filter(Boolean)
    : entityLevelDefaults;

  const currentHideDuplicateASNs = (() => {
    const raw = getParam("hideDuplicateASNs");
    // If user explicitly set it, use that value
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (!autoEnableDedup) return false;
    // Otherwise, auto-default to true if both AS and AS-Country are selected
    const shouldDefaultOn =
      currentEntityLevel.includes("AS") &&
      currentEntityLevel.includes("AS - Country");
    return shouldDefaultOn;
  })();

  // 'ongoing' is a tri-state: absent = All, 'true' = still running, 'false' = ended.
  const currentOutageStatus =
    getParam("ongoing") === "true"
      ? "Ongoing"
      : getParam("ongoing") === "false"
        ? "Ended"
        : "All";

  const outageStatusToParam = (status: string) =>
    status === "Ongoing" ? "true" : status === "Ended" ? "false" : undefined;

  function setParams(values: ReportQueryState) {
    if (!("page" in values)) {
      values = { ...values, page: undefined };
    }

    const formattedValues: ReportQueryState = { ...values };

    if (showEntityLevelFilter) {
      const requestedEntityLevel =
        values.entityLevel && Array.isArray(values.entityLevel)
          ? values.entityLevel
          : getParam("entityLevel")
            ? getParam("entityLevel").split(",").filter(Boolean)
            : entityLevelDefaults;

      const autoHideDuplicate =
        autoEnableDedup &&
        requestedEntityLevel.includes("AS") &&
        requestedEntityLevel.includes("AS - Country");

      let dedupValue = values.hideDuplicateASNs;
      if (!dedupValue) {
        dedupValue = autoHideDuplicate ? "true" : "false";
      }

      formattedValues.entityLevel =
        requestedEntityLevel.length > 0 ? requestedEntityLevel : undefined;
      formattedValues.hideDuplicateASNs = dedupValue;
    } else {
      formattedValues.entityLevel = undefined;
      formattedValues.hideDuplicateASNs = undefined;
    }

    if (!showSignalSourcesFilter) {
      formattedValues.dataSources = undefined;
    }

    if (!showOngoingFilter) {
      formattedValues.ongoing = undefined;
    }

    setParamsQuery(formattedValues);
  }

  // const dataSourceParam = getParam("dataSources");
  // console.log('debugging- dataSrouceParam: (mid)', dataSourceParam,"(mid).");
  // if (!dataSourceParam) {
  //   console.log('debugging-empty dataSourceParam');
  // }
  const groupsList = useCallback(groupsRemapComboBox, [groups]);

  return (
    <>
      <div className='flex justify-between items-center gap-2 mb-2'>
        <div className='flex items-center gap-2 min-w-0'>
          <Formik
            initialValues={{ keywords: getParam("keywords") }}
            onSubmit={(e) => {
              setParams(e);
              (document.activeElement as HTMLElement)?.blur();
            }}
          >
            {({ resetForm, values }) => (
              <Form className='flex items-center gap-2 min-w-0'>
                <div className='flex items-center focus-within-theme rounded-lg min-w-0'>
                  <div className='group relative min-w-0'>
                    <Field
                      name='keywords'
                      className='focus-theme px-2 py-1 border border-slate-300 bg-white dark:bg-gray-800 rounded-lg w-[16rem] max-w-full'
                      placeholder={searchPlaceholder || "Search"}
                    />
                  </div>
                </div>
                <AggieButton
                  type='button'
                  icon={faRefresh}
                  variant='secondary'
                  className='px-2 py-1 text-sm shrink-0'
                  title='Refresh'
                  loading={isFetching}
                  disabled={isFetching}
                  onClick={() => refetch()}
                >
                  Refresh
                </AggieButton>
                {!!searchParams.size && (
                  <AggieButton
                    type='button'
                    variant='secondary'
                    className='px-2 py-1 text-sm shrink-0'
                    title='Clear all filters and search'
                    onClick={() => {
                      clearAllParams();
                      resetForm({ values: { keywords: "" } });
                    }}
                  >
                    <FontAwesomeIcon icon={faXmarkSquare} />
                    Reset filters
                  </AggieButton>
                )}
              </Form>
            )}
          </Formik>
        </div>
        <div className='text-xs shrink-0'>
          <Pagination
            currentPage={Number(getParam("page")) || 0}
            totalCount={reportCount || 0}
            onPageChange={(num) => setParams({ page: num })}
            size={0}
          />
        </div>
      </div>
      <div className='flex flex-wrap justify-between gap-y-2 text-sm'>
        <div className='flex gap-3 items-center'>
          {headerElement && (
            <div className='flex items-center pr-3 border-r border-slate-300 dark:border-gray-600'>
              {headerElement}
            </div>
          )}
          <FilterRadioGroup
            options={{
              all: "All",
              false: "Investigate",
              true: "Ignore",
            }}
            value={getParam("irrelevant")}
            defaultValue={"all"}
            onChange={(e) =>
              setParams({ irrelevant: e === "all" ? undefined : e })
            }
          />
        </div>
        <div className='flex flex-wrap items-center gap-1'>
          <FilterDateTime
            before={getParam("before")}
            onSetBefore={(d) => setParams({ before: d })}
            after={getParam("after")}
            onSetAfter={(d) => setParams({ after: d })}
          />
          <FilterListbox
            label='Platforms'
            options={platformOptions}
            value={getParam("media") as string}
            onChange={(e) => setParams({ media: e as string})}
          />
          {showOngoingFilter && (
            <FilterListbox
              label='Status'
              options={[...OUTAGE_STATUS_OPTIONS]}
              value={currentOutageStatus === "All" ? "" : currentOutageStatus}
              onChange={(e) =>
                setParams({ ongoing: outageStatusToParam(e as string) })
              }
            />
          )}
          {showEntityLevelFilter && (
            <FilterListbox
              label='Entity Level'
              options={[...ENTITY_LEVEL_OPTIONS]}
              value={
                getParam("entityLevel")
                  ? getParam("entityLevel").split(",").filter(Boolean) as string[]
                  : currentEntityLevel
              }
              onChange={(e) => setParams({ entityLevel: e as string[] })}
              isMultiSelect={true}
              toggleLabel={showDedupToggle ? 'Hide Duplicate ASNs' : undefined}
              toggleDescription={showDedupToggle ? 'Show unique ASNs only. Duplicates shared by AS and AS Country are hidden.' : undefined}
              toggleValue={showDedupToggle ? currentHideDuplicateASNs : undefined}
              onToggleChange={showDedupToggle ? (value) => setParams({ hideDuplicateASNs: value ? "true" : "false" }) : undefined}
            />
          )}
          {showSignalSourcesFilter && (
            <FilterListbox
              label='Signal Sources'
              options={[...DATA_SOURCE_OPTIONS]}
              value={getParam("dataSources") ? getParam("dataSources").split(",") as string[] : []}
              onChange={(e) => setParams({ dataSources: e as string[]})}
              isMultiSelect={true}
            />
          )}
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
