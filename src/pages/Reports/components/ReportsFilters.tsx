import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "../../../hooks/useQueryParams";

import { getSources } from "../../../api/sources";
import { DATA_SOURCE_OPTIONS, ENTITY_LEVEL_OPTIONS, MEDIA_OPTIONS, OUTAGE_STATUS_OPTIONS, providerLabel } from "../../../api/common";
import type { ReportQueryState } from "../../../api/reports/types";

import FilterComboBox from "../../../components/filters/FilterComboBox";
import { Field, Form, Formik, FormikProps } from "formik";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsUpDown,
  faBriefcase,
  faCalendar,
  faEarthAmericas,
  faExclamationTriangle,
  faFlag,
  faMinusCircle,
  faRefresh,
  faSearch,
  faTag,
  faTowerBroadcast,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import AggieButton from "../../../components/AggieButton";
import Pagination from "../../../components/Pagination";
import { getAllGroups } from "../../../api/groups";
import { useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DateRangePanel, useRangeDateFormatter } from "../../../components/filters/FilterDateTime";
import AggieSwitch from "../../../components/AggieSwitch";
import FilterMenu, {
  FilterOptionList,
  PANEL_CSS,
  SELECTED_CSS,
  ToolbarPopover,
  type FilterCategory,
} from "./FilterMenu";

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
  showPagination?: boolean;
}

const TAG_OPTIONS = ["Read", "Unread", "Investigate", "Ignore"];
const IRRELEVANT_PARAM: Record<string, string> = { Investigate: "false", Ignore: "true" };

// One removable applied filter value. Clicking it clears
// just that value (issue #138: users should see what's applied without opening
// the filter menu, and be able to clear one at a time).
const AppliedFilter = ({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) => (
  <button
    type='button'
    onClick={onRemove}
    title={`Remove filter: ${label}`}
    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-sm ${SELECTED_CSS}`}
  >
    <span>{label}</span>
    <FontAwesomeIcon icon={faXmark} className='text-base' />
  </button>
);

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
  showPagination = true,
}: IReportFilters) => {
  const {
    searchParams,
    getParam,
    setParams: setParamsQuery,
    clearAllParams,
  } = useQueryParams<ReportQueryState>();
  const navigate = useNavigate();
  const formatDate = useRangeDateFormatter();
  const formikRef = useRef<FormikProps<{ keywords: string }>>(null);
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

  // An absent ongoing parameter means all statuses; otherwise one or both
  // status values may be selected.
  const currentOutageStatus: string[] = getParam("ongoing")
    ? getParam("ongoing").split(",").filter(Boolean).map((v) => v === "true" ? "Ongoing" : "Ended")
    : [];

  const outageStatusToParam = (statuses: string[]) =>
    statuses.length ? statuses.map((status) => status === "Ongoing" ? "true" : "false") : undefined;

  function setParams(values: ReportQueryState) {
    if (!("page" in values)) {
      values = { ...values, page: undefined };
    }

    const formattedValues: ReportQueryState = { ...values };

    // Only normalize entity-level / dedup when the caller is actually changing
    // one of them. Running this on every filter change (a date/platform/status
    // tweak, or just opening and closing a dropdown) would materialize the
    // entity-level defaults into the URL, making the bar think a filter is
    // active and wrongly surface the "Reset filters" button.
    const touchingEntityLevel =
      "entityLevel" in values || "hideDuplicateASNs" in values;

    if (showEntityLevelFilter) {
      if (touchingEntityLevel) {
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
      }
      // else: leave entityLevel / hideDuplicateASNs as they are in the URL —
      // an unrelated filter change must not write their defaults.
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

  const groupsList = useCallback(groupsRemapComboBox, [groups]);

  // The `view` param is the list/table UI toggle, not a filter — exclude it so
  // switching to the table view doesn't make the bar think a query is active and
  // surface the "Reset filters" button. Mirrors the Incidents guard
  // (src/pages/incidents/index.tsx).
  // `sort` is likewise an ordering choice, not a filter.
  const hasActiveFilter = Array.from(searchParams.keys()).some(
    (key) => key !== "view" && key !== "sort"
  );

  // --- Applied filters (issue #138): one entry per applied value so users
  // see what's filtered without opening the menu, and can clear one at a time.
  const keywordsValue = getParam("keywords");
  const irrelevantValue = getParam("irrelevant");
  const statusValue = getParam("status");
  const afterValue = getParam("after");
  const beforeValue = getParam("before");
  const mediaValues = getParam("media") ? getParam("media").split(",").filter(Boolean) : [];
  const dataSourcesValue = getParam("dataSources")
    ? getParam("dataSources").split(",").filter(Boolean)
    : [];
  const entityLevelIsDefault =
    currentEntityLevel.length === entityLevelDefaults.length &&
    currentEntityLevel.every((v) => entityLevelDefaults.includes(v));

  const without = (values: string[], value: string) => values.filter((v) => v !== value);
  const toggled = (values: string[], value: string) =>
    values.includes(value) ? without(values, value) : [...values, value];

  // "Tags" mirrors the "Mark alert(s) as" actions: Read/Unread and
  // Investigate/Ignore. Each pair is one either/or query param, so picking one
  // side replaces the other and picking it again clears it.
  const selectedTags = [
    ...(statusValue === "Read" || statusValue === "Unread" ? [statusValue] : []),
    ...(irrelevantValue === "false" ? ["Investigate"] : irrelevantValue === "true" ? ["Ignore"] : []),
  ];
  const toggleTag = (tag: string) => {
    const on = !selectedTags.includes(tag);
    if (tag in IRRELEVANT_PARAM) setParams({ irrelevant: on ? IRRELEVANT_PARAM[tag] : undefined });
    else setParams({ status: on ? tag : undefined });
  };

  const activeFilters: { id: string; label: string; onRemove: () => void }[] = [];

  if (keywordsValue) {
    activeFilters.push({
      id: "keywords",
      label: `"${keywordsValue}"`,
      onRemove: () => {
        setParams({ keywords: undefined });
        formikRef.current?.setFieldValue("keywords", "");
      },
    });
  }
  selectedTags.forEach((tag) =>
    activeFilters.push({ id: `tag-${tag}`, label: tag, onRemove: () => toggleTag(tag) })
  );
  if (afterValue || beforeValue) {
    const afterStr = afterValue ? formatDate(afterValue) : null;
    const beforeStr = beforeValue ? formatDate(beforeValue) : null;
    activeFilters.push({
      id: "dateRange",
      label: afterStr && beforeStr
        ? `${afterStr} – ${beforeStr}`
        : afterStr ? `After ${afterStr}` : `Before ${beforeStr}`,
      onRemove: () => setParams({ before: undefined, after: undefined }),
    });
  }
  mediaValues.forEach((media) =>
    activeFilters.push({
      id: `media-${media}`,
      label: providerLabel(media),
      onRemove: () => setParams({ media: without(mediaValues, media).join(",") }),
    })
  );
  if (showOngoingFilter) {
    currentOutageStatus.forEach((status) =>
      activeFilters.push({
        id: `ongoing-${status}`,
        label: status,
        onRemove: () =>
          setParams({ ongoing: outageStatusToParam(without(currentOutageStatus, status))?.join(",") }),
      })
    );
  }
  if (showEntityLevelFilter && !entityLevelIsDefault) {
    // Removing the last level resets to the default (all levels) via setParams.
    currentEntityLevel.forEach((level) =>
      activeFilters.push({
        id: `entityLevel-${level}`,
        label: level,
        onRemove: () => setParams({ entityLevel: without(currentEntityLevel, level) }),
      })
    );
  }
  if (showSignalSourcesFilter) {
    dataSourcesValue.forEach((source) =>
      activeFilters.push({
        id: `dataSources-${source}`,
        label: source,
        onRemove: () => setParams({ dataSources: without(dataSourcesValue, source) }),
      })
    );
  }

  const categories: FilterCategory[] = [
    {
      id: "tags",
      label: "Tags",
      icon: faTag,
      content: () => (
        <FilterOptionList
          options={TAG_OPTIONS}
          isSelected={(tag) => selectedTags.includes(tag)}
          onToggle={toggleTag}
          onClear={() => setParams({ status: undefined, irrelevant: undefined })}
        />
      ),
    },
  ];
  if (showOngoingFilter) {
    categories.push({
      id: "status",
      label: "Status",
      icon: faFlag,
      content: () => (
        <FilterOptionList
          options={OUTAGE_STATUS_OPTIONS.filter((status) => status !== "All")}
          isSelected={(status) => currentOutageStatus.includes(status)}
          onToggle={(status) =>
            setParams({ ongoing: outageStatusToParam(toggled(currentOutageStatus, status))?.join(",") })
          }
          onClear={() => setParams({ ongoing: undefined })}
        />
      ),
    });
  }
  categories.push(
    {
      id: "dateRange",
      label: "Date range",
      icon: faCalendar,
      content: (close) => (
        <DateRangePanel
          after={afterValue}
          before={beforeValue}
          onCancel={close}
          onApply={(after, before) => {
            setParams({ after, before });
            close();
          }}
        />
      ),
    },
    {
      id: "platforms",
      label: "Platforms",
      icon: faTowerBroadcast,
      content: () => (
        <FilterOptionList
          options={platformOptions}
          getLabel={providerLabel}
          isSelected={(media) => mediaValues.includes(media)}
          onToggle={(media) => setParams({ media: toggled(mediaValues, media).join(",") })}
          onClear={() => setParams({ media: undefined })}
        />
      ),
    }
  );
  if (showEntityLevelFilter) {
    categories.push({
      id: "entityLevel",
      label: "Entity level",
      icon: faEarthAmericas,
      content: () => (
        <FilterOptionList
          options={[...ENTITY_LEVEL_OPTIONS]}
          isSelected={(level) => currentEntityLevel.includes(level)}
          onToggle={(level) => setParams({ entityLevel: toggled(currentEntityLevel, level) })}
          onClear={() => setParams({ entityLevel: [] })}
          footer={showDedupToggle && (
            <div className='px-2 pt-2 mt-1 border-t border-slate-200 dark:border-gray-600'>
              <div className='flex items-center gap-2'>
                <AggieSwitch
                  checked={currentHideDuplicateASNs}
                  onChange={() => setParams({ hideDuplicateASNs: currentHideDuplicateASNs ? "false" : "true" })}
                  label='Hide Duplicate ASNs'
                />
                <span className='text-slate-600 dark:text-gray-300'>Hide Duplicate ASNs</span>
              </div>
              <p className='mt-1 max-w-[14rem] text-[10px] italic leading-tight text-slate-500 dark:text-gray-400'>
                Show unique ASNs only. Duplicates shared by AS and AS Country are hidden.
              </p>
            </div>
          )}
        />
      ),
    });
  }
  if (showSignalSourcesFilter) {
    categories.push({
      id: "dataSources",
      label: "Signal sources",
      icon: faBriefcase,
      content: () => (
        <FilterOptionList
          options={[...DATA_SOURCE_OPTIONS]}
          isSelected={(source) => dataSourcesValue.includes(source)}
          onToggle={(source) => setParams({ dataSources: toggled(dataSourcesValue, source) })}
          onClear={() => setParams({ dataSources: undefined })}
        />
      ),
    });
  }

  const sortValue = getParam("sort") === "oldest" ? "oldest" : "newest";

  return (
    <>
      <div className='flex justify-between items-center gap-2 mb-2'>
        <div className='flex items-center gap-2 min-w-0'>
          <Formik
            innerRef={formikRef}
            initialValues={{ keywords: getParam("keywords") }}
            onSubmit={(e) => {
              setParams(e);
              (document.activeElement as HTMLElement)?.blur();
            }}
          >
            <Form className='flex items-center gap-2 min-w-0'>
              <div className='flex items-stretch min-w-0 rounded-lg border border-slate-300 dark:border-gray-600 overflow-hidden focus-within-theme'>
                <Field
                  name='keywords'
                  className='px-3 py-1.5 bg-white dark:bg-gray-800 w-[18rem] max-w-full min-w-0 text-sm focus:outline-none'
                  placeholder={searchPlaceholder || "Search"}
                />
                <button
                  type='submit'
                  title='Search'
                  className='px-4 border-l border-slate-300 dark:border-gray-600 bg-slate-50 hover:bg-slate-100 dark:bg-gray-700 dark:hover:bg-gray-600'
                >
                  <FontAwesomeIcon icon={faSearch} />
                </button>
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
            </Form>
          </Formik>
        </div>
        {showPagination && (
          <div className='text-xs shrink-0'>
            <Pagination
              currentPage={Number(getParam("page")) || 0}
              totalCount={reportCount || 0}
              onPageChange={(num) => setParams({ page: num })}
              size={0}
            />
          </div>
        )}
      </div>
      {(activeFilters.length > 0 || hasActiveFilter) && (
        <div className='flex flex-wrap items-center gap-2 mb-2'>
          {activeFilters.map((filter) => (
            <AppliedFilter key={filter.id} label={filter.label} onRemove={filter.onRemove} />
          ))}
          {hasActiveFilter && (
            <button
              type='button'
              title='Clear all filters and search'
              className='text-sm text-slate-600 dark:text-gray-300 underline hover:text-slate-900 dark:hover:text-white px-1'
              onClick={() => {
                clearAllParams();
                formikRef.current?.resetForm({ values: { keywords: "" } });
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      )}
      <div className='flex items-center gap-2 pb-3 mb-3 border-b border-slate-200 dark:border-gray-700'>
        <FilterMenu categories={categories} />
        {/* An incident's own list is always pinned-first, so Sort doesn't apply there. */}
        {!fromGroup && (
          <ToolbarPopover label='Sort' icon={faArrowsUpDown}>
            {(close) => (
              <div className={PANEL_CSS}>
                <FilterOptionList
                  options={["newest", "oldest"]}
                  getLabel={(option) => option === "newest" ? "Newest first" : "Oldest first"}
                  isSelected={(option) => option === sortValue}
                  onToggle={(option) => {
                    setParams({ sort: option === "oldest" ? "oldest" : undefined });
                    close();
                  }}
                />
              </div>
            )}
          </ToolbarPopover>
        )}
      </div>
      {headerElement && (
        <div className='flex flex-wrap items-center gap-3 text-sm'>
          {headerElement}
        </div>
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
    </>
  );
};

export default ReportFilters;
