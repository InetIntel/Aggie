import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useIncidentMutations } from "./useIncidentMutations";

import { getSession } from "../../api/session";
import type { Group } from "../../api/groups/types";

import TagsList from "../../components/Tags/TagsList";
import VeracityToken from "../../components/VeracityToken";
import AggieButton from "../../components/AggieButton";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import CreateEditIncidentForm from "./CreateEditIncidentForm";
import AggieDialog from "../../components/AggieDialog";
import DropdownMenu from "../../components/DropdownMenu";
import AggieSwitch from "../../components/AggieSwitch";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEdit,
  faEllipsis,
  faLocationPin,
  faMinusCircle,
  faPlus,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import { faDotCircle } from "@fortawesome/free-regular-svg-icons";

interface IProps {
  item: Group;
}

const IncidentListItem = ({ item }: IProps) => {
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

  return (
    <article className='group relative grid grid-cols-4 lg:grid-cols-6 p-3 text-sm text-slate-600 border-b border-slate-300 z-0'>
      <div className='absolute top-0 left-0 bottom-0 right-[15%] z-10'>
        <button
          onClick={onOpenIncidentPage}
          title={`open incident ${item.title}`}
          type='button'
          className='w-full h-full hover:bg-slate-300/15 pointer-events-auto'
        ></button>
      </div>
      <header className='col-span-3 flex flex-col'>
        <div className='flex gap-1 '>
          <VeracityToken value={item.veracity} />
          {item.closed && (
            <span className='px-1 bg-purple-200 text-purple-700 font-medium flex gap-1 items-center'>
              <FontAwesomeIcon icon={faMinusCircle} />
              Closed
            </span>
          )}
          <TagsList values={item.smtcTags} />
        </div>
        <h2 className=' text-slate-700 flex gap-2 items-center font-medium'>
          <span className='text-lg group-hover:text-blue-600 group-hover:underline'>
            {item.title}
          </span>
          {item.escalated && (
            <span className='px-1 bg-orange-700 text-white font-medium text-sm flex gap-1 items-center no-underline'>
              <FontAwesomeIcon icon={faWarning} />
              Escalated
            </span>
          )}
        </h2>
        <div className='grid grid-cols-4 flex-grow items-end font-medium'>
          <p>#{item.idnum}</p>
          <p>{item._reports?.length} reports</p>
          <p>
            {!!item.locationName && (
              <>
                <FontAwesomeIcon icon={faLocationPin} size='xs' />{" "}
                {item.locationName}
              </>
            )}
          </p>
          <p>By: {item.creator?.username}</p>
        </div>
      </header>
      <div className='hidden lg:block col-span-2 '>
        <p className='px-2 py-1 text-slate-700 bg-slate-50 h-[6em] overflow-y-auto border border-slate-200 rounded whitespace-pre-line'>
          {item.notes && item.notes}
        </p>
      </div>
      <footer className='col-span-1 flex justify-end gap-2 '>
        <div className='text-end flex flex-col items-end '>
          <p className=''>
            {item.assignedTo && item.assignedTo.length > 0
              ? "Assigned To:"
              : "Not Assigned"}
          </p>
          {item.assignedTo && item.assignedTo.length > 0 ? (
            item.assignedTo.map((user) => (
              <p
                key={user._id}
                onClick={(e) => onUserClick(e, user._id)}
                className='text-blue-600 hover:underline w-fit font-medium'
              >
                {user.username ? user.username : "Deleted user"}
              </p>
            ))
          ) : (
            <AggieButton
              className='px-2 py-1 bg-slate-600 rounded text-slate-100 hover:bg-slate-500 mt-1'
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
          className='px-2 py-1 hover:bg-slate-200 rounded h-full z-0 pointer-events-auto'
          panelClassName='right-0 pointer-events-auto text-base'
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
            className='w-full px-2 py-1 hover:bg-slate-200  font-medium flex gap-2 text-nowrap items-center flex-grow border-t border-slate-300'
            onClick={() => setIsEditOpen(true)}
          >
            <FontAwesomeIcon icon={faEdit} />
            Edit Incident
          </AggieButton>
          {item.closed ? (
            <AggieButton
              className={`w-full px-2 py-1 hover:bg-green-100 text-green-700  font-medium flex gap-2 text-nowrap items-center flex-grow `}
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
              className={`w-full px-2 py-1 hover:bg-red-100 text-red-700  font-medium flex gap-2 text-nowrap items-center flex-grow `}
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
