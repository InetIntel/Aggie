import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { deleteUser, getUser } from "../../../api/users";
import type { Session } from "../../../api/session/types";

import PlaceholderDiv from "../../../components/PlaceholderDiv";

import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import CreateEditUserForm from "./CreateEditUserForm";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

import {
  faEllipsisH,
  faEdit,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps {
  session: Session | undefined;
}

const UserProfile = ({ session }: IProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(["user", params.id], () => {
    if (params.id) return getUser(params.id);
    else return undefined;
  });
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  const doDeleteUser = useMutation(deleteUser, {
    onSuccess: () => {
      setOpenDelete(false);
    },
  });

  const isSelf = session?._id === params.id;

  const grid = "grid grid-cols-4 py-1 items-center";

  return (
    <section className={"mt-4 max-w-screen-xl mx-auto"}>
      <div className={`p-3 bg-white rounded-xl `}>
        <div className='flex justify-between items-center'>
          <h2 className='text-3xl font-medium'>{isSelf && "Your "}Profile</h2>
          {(isSelf || session?.role === "admin") && (
            <DropdownMenu
              variant='secondary'
              className='px-2 py-1 rounded-lg bg-slate-100 border border-slate-300'
              panelClassName='overflow-hidden right-0 text-sm'
              buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
            >
              <AggieButton
                className='px-3 py-2 hover:bg-slate-100 text-slate-600 w-full'
                onClick={() => setOpenEdit(true)}
              >
                <FontAwesomeIcon icon={faEdit} />
                Edit
              </AggieButton>
              <AggieButton
                className='px-3 py-2 hover:bg-slate-100 text-red-600'
                onClick={() => setOpenDelete(true)}
              >
                <FontAwesomeIcon icon={faTrashAlt} />
                Permanently Delete
              </AggieButton>
            </DropdownMenu>
          )}
        </div>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Display Name</p>
          <p
            className={`text-1xl font-medium inline-flex items-center gap-1 ${grid}`}
          >
            {data?.displayName || "Not Set"}
          </p>
        </PlaceholderDiv>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Username</p>
          <p
            className={`text-1xl font-medium inline-flex items-center gap-1 ${grid}`}
          >
            {data?.username}
          </p>
        </PlaceholderDiv>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Role</p>
          <span className='px-2 py-1 bg-slate-100 rounded w-fit'>
            {data?.role}
          </span>
        </PlaceholderDiv>

        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Email</p>
          <p className='mt-1'>{data?.email}</p>
        </PlaceholderDiv>
      </div>
      <AggieDialog
        isOpen={!!openEdit}
        onClose={() => setOpenEdit(false)}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: "Edit user details",
        }}
      >
        <CreateEditUserForm user={data} onClose={() => setOpenEdit(false)} />
      </AggieDialog>
      <ConfirmationDialog
        isOpen={!!openDelete}
        variant='danger'
        disabled={doDeleteUser.isLoading}
        title={`Delete ${data?.username}'s Account Permanently?`}
        description={"Are you sure you want to do this?"}
        confirmText={"Delete"}
        onClose={() => setOpenDelete(false)}
        onConfirm={() => !!data && doDeleteUser.mutate(data)}
      ></ConfirmationDialog>
    </section>
  );
};

export default UserProfile;
