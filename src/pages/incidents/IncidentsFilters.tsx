import { useQuery } from "@tanstack/react-query";
import { IuseQueryParams, useQueryParams } from "../../hooks/useQueryParams";

import { getUsers } from "../../api/users";
import {
  VERACITY_OPTIONS,
  ESCALATED_OPTIONS,
  GROUP_SORTBY,
  GroupSortBy,
} from "../../api/common";
import type { GroupQueryState } from "../../api/groups/types";

import { Field, Form, Formik } from "formik";
import FilterComboBox from "../../components/filters/FilterComboBox";
import FilterListbox from "../../components/filters/FilterListBox";
import FilterRadioGroup from "../../components/filters/FilterRadioGroup";
import AggieButton from "../../components/AggieButton";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faSearch,
  faWarning,
  faXmarkSquare,
} from "@fortawesome/free-solid-svg-icons";
import Pagination from "../../components/Pagination";
import { formatPageCount } from "../../utils/format";
import { getSession } from "../../api/session";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";

interface IIncidentFilters {
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
}: IIncidentFilters) => {
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
      set({ ...values, closed: "all" });
      return;
    }

    set(values);
  }
  function onSearch() {}

  return (
    <>
      <div className='flex justify-between mb-2 overflow-x-hidden '>
        <div className='flex gap-1 max-w-[25em] w-full'>
          <Formik
            initialValues={{ title: get("title") }}
            onSubmit={(e) => setParams(e)}
          >
            {({ resetForm }) => (
              <Form className='flex w-full'>
                <Field
                  name='title'
                  className='px-2 py-1 border border-r-0 border-slate-300 bg-white rounded-l-lg w-full'
                  placeholder='search title, location, description, id (with #)'
                />
                <button
                  type='submit'
                  onClick={onSearch}
                  className='px-4 py-1 bg-slate-100 rounded-r-lg border border-slate-300 hover:bg-slate-50'
                >
                  <FontAwesomeIcon icon={faSearch} />
                </button>
                {isQuery && (
                  <AggieButton
                    className='ml-1 hover:underline hover:bg-slate-100 px-2 py-1 text-sm rounded'
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
          <p className={"font-medium text-slate-600"}>
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
      <div className='flex justify-between mb-2 text-sm'>
        <div className='flex gap-2'>
          <FilterRadioGroup
            options={{
              false: (
                <span>
                  <FontAwesomeIcon
                    icon={faCircleDot}
                    className='text-green-700'
                  />{" "}
                  Open
                </span>
              ),
              true: (
                <span>
                  <FontAwesomeIcon
                    icon={faCircleMinus}
                    className='text-purple-700'
                  />{" "}
                  Closed
                </span>
              ),
              all: "All",
            }}
            value={get("closed")}
            defaultValue={"false"}
            onChange={(e) =>
              setParams({ closed: e === "false" ? undefined : e })
            }
          />
          {!get("escalated") && (
            <AggieButton
              variant='secondary'
              icon={faWarning}
              className='text-xs text-red-700'
              onClick={() => setParams({ escalated: true })}
            >
              Show Only Escalated
            </AggieButton>
          )}
        </div>
        <div className='flex items-center gap-1'>
          <FilterListbox
            label='Veracity'
            options={[...VERACITY_OPTIONS]}
            value={get("veracity")}
            onChange={(e) => setParams({ veracity: e })}
          />
          <FilterListbox
            label='Escalated'
            options={[...ESCALATED_OPTIONS]}
            value={get("escalated")}
            onChange={(e) => setParams({ escalated: e })}
          />

          <FilterComboBox
            label='Creator'
            list={usersRemapComboBox(users)}
            itemElement={(i) => (
              <div className='text-left'>
                {i.data?.displayName ? (
                  <>
                    <p className='font-medium'>{i.data?.displayName}</p>
                    <p className=' text-xs text-slate-700'>
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
                    <p className=' text-xs text-slate-700'>
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
            options={[...GROUP_SORTBY]}
            value={get("sortBy")}
            onChange={(e) => setParams({ sortBy: e as GroupSortBy })}
          />
        </div>
      </div>
    </>
  );
};

export default IncidentsFilters;
