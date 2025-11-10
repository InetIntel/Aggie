import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteUser, getUsers } from "../../../api/users";
import { Session } from "../../../api/session/types";

import { Link } from "react-router-dom";
import AggieButton from "../../../components/AggieButton";
import DropdownMenu from "../../../components/DropdownMenu";
import CreateEditUserForm from "./CreateEditUserForm";
import AggieDialog from "../../../components/AggieDialog";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import SetPassword from "./SetPassword";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEdit,
  faEllipsisH,
  faPlusCircle,
  faRefresh,
  faTrashAlt,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import { UserRoles } from "../../../api/users/types";

interface IProps {
  session?: Session;
}

const UsersIndex = ({ session }: IProps) => {
  const { data } = useQuery(["users"], getUsers);
  const [editUser, setEditUser] = useState("");
  const [removeUser, setRemoveUser] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const doDeleteUser = useMutation(deleteUser, {
    onSuccess: () => {
      setRemoveUser("");
    },
  });

  function userFromId(id: string) {
    if (id === "newUser") return undefined;
    return data?.find((i) => i._id === id);
  }

  const userToDelete = userFromId(removeUser);
  
  const userToEdit = userFromId(editUser);
  const canEditRole = 
    (editUser === "newUser" && session?.role === "admin") || 
    (!!userToEdit && session?.role === "admin" && userToEdit._id !== session?._id);

  return (
    <div className='w-full mb-16'>
      <div className='flex justify-between items-center'>
        <h3 className={"mb-3 font-medium text-3xl  my-3"}>Users</h3>

        <AggieButton
          variant='primary'
          padding='px-3 py-2'
          onClick={() => setEditUser("newUser")}
        >
          <FontAwesomeIcon icon={faPlusCircle} />
          Create New User
        </AggieButton>
      </div>

      <div className=' rounded-lg border border-slate-300 bg-white dark:bg-gray-800 divide-y divide-slate-300'>
        <div className='grid grid-cols-4 px-3 py-3 font-medium text-sm border-b border-slate-300 items-baseline'>
          <p>Username</p>
          <p>Role</p>
          <p>Email</p>
          <div className='flex justify-end '></div>
        </div>
        {!!data ? (
          data.map((user) => {
            const role = session?.role as UserRoles | undefined;
            const isAdmin = role === 'admin';
            const isTeamLead = role === 'team_lead';
            const isSelf = user._id === session?._id;
            const canEditRow = isAdmin && !isSelf; // edit & change password allowed here
            const canDeleteAsAdmin = isAdmin && !isSelf;
            const canDeleteAsTeamLead = isTeamLead && !isSelf && String(user.createdBy) === String(session?._id);
            const canDeleteRow = canDeleteAsAdmin || canDeleteAsTeamLead;
            const showMenuRow = canEditRow || canDeleteRow;
            return (
            <article
              key={user._id}
              className='grid grid-cols-4 px-3 py-3 items-center'
            >
              <div className=''>
                {!!user.displayName ? (
                  <>
                    <Link
                      to={"/settings/user/" + user._id}
                      className=' hover:underline font-medium text-blue-600 '
                    >
                      <p>{user.displayName}</p>{" "}
                    </Link>
                    <p className='text-sm'>@{user.username}</p>
                  </>
                ) : (
                  <p>
                    <Link
                      to={"/settings/user/" + user._id}
                      className=' hover:underline font-medium text-blue-600'
                    >
                      {user.username}
                    </Link>
                  </p>
                )}
              </div>
              <p className='px-2 py-1 bg-slate-200 dark:bg-gray-600 rounded text-sm w-fit font-medium'>
                {user.role}
              </p>
              <p>{user.email}</p>
              <div className='flex justify-end'>
                {showMenuRow  && (
                  <DropdownMenu
                    variant='secondary'
                    className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 border border-slate-300'
                    panelClassName='overflow-hidden right-0 text-sm'
                    buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
                  >
                  {canEditRow && (
                    <>
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full'
                      onClick={() => setEditUser(user._id)}
                    >
                      <FontAwesomeIcon icon={faEdit} />
                      Edit
                    </AggieButton>
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full'
                      onClick={() => setEditPassword(user._id)}
                    >
                      <FontAwesomeIcon icon={faUserShield} />
                      Change Password
                    </AggieButton>
                    </>
                  )}
                  {canDeleteRow && (
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-red-600'
                      onClick={() => setRemoveUser(user._id)}
                    >
                      <FontAwesomeIcon icon={faTrashAlt} />
                      Permanently Delete
                    </AggieButton>
                  )}
                  </DropdownMenu>
                )}
              </div>
            </article>
          )})
        ) : (
          <article className='grid py-6 font-medium w-full place-items-center'>
            <p className=''>
              <FontAwesomeIcon
                icon={faRefresh}
                className='animate-spin text-slate-600 dark:text-gray-400'
              />{" "}
              Loading
            </p>
          </article>
        )}
      </div>
      <AggieDialog
        isOpen={!!editUser}
        onClose={() => setEditUser("")}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: editUser === "newUser" ? "Create User" : "Edit user details",
        }}
      >
        <CreateEditUserForm
          user={userToEdit}
          onClose={() => setEditUser("")}
          canEditRole = {!! canEditRole}
          currentUserRole={session?.role as UserRoles | undefined}
        />
      </AggieDialog>
      <AggieDialog
        isOpen={!!editPassword}
        onClose={() => setEditPassword("")}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: `Change password for: ${userFromId(editPassword)?.username}`,
        }}
      >
        <SetPassword
          user={userFromId(editPassword)}
          onClose={() => setEditPassword("")}
        />
      </AggieDialog>

      <ConfirmationDialog
        isOpen={!!removeUser}
        variant='danger'
        disabled={doDeleteUser.isLoading}
        title={`Delete ${userToDelete?.username}'s Account Permanently?`}
        confirmText={"Delete"}
        onClose={() => setRemoveUser("")}
        onConfirm={() => !!userToDelete && doDeleteUser.mutate(userToDelete)}
      ></ConfirmationDialog>
    </div>
  );
};

export default UsersIndex;
