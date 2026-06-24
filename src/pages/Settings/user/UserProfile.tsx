import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { deleteUser, getUser, updateUserTeams } from "../../../api/users";
import type { Session, WebAuthnDevice } from "../../../api/session/types";
import { getTeams } from "../../../api/teams";

import PlaceholderDiv from "../../../components/PlaceholderDiv";

import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import CreateEditUserForm from "./CreateEditUserForm";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import SetPassword from "./SetPassword";
import {
  faEllipsisH,
  faEdit,
  faTrashAlt,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { UserRoles } from "../../../api/users/types";
import SecuritySection from "./components/SecuritySection";

interface IProps {
  session: Session | undefined;
}

const UserProfile = ({ session }: IProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery(["users", params.id], () => {
    if (params.id) return getUser(params.id);
    else return undefined;
  });

  const role = session?.role as UserRoles | undefined;
  const isAdmin = role === "admin";

  const { data: teams } = useQuery(["teams"], getTeams, {
    enabled: isAdmin,
  });

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openEditPassword, setOpenEditPassword] = useState(false);

  const doDeleteUser = useMutation(deleteUser, {
    onSuccess: () => {
      setOpenDelete(false);
      navigate("/settings/users");
    },
  });

    const doUpdateUserTeams = useMutation(updateUserTeams, {
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries(["users"]);
      if (params.id) queryClient.invalidateQueries(["users", params.id]);
    },
  });

  function toggleTeam(teamId: string, checked: boolean) {
  setSelectedTeamIds((current) =>
    checked
      ? [...new Set([...current, teamId])]
      : current.filter((id) => id !== teamId)
  );}

  useEffect(() => {
    setSelectedTeamIds((data?.teams || []).map((team) => team._id));
  }, [data]);

  const isSelf = session?._id === params.id;
  const isTeamLead = role === 'team_lead';
  const canEdit = !!isSelf || (isAdmin && !isSelf);
  const canEditRole = isAdmin && !isSelf;
  const canDeleteAsTeamLead = isTeamLead && !!data && String(data.createdBy) === String(session?._id) && !isSelf;
  const canDeleteAsAdmin = isAdmin && !isSelf;
  const canDelete = canDeleteAsAdmin || canDeleteAsTeamLead;
  const showMenu = !!(isSelf || isAdmin || (isTeamLead && !!data && String(data.createdBy) === String(session?._id)));

  const grid = "grid grid-cols-4 py-1 items-center";

  return (
    <section className={"mt-4 max-w-screen-xl mx-auto"}>
      <div className={`p-3 bg-white dark:bg-gray-800 rounded-xl border border-slate-300`}>
        <div className='flex justify-between items-center'>
          <h2 className='text-3xl font-medium'>{isSelf && "Your "}Profile</h2>
          {showMenu && (
            <DropdownMenu
              variant='secondary'
              className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 border border-slate-300 dark:hover:bg-gray-700'
              panelClassName='overflow-hidden right-0 text-sm'
              buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
            >
              {canEdit && (
                <>
                  <AggieButton
                    className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full dark:text-gray-300'
                    onClick={() => setOpenEdit(true)}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                    Edit
                  </AggieButton>
                  <AggieButton
                    className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full dark:text-gray-300'
                    onClick={() => setOpenEditPassword(true)}
                  >
                    <FontAwesomeIcon icon={faUserShield} />
                    Change Password
                  </AggieButton>
                </>
              )}
              {canDelete && (
                <AggieButton
                  className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-red-600'
                  onClick={() => setOpenDelete(true)}
                >
                  <FontAwesomeIcon icon={faTrashAlt} />
                    Permanently Delete
                </AggieButton>
              )}
            </DropdownMenu>
          )}
        </div>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Display Name</p>
          <p
            className={`text-1xl font-medium inline-flex items-center gap-1 col-span-3  ${grid}`}
          >
            {data?.displayName || "Not Set"}
          </p>
        </PlaceholderDiv>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Username</p>
          <p
            className={`text-1xl font-medium inline-flex items-center gap-1 col-span-3 ${grid}`}
          >
            {data?.username}
          </p>
        </PlaceholderDiv>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Role</p>
          <span className='px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded w-fit border border-slate-300'>
            {data?.role}
          </span>
        </PlaceholderDiv>

        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Email</p>
          <p className='mt-1'>{data?.email}</p>
        </PlaceholderDiv>

                {isAdmin && data && (
          <div className='border-t border-slate-300 mt-3 pt-3'>
            <h3 className='font-medium text-lg mb-2'>Teams</h3>

            {!!teams && teams.length > 0 ? (
              <div className='flex flex-col gap-2'>
                {teams.map((team) => (
                  <label key={team._id} className='flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      checked={selectedTeamIds.includes(team._id)}
                      onChange={(event) => toggleTeam(team._id, event.target.checked)}
                    />
                    <span>
                      {team.name}
                      {team.active === false && " (inactive)"}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className='text-sm text-slate-600 dark:text-gray-300'>
                No teams have been created yet.
              </p>
            )}

            <div className='mt-3'>
              <AggieButton
                variant='primary'
                disabled={doUpdateUserTeams.isLoading}
                loading={doUpdateUserTeams.isLoading}
                onClick={() =>
                  doUpdateUserTeams.mutate({
                    _id: data._id,
                    teams: selectedTeamIds,
                  })
                }
              >
                Save Teams
              </AggieButton>
            </div>
          </div>
        )}

        <SecuritySection
          session={session}
          user={data}
          isSelf={isSelf}
          onUserUpdated={refetch}
        />

      </div>
      <AggieDialog
        isOpen={!!openEdit}
        onClose={() => setOpenEdit(false)}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: "Edit user details",
        }}
      >
        <CreateEditUserForm 
          user={data} 
          onClose={() => setOpenEdit(false)} 
          canEditRole={canEditRole}
          currentUserRole={role}
        />
      </AggieDialog>
      <AggieDialog
        isOpen={!!openEditPassword}
        onClose={() => setOpenEditPassword(false)}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: `Change password`,
        }}
      >
        <SetPassword
          user={session}
          onClose={() => setOpenEditPassword(false)}
        />
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
