import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteUser, getUser } from "../../../api/users";
import type { Session } from "../../../api/session/types";
import {
  addTeamMember,
  getManageableTeams,
  removeTeamMember,
} from "../../../api/teams";

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
import PermissionEditor from "./components/PermissionEditor";
import DisplayPreferencesSection from "./components/DisplayPreferencesSection";

interface IProps {
  session: Session | undefined;
}

type TeamRole = "viewer" | "monitor" | "team_lead";

const UserProfile = ({ session }: IProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery(["users", params.id], () => {
    if (params.id) return getUser(params.id);
    else return undefined;
  });

  const role = session?.role as UserRoles | undefined;
  const isAdmin = role === "admin";
  const isTeamLead = role === "team_lead";
  const isSelf = session?._id === params.id;

  const { data: teams } = useQuery(["teams", "manageable"], getManageableTeams, {
    enabled: isAdmin || isTeamLead,
  });

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedTeamRole, setSelectedTeamRole] = useState<TeamRole>("viewer");
  const [updatingTeamId, setUpdatingTeamId] = useState<string>();

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

  const refreshMemberships = () => {
    refetch();
    queryClient.invalidateQueries(["users"]);
    queryClient.invalidateQueries(["teams"]);
  };

  const doAddTeam = useMutation(addTeamMember, {
    onSuccess: () => {
      refreshMemberships();
      setSelectedTeamId("");
      setSelectedTeamRole("viewer");
    },
  });

  const doUpdateTeam = useMutation(addTeamMember, {
    onMutate: ({ teamId }) => setUpdatingTeamId(teamId),
    onSuccess: refreshMemberships,
    onError: refreshMemberships,
    onSettled: () => setUpdatingTeamId(undefined),
  });

  const doRemoveTeam = useMutation(removeTeamMember, {
    onMutate: ({ teamId }) => setUpdatingTeamId(teamId),
    onSuccess: refreshMemberships,
    onSettled: () => setUpdatingTeamId(undefined),
  });

  const targetRole = data?.role;
  const canManageUserTeams =
    (isAdmin && !isSelf && targetRole !== "admin") ||
    (
      isTeamLead &&
      !isSelf &&
      !!targetRole &&
      ["viewer", "monitor"].includes(targetRole)
    );

  const manageableTeamIds = new Set((teams || []).map((team) => team._id));
  const currentMemberships = (data?.teams || []).filter((team) =>
    manageableTeamIds.has(team._id)
  );
  const currentTeamIds = new Set(currentMemberships.map((team) => team._id));
  const availableTeams = (teams || []).filter(
    (team) => team.active !== false && !currentTeamIds.has(team._id)
  );
  const teamRoleById = new Map(
    (data?.teamMemberships || []).map((membership) => [
      typeof membership.team === "string" ? membership.team : membership.team._id,
      membership.role,
    ])
  );
  const fallbackTeamRole: TeamRole = targetRole === "monitor"
    ? "monitor"
    : targetRole === "team_lead"
      ? "team_lead"
      : "viewer";

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

        {isSelf && !canManageUserTeams && data && (
          <div className='border-t border-slate-300 mt-3 pt-3'>
            <h3 className='font-medium text-lg mb-1'>Your Teams</h3>
            <p className='text-sm text-slate-600 dark:text-gray-300 mb-3'>
              These memberships determine which restricted sources and reports you can access.
            </p>

            {data.teams && data.teams.length > 0 ? (
              <div className='grid gap-2 sm:grid-cols-2'>
                {data.teams.map((team) => (
                  <div
                    key={team._id}
                    className='rounded border border-slate-300 bg-slate-50 p-3 dark:bg-gray-900'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <span className='font-medium'>{team.name}</span>
                      {team.active === false && (
                        <span className='rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-gray-700 dark:text-gray-300'>
                          Inactive
                        </span>
                      )}
                    </div>
                    {team.description && (
                      <p className='mt-1 text-sm text-slate-600 dark:text-gray-300'>
                        {team.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-sm text-slate-600 dark:text-gray-300'>
                You are not currently assigned to any teams.
              </p>
            )}
          </div>
        )}

        {canManageUserTeams && data && (
          <div className='border-t border-slate-300 mt-3 pt-3'>
            <h3 className='font-medium text-lg'>Team memberships</h3>
            <p className='text-sm text-slate-600 dark:text-gray-300 mt-1 mb-3'>
              Add a team here or change the role this user has on a team.
            </p>

            <div className='grid grid-cols-1 md:grid-cols-[1fr_180px_110px] gap-2 items-end mb-3'>
              <label className='flex flex-col gap-1 text-sm'>
                <span className='font-medium'>Team</span>
                <select
                  className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                >
                  <option value=''>Select team</option>
                  {availableTeams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.name}{team.active === false ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                <span className='font-medium'>Role on team</span>
                <select
                  className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
                  value={selectedTeamRole}
                  onChange={(event) => setSelectedTeamRole(event.target.value as TeamRole)}
                >
                  <option value='viewer'>Viewer</option>
                  <option value='monitor'>Monitor</option>
                  {isAdmin && <option value='team_lead'>Team Lead</option>}
                </select>
              </label>

              <AggieButton
                variant='primary'
                disabled={!selectedTeamId || doAddTeam.isLoading}
                loading={doAddTeam.isLoading}
                onClick={() => {
                  if (!selectedTeamId) return;
                  doAddTeam.mutate({
                    teamId: selectedTeamId,
                    userId: data._id,
                    role: selectedTeamRole,
                  });
                }}
              >
                Add
              </AggieButton>
            </div>

            <div className='rounded border border-slate-300 overflow-x-auto'>
              <div className='grid min-w-[640px] grid-cols-[1fr_160px_110px] gap-3 px-3 py-2 text-sm font-medium border-b border-slate-300'>
                <p>Team</p>
                <p>Role</p>
                <span />
              </div>
              {currentMemberships.length > 0 ? (
                currentMemberships.map((team) => {
                  const teamRole = teamRoleById.get(team._id) || fallbackTeamRole;
                  const canChangeRole = isAdmin || teamRole !== "team_lead";

                  return (
                    <div
                      key={team._id}
                      className='grid min-w-[640px] grid-cols-[1fr_160px_110px] gap-3 px-3 py-2 items-center border-b border-slate-200 last:border-b-0'
                    >
                      <div>
                        <Link
                          to={`/settings/team/${team._id}?tab=members`}
                          className='font-medium text-lime-800 hover:underline'
                        >
                          {team.name}
                        </Link>
                        {team.active === false && (
                          <span className='text-xs text-slate-500 ml-2'>Inactive</span>
                        )}
                      </div>

                      {canChangeRole ? (
                        <select
                          key={`${team._id}-${teamRole}`}
                          className='px-2 py-1 rounded border border-slate-300 dark:bg-gray-700 text-sm'
                          defaultValue={teamRole}
                          disabled={updatingTeamId === team._id}
                          onChange={(event) =>
                            doUpdateTeam.mutate({
                              teamId: team._id,
                              userId: data._id,
                              role: event.target.value,
                            })
                          }
                        >
                          <option value='viewer'>Viewer</option>
                          <option value='monitor'>Monitor</option>
                          {isAdmin && <option value='team_lead'>Team Lead</option>}
                        </select>
                      ) : (
                        <p className='text-sm'>Team Lead</p>
                      )}

                      {canChangeRole ? (
                        <button
                          type='button'
                          className='text-sm text-red-700 hover:underline disabled:opacity-50'
                          disabled={updatingTeamId === team._id}
                          onClick={() =>
                            doRemoveTeam.mutate({
                              teamId: team._id,
                              userId: data._id,
                            })
                          }
                        >
                          Remove
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })
              ) : (
                <p className='px-3 py-4 text-sm text-slate-600 dark:text-gray-300'>
                  This user is not assigned to a team you manage.
                </p>
              )}
            </div>
          </div>
        )}

        {isAdmin && !isSelf && data && data.role !== "admin" && (
          <PermissionEditor userId={data._id} />
        )}
        {isSelf && <DisplayPreferencesSection user={data} />}

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
