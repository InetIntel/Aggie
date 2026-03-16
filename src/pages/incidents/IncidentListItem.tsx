import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useIncidentMutations } from "./useIncidentMutations";

import { getSession } from "../../api/session";
import type { Group } from "../../api/groups/types";

import TagsList from "../../components/Tags/TagsList";
//import VeracityToken from "../../components/VeracityToken";
import AggieButton from "../../components/AggieButton";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import CreateEditIncidentForm from "./CreateEditIncidentForm";
import AggieDialog from "../../components/AggieDialog";
import DropdownMenu from "../../components/DropdownMenu";
import AggieSwitch from "../../components/AggieSwitch";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCircleMinus,
  faEdit,
  faEllipsis,
  faMinusCircle,
  faPlus,
  faTrash,
  faUserEdit,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import {
  faCompass,
  faDotCircle,
  faFileLines,
  faMessage,
} from "@fortawesome/free-regular-svg-icons";
import { IncidentOverallStatus } from "./IncidentStatuses";
import UserToken from "../../components/UserToken";
import { isString } from "lodash";
import { hasId } from "../../api/common";

interface IProps {
  item: Group;
}

const IncidentListItem = ({ item }: IProps) => {
  const getCoverageBorderClass = (value?: number | null) => {
    if (typeof value !== "number" ) {
      return "border-black dark:border-gray-200";
    }
    if (value < 0.1) {
      return "border-yellow-400 dark:border-yellow-300";
    }
    if (value <= 0.25) {
      return "border-orange-400 dark:border-orange-300";
    }
    return "border-red-500 dark:border-red-400";
  };

  const directCoveragePercent =
    typeof item.directPopulationCoverageScore === "number"
      ? `${(item.directPopulationCoverageScore * 100).toFixed(2)}%`
      : "0.00%";
  const directCoverageBorderClass = getCoverageBorderClass(
    item.directPopulationCoverageScore
  );
  const indirectCoveragePercent =
    typeof item.indirectPopulationCoverageScore === "number"
      ? `${(item.indirectPopulationCoverageScore * 100).toFixed(2)}%`
      : "0.00%";
  const indirectCoverageBorderClass = getCoverageBorderClass(
    item.indirectPopulationCoverageScore
  );

  const navigate = useNavigate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 5000,
  });
  const { doUpdate, doRemove, doSetEscalate, doSetClosed, doSetAssign } =
    useIncidentMutations();

  function onUserClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/settings/user/${id}`);
  }

  function onOpenIncidentPage() {
    navigate(`/incidents/${item._id}`);
  }
  function onAssignClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!session) return;
    doSetAssign.mutate({
      assignedTo: [session._id],
      ids: [item._id],
    });
  }
  function getUserId(user: string | hasId) {
    if (isString(user)) {
      return user;
    } else return user._id;
  }
  return (
    <article className='group relative grid grid-cols-4 lg:grid-cols-6 text-sm text-slate-500 dark:text-gray-400 border-b border-slate-300  '>
      <div
        className='col-span-5 grid grid-cols-subgrid hover:bg-slate-300/15 dark:hover:bg-gray-500/15 pl-3 py-3 pr-1'
        onClick={onOpenIncidentPage}
        title={`open incident ${item.title}`}
        role='button'
      >
        <header className='col-span-3 flex flex-col'>
          <div className='flex justify-between'>
            <div className='flex gap-1 '>
              <p className='font-medium'>#{item.idnum}</p>
              { /*<VeracityToken value={item.veracity} />*/ }
              {item.closed && (
                <span className='px-1 bg-purple-100 dark:bg-purple-100 dark:saturate-[0.7] text-purple-700 font-medium flex gap-1 items-center'>
                  <FontAwesomeIcon
                    icon={faCircleMinus}
                    className='text-purple-500  dark:saturate-[0.7]'
                  />
                  Closed
                </span>
              )}
              {!item.public && (
                <span className='px-1 bg-red-200 dark:bg-red-200 dark:saturate-[0.7] text-red-800 font-medium inline-flex gap-1 items-center'>
                  <FontAwesomeIcon icon={faTrash} />
                  Deleted
                </span>
              )}
              <TagsList values={item.smtcTags} />
            </div>
            <div className='text-xs dark:text-gray-300'>
              {(item.incidentStartedAt || item.incidentEndedAt) && <p>
                  <span>{item.incidentStartedAt?.toString().slice(0, 16).replace("T", " ") || "Unknown Date"}</span>
                  <span>{" "}<FontAwesomeIcon icon={faArrowRight} size="xs" />{" "}</span>
                  <span>{item.incidentEndedAt?.toString().slice(0, 16).replace("T", " ") || "Unknown Date"}</span>
              </p>}
            </div>
          </div>
          <h2 className=' text-black items-center font-medium my-1 dark:text-gray-300'>
            <span className='text-lg group-hover:text-blue-600 group-hover:underline dark:group-hover:text-purple-200'>
              {item.title}{" "}
            </span>
            <IncidentOverallStatus group={item} className='px-1 py-1 rounded-full font-medium text-sm text-slate-600 dark:text-gray-400 inline-flex gap-1 items-center no-underline w-fit'/>
          </h2>
          <div className='flex items-center gap-2 text-black dark:text-gray-300 font-medium text-sm'>
            <span>DPC:</span>
            <span
              className={`border px-1.5 py-1 rounded leading-none ${directCoverageBorderClass}`}
            >
              {directCoveragePercent}
            </span>
          </div>
          <div className='flex items-center gap-2 text-black dark:text-gray-300 font-medium text-sm mt-1'>
            <span>IPC:</span>
            <span
              className={`border px-1.5 py-1 rounded leading-none ${indirectCoverageBorderClass}`}
            >
              {indirectCoveragePercent}
            </span>
          </div>
          <div className='grid grid-cols-4 flex-grow items-end font-medium mt-2'>
            <p>
              <FontAwesomeIcon icon={faFileLines} size='sm' />{" "}
              {item._reports?.length}{" "}
              {item._reports?.length === 1 ? "report" : "reports"}
            </p>
            <p className='line-clamp-2'>
              {!!item.locationName && (
                <>
                  <FontAwesomeIcon icon={faCompass} size='xs' />{" "}
                  {item.locationName}
                </>
              )}
            </p>
            <p>
              {item.comments && item.comments?.length > 0 && (
                <>
                  <FontAwesomeIcon icon={faMessage} size='sm' />{" "}
                  {item.comments?.length}
                </>
              )}
            </p>
            {/* <p className='text-xs overflow-hidden max-w-full flex gap-1 items-baseline text-ellipsis mr-1'>
              {" "}
              <FontAwesomeIcon icon={faUserEdit} size='sm' />{" "}
              {item.creator && <UserToken id={getUserId(item.creator)} />}
            </p> */}
          </div>
        </header>
        <div className='hidden lg:block col-span-2 '>
          <p className='px-2 py-1 text-slate-700 dark:text-gray-300 bg-slate-50 dark:bg-gray-900 h-[6em] overflow-y-auto border border-slate-100 rounded whitespace-pre-line dark:bg-gray-700'>
            {item.notes && item.notes}
          </p>
        </div>
      </div>

      <footer className='col-span-1 flex justify-end gap-2 pr-3 py-3 font-medium '>
        <div className='text-end flex flex-col items-end '>
          <p className=''>
            {item.assignedTo && item.assignedTo.length > 0
              ? "Assigned To:"
              : "Not Assigned"}
          </p>
          {item.assignedTo && item.assignedTo.length > 0 ? (
            item.assignedTo.map((user) => (
              <UserToken id={getUserId(user)} key={getUserId(user)} />
            ))
          ) : (
            <AggieButton
              variant='secondary'
              disabled={!session || doSetAssign.isLoading}
              loading={doSetAssign.isLoading}
              icon={faPlus}
              onClick={onAssignClick}
            >
              Assign Myself
            </AggieButton>
          )}
        </div>
        <DropdownMenu
          variant='secondary'
          className='px-2 py-1 hover:bg-slate-200 dark:hover:bg-gray-600 rounded h-full z-10 pointer-events-auto text-slate-600 dark:text-gray-400'
          panelClassName='right-0 pointer-events-auto'
          buttonElement={
            <div className=''>
              <FontAwesomeIcon icon={faEllipsis} />
            </div>
          }
        >
          <div className='flex justify-between items-center px-2 py-1 gap-5 font-medium '>
            Escalate:
            <AggieSwitch
              checked={item.escalated}
              disabled={doSetEscalate.isLoading}
              onChange={() =>
                doSetEscalate.mutate({
                  ids: [item._id],
                  escalated: !item.escalated,
                })
              }
            />
          </div>
          <AggieButton
            className='w-full px-2 py-1 hover:bg-slate-200  dark:hover:bg-gray-600 font-medium flex gap-2 text-nowrap items-center flex-grow border-t border-slate-300'
            onClick={() => setIsEditOpen(true)}
          >
            <FontAwesomeIcon icon={faEdit} />
            Edit Incident
          </AggieButton>
          {item.closed ? (
            <AggieButton
              className={`w-full px-2 py-1 hover:bg-green-100 dark:hover:bg-green-100 dark:saturate-[0.7] text-green-700  font-medium flex gap-2 text-nowrap items-center flex-grow `}
              onClick={() =>
                doSetClosed.mutate({
                  ids: [item._id],
                  closed: false,
                })
              }
            >
              <FontAwesomeIcon icon={faDotCircle} />
              Open Incident
            </AggieButton>
          ) : (
            <AggieButton
              className={`w-full px-2 py-1 hover:bg-red-100 dark:hover:bg-red-100 dark:saturate-[0.7] text-red-700  font-medium flex gap-2 text-nowrap items-center flex-grow `}
              onClick={() =>
                doSetClosed.mutate({
                  ids: [item._id],
                  closed: true,
                })
              }
            >
              <FontAwesomeIcon icon={faMinusCircle} />
              Close Incident
            </AggieButton>
          )}
        </DropdownMenu>

        <ConfirmationDialog
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={() =>
            doRemove.mutate(item, {
              onSuccess: () => setIsDeleteOpen(false),
            })
          }
          disabled={doRemove.isLoading}
          loading={doRemove.isLoading}
          title={`'Delete incident ${item?.title} ?`}
          variant='danger'
          description='Are you sure you want to log out of this account?'
          className='max-w-md w-full'
          confirmText={"Delete"}
        >
          <p>
            There are {item?._reports?.length} report(s) attached, which will be
            permanently removed.
          </p>
        </ConfirmationDialog>
      </footer>
      <AggieDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: `Edit Incident`,
        }}
      >
        <CreateEditIncidentForm
          group={item}
          onCancel={() => setIsEditOpen(false)}
          onSubmit={(values) =>
            doUpdate.mutate(
              { ...values, _id: item._id },
              { onSuccess: () => setIsEditOpen(false) }
            )
          }
          isLoading={doUpdate.isLoading}
        />
      </AggieDialog>
    </article>
  );
};

export default IncidentListItem;
