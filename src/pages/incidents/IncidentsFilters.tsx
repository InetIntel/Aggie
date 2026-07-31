import { useQuery } from "@tanstack/react-query";

import { getUsers } from "../../api/users";
import {
  GROUP_SORTBY,
  GROUP_SORTBY_LABELS,
  GroupSortBy,
} from "../../api/common";
import type { GroupQueryState } from "../../api/groups/types";

import { Field, Form, Formik } from "formik";
import FilterComboBox from "../../components/filters/FilterComboBox";
import FilterListbox from "../../components/filters/FilterListBox";
import FilterDateTime from "../../components/filters/FilterDateTime";
import AggieButton from "../../components/AggieButton";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faWarning,
  faXmarkSquare,
} from "@fortawesome/free-solid-svg-icons";
import Pagination from "../../components/Pagination";
import { formatPageCount } from "../../utils/format";
import { getSession } from "../../api/session";

// Lifecycle-stage filter options. The display label lowercases exactly to the
// query key sent to the backend (verification/confirmation/published).
const STAGE_OPTIONS = ["Verification", "Confirmation", "Published"] as const;
const stageKey = (label: string) => label.toLowerCase();
const stageLabel = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

interface IProps {
  isQuery: boolean;
  get: (value: keyof GroupQueryState) => string;
  set: (values: GroupQueryState) => void;
  clearAll: () => void;
  totalCount?: number;
}
const IncidentsFilters = ({
  totalCount,
  get,
  set,
  clearAll,
  isQuery,
}: IProps) => {
  const { data: users } = useQuery(["users"], getUsers);

  const { data: session } = useQuery(["session"], getSession, {
    staleTime: 10000,
  });

  function usersRemapComboBox(query: typeof users) {
    if (!query) return [];
    const array = query.map((user) => ({
      key: user._id,
      value: user.username,
      data: user,
      searchstring: user.displayName
        ? `${user.displayName} ${user.username}`
        : undefined,
    }));
    return array;
  }
  function setParams(values: GroupQueryState) {
    if ("title" in values) {
      // a title search spans all stages + closed, not just the active toggle
      values = { ...values, closed: "all", stages: undefined };
    }
    if (!("page" in values)) {
      values = { ...values, page: undefined };
    }
    set(values);
  }
  function onSearch() { }

  return (
    <>
      <div className='flex flex-wrap justify-between items-center gap-2 mb-2 '>
        <div className='flex gap-1 max-w-[25em] w-full'>
          <Formik
            initialValues={{ title: get("title") }}
            onSubmit={(e) => setParams(e)}
          >
            {({ resetForm }) => (
              <Form className='flex w-full'>
                <Field
                  name='title'
                  className='px-2 py-1 border border-r-0 border-slate-300 bg-white dark:bg-gray-800 rounded-l-lg w-full '
                  placeholder='search title, location, description, id (with #)'
                />
                <button
                  type='submit'
                  onClick={onSearch}
                  className='px-4 py-1 bg-slate-100 dark:bg-gray-700 rounded-r-lg border border-slate-300 hover:bg-slate-50 dark:hover:bg-gray-900  '
                >
                  <FontAwesomeIcon icon={faSearch} />
                </button>
                {isQuery && (
                  <AggieButton
                    className='ml-1 hover:underline hover:bg-slate-100 dark:hover:bg-gray-700 px-2 py-1 text-sm rounded'
                    onClick={() => {
                      clearAll();
                      resetForm();
                    }}
                  >
                    <FontAwesomeIcon icon={faXmarkSquare} />
                    Clear All
                  </AggieButton>
                )}
              </Form>
            )}
          </Formik>
        </div>
        <div className='text-xs flex items-center gap-2'>
          <p className={"font-medium text-slate-600 dark:text-gray-400"}>
            {formatPageCount(Number(get("page")), 50, totalCount)}
          </p>
          <Pagination
            currentPage={Number(get("page")) || 0}
            totalCount={totalCount || 0}
            onPageChange={(num) => setParams({ page: num })}
            size={0}
          />
        </div>
      </div>
      <div className='flex flex-wrap justify-end gap-y-2 mb-2 text-sm'>
        <div className='flex flex-wrap items-center gap-1'>
          <FilterListbox
            label='Stage'
            options={[...STAGE_OPTIONS]}
            value={
              get("stages")
                ? get("stages").split(",").filter(Boolean).map(stageLabel)
                : []
            }
            onChange={(e) => {
              const keys = (e as string[]).map(stageKey);
              setParams({ stages: keys.length ? keys.join(",") : undefined });
            }}
            isMultiSelect={true}
            toggleLabel='Include closed'
            toggleDescription='Also show closed incidents. Hidden by default.'
            toggleValue={get("closed") === "all"}
            onToggleChange={(value) =>
              setParams({ closed: value ? "all" : undefined })
            }
          />
          <FilterDateTime
            label='Incident start'
            before={get("before")}
            onSetBefore={(d) => setParams({ before: d })}
            after={get("after")}
            onSetAfter={(d) => setParams({ after: d })}
          />
          <FilterComboBox
            label='Creator'
            list={usersRemapComboBox(users)}
            itemElement={(i) => (
              <div className='text-left'>
                {i.data?.displayName ? (
                  <>
                    <p className='font-medium'>{i.data?.displayName}</p>
                    <p className=' text-xs text-slate-700 dark:text-gray-300'>
                      {i.data?.username}
                    </p>
                  </>
                ) : (
                  <>
                    <p className='font-medium'>{i.data?.username}</p>
                  </>
                )}
              </div>
            )}
            onChange={(e) => {
              setParams({ creator: e.key });
            }}
            selectedKey={get("creator")}
          />
          <FilterComboBox
            label='Assigned To'
            list={usersRemapComboBox(users)}
            itemElement={(i) => (
              <div className='text-left'>
                {i.data?.displayName ? (
                  <>
                    <p className='font-medium'>{i.data?.displayName}</p>
                    <p className=' text-xs text-slate-700 dark:text-gray-300'>
                      {i.data?.username}
                    </p>
                  </>
                ) : (
                  <>
                    <p className='font-medium'>{i.data?.username}</p>
                  </>
                )}
              </div>
            )}
            onChange={(e) => {
              setParams({ assignedTo: e.key });
            }}
            selectedKey={get("assignedTo")}
            optionalItems={[
              { key: "none", value: "Not Assigned" },
              { key: session?._id || "", value: "Assigned to Me" },
            ]}
          />
          <FilterListbox
            label='Sort By'
            options={GROUP_SORTBY.map((k) => GROUP_SORTBY_LABELS[k])}
            value={
              get("sortBy")
                ? GROUP_SORTBY_LABELS[get("sortBy") as GroupSortBy]
                : ""
            }
            onChange={(e) =>
              setParams({
                sortBy: GROUP_SORTBY.find(
                  (k) => GROUP_SORTBY_LABELS[k] === e
                ) as GroupSortBy,
              })
            }
          />
        </div>
      </div>
    </>
  );
};

export default IncidentsFilters;
