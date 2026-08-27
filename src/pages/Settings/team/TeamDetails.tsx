import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { addTeamMember, getTeam, removeTeamMember } from "../../../api/teams";
import type { TeamDetailResponse, TeamMember } from "../../../api/teams/types";
import type { Session } from "../../../api/session/types";
import { getManageableUsers } from "../../../api/users";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import CreateEditUserForm from "../user/CreateEditUserForm";

interface IProps {
  session?: Session;
}

type TeamRole = "viewer" | "monitor" | "team_lead";

const roleLabels: Record<TeamRole, string> = {
  viewer: "Viewer",
  monitor: "Monitor",
  team_lead: "Team Lead",
};

const roleAccess: Record<TeamRole, string> = {
  viewer: "Can view team data",
  monitor: "Can view and edit team data",
  team_lead: "Can manage members and team access",
};

const getTeamRole = (member: TeamMember): TeamRole => {
  if (member.isTeamLead || member.teamRole === "team_lead") return "team_lead";
  return member.teamRole === "monitor" ? "monitor" : "viewer";
};

const TeamDetails = ({ session }: IProps) => {
  const params = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<TeamRole>("viewer");
  const [pendingRoles, setPendingRoles] = useState<Record<string, TeamRole>>({});
  const [removingUserId, setRemovingUserId] = useState<string>();
  const [createUserOpen, setCreateUserOpen] = useState(false);

  const activeTab = searchParams.get("tab") === "members" ? "members" : "overview";
  const isAdmin = session?.role === "admin";
  const isGlobalTeamLead = session?.role === "team_lead";
  const isScopedTeamLead = session?.isTeamLead === true && !isAdmin && !isGlobalTeamLead;

  const { data, isLoading } = useQuery(["teams", params.id], () => {
    if (params.id) return getTeam(params.id);
    return undefined;
  });
  const { data: users } = useQuery(["users", "manageable"], getManageableUsers);

  const saveTeam = (updatedTeam: TeamDetailResponse) => {
    queryClient.setQueryData(["teams", params.id], updatedTeam);
    queryClient.invalidateQueries(["users"]);
    queryClient.invalidateQueries(["users", "manageable"]);
  };

  const doAddMember = useMutation(addTeamMember, {
    onSuccess: (updatedTeam: TeamDetailResponse) => {
      saveTeam(updatedTeam);
      setSelectedUserId("");
      setSelectedRole("viewer");
    },
  });

  const doUpdateRole = useMutation(addTeamMember, {
    onMutate: ({ userId, role }) => {
      setPendingRoles((current) => ({
        ...current,
        [userId]: role as TeamRole,
      }));
    },
    onSuccess: saveTeam,
    onSettled: (_data, _error, variables) => {
      setPendingRoles((current) => {
        const next = { ...current };
        delete next[variables.userId];
        return next;
      });
    },
  });

  const doRemoveMember = useMutation(removeTeamMember, {
    onMutate: ({ userId }) => setRemovingUserId(userId),
    onSuccess: saveTeam,
    onSettled: () => setRemovingUserId(undefined),
  });

  const members = data?.members || [];
  const teamLeads = members.filter((member) => getTeamRole(member) === "team_lead");
  const monitors = members.filter((member) => getTeamRole(member) === "monitor");
  const viewers = members.filter((member) => getTeamRole(member) === "viewer");
  const existingMemberIds = new Set(members.map((member) => member._id));
  const selectableUsers = (users || []).filter(
    (user) =>
      user._id !== session?._id &&
      user.role !== "admin" &&
      !existingMemberIds.has(user._id)
  );

  const setTab = (tab: "overview" | "members") => {
    setSearchParams(tab === "members" ? { tab: "members" } : {});
  };

  return (
    <section className='mt-4'>
      <Link to='/settings/teams' className='text-sm text-lime-800 hover:underline'>
        Back to Teams
      </Link>

      <PlaceholderDiv loading={isLoading}>
        <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-4 mt-3'>
          <div className='flex justify-between items-start gap-3'>
            <div>
              <h2 className='text-3xl font-medium'>{data?.team.name || "Team"}</h2>
              <p className='text-sm text-slate-600 dark:text-gray-300 mt-1'>
                {data?.team.description || "No description"}
              </p>
            </div>
            <span className='text-sm px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded border border-slate-300'>
              {data?.team.active === false ? "Inactive" : "Active"}
            </span>
          </div>

          <div className='flex gap-2 mt-5 border-b border-slate-300'>
            <button
              type='button'
              className={`px-3 py-2 text-sm font-medium border-b-2 ${
                activeTab === "overview"
                  ? "border-lime-700 text-lime-800"
                  : "border-transparent text-slate-600"
              }`}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              type='button'
              className={`px-3 py-2 text-sm font-medium border-b-2 ${
                activeTab === "members"
                  ? "border-lime-700 text-lime-800"
                  : "border-transparent text-slate-600"
              }`}
              onClick={() => setTab("members")}
            >
              Members &amp; Access
            </button>
          </div>
        </div>

        {activeTab === "overview" ? (
          <div className='grid gap-4 mt-4'>
            <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
              {[
                ["Members", members.length],
                ["Team Leads", teamLeads.length],
                ["Monitors", monitors.length],
                ["Viewers", viewers.length],
              ].map(([label, count]) => (
                <div
                  key={label}
                  className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-4'
                >
                  <p className='text-sm text-slate-600 dark:text-gray-300'>{label}</p>
                  <p className='text-3xl font-medium mt-1'>{count}</p>
                </div>
              ))}
            </div>

            <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-4'>
              <h3 className='text-xl font-medium'>Team access</h3>
              <div className='grid md:grid-cols-3 gap-3 mt-3'>
                {(Object.keys(roleLabels) as TeamRole[]).map((role) => (
                  <div key={role} className='rounded border border-slate-300 p-3'>
                    <p className='font-medium'>{roleLabels[role]}</p>
                    <p className='text-sm text-slate-600 dark:text-gray-300 mt-1'>
                      {roleAccess[role]}
                    </p>
                  </div>
                ))}
              </div>
              <AggieButton
                type='button'
                variant='secondary'
                className='mt-4'
                onClick={() => setTab("members")}
              >
                Manage members
              </AggieButton>
            </div>
          </div>
        ) : (
          <div className='grid gap-4 mt-4'>
            <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-4'>
              <div className='flex justify-between items-center gap-3 mb-3'>
                <div>
                  <h3 className='text-xl font-medium'>Add team member</h3>
                  <p className='text-sm text-slate-600 dark:text-gray-300 mt-1'>
                    Account roles and individual permissions are managed from the user profile.
                  </p>
                </div>
                <AggieButton
                  type='button'
                  variant='secondary'
                  className='px-3 py-2 text-sm'
                  onClick={() => setCreateUserOpen(true)}
                >
                  Create new member
                </AggieButton>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-[1fr_180px_120px] gap-2 items-end'>
                <label className='flex flex-col gap-1 text-sm'>
                  <span className='font-medium'>User</span>
                  <select
                    className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                  >
                    <option value=''>Select user</option>
                    {selectableUsers.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.displayName || user.username} ({user.email})
                      </option>
                    ))}
                  </select>
                </label>

                <label className='flex flex-col gap-1 text-sm'>
                  <span className='font-medium'>Role on this team</span>
                  <select
                    className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value as TeamRole)}
                  >
                    <option value='viewer'>Viewer</option>
                    <option value='monitor'>Monitor</option>
                    {isAdmin && <option value='team_lead'>Team Lead</option>}
                  </select>
                </label>

                <button
                  type='button'
                  className='px-3 py-2 rounded bg-lime-700 text-white disabled:opacity-50'
                  disabled={!params.id || !selectedUserId || doAddMember.isLoading}
                  onClick={() => {
                    if (!params.id || !selectedUserId) return;
                    doAddMember.mutate({
                      teamId: params.id,
                      userId: selectedUserId,
                      role: selectedRole,
                    });
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 overflow-x-auto'>
              <div className='grid min-w-[850px] grid-cols-[minmax(180px,1.4fr)_130px_180px_minmax(180px,1fr)_80px] gap-3 px-4 py-3 text-sm font-medium border-b border-slate-300'>
                <p>Member</p>
                <p>Account role</p>
                <p>Role on this team</p>
                <p>Team access</p>
                <span />
              </div>

              {members.length > 0 ? (
                members.map((member) => {
                  const savedRole = getTeamRole(member);
                  const displayedRole = pendingRoles[member._id] || savedRole;
                  const memberIsAdmin = member.accountRole === "admin";
                  const canEditRole = isAdmin || (!memberIsAdmin && savedRole !== "team_lead");
                  const canRemove = isAdmin || (!memberIsAdmin && savedRole !== "team_lead");

                  return (
                    <article
                      key={member._id}
                      className='grid min-w-[850px] grid-cols-[minmax(180px,1.4fr)_130px_180px_minmax(180px,1fr)_80px] gap-3 px-4 py-3 items-center border-b border-slate-200 last:border-b-0'
                    >
                      <div>
                        <p className='font-medium'>{member.displayName || member.username}</p>
                        <p className='text-xs text-slate-600 dark:text-gray-300 mt-1'>
                          {member.email}
                        </p>
                      </div>
                      <p className='text-sm capitalize'>{member.accountRole || member.role}</p>
                      {canEditRole ? (
                        <select
                          className='px-2 py-1 rounded border border-slate-300 dark:bg-gray-700 text-sm'
                          value={displayedRole}
                          disabled={!params.id || doUpdateRole.isLoading}
                          onChange={(event) => {
                            if (!params.id) return;
                            doUpdateRole.mutate({
                              teamId: params.id,
                              userId: member._id,
                              role: event.target.value,
                            });
                          }}
                        >
                          <option value='viewer'>Viewer</option>
                          <option value='monitor'>Monitor</option>
                          {isAdmin && <option value='team_lead'>Team Lead</option>}
                        </select>
                      ) : (
                        <p className='text-sm'>{roleLabels[savedRole]}</p>
                      )}
                      <p className='text-sm text-slate-600 dark:text-gray-300'>
                        {roleAccess[displayedRole]}
                      </p>
                      {canRemove ? (
                        <button
                          type='button'
                          className='text-sm text-red-700 hover:underline disabled:opacity-50'
                          disabled={removingUserId === member._id}
                          onClick={() => {
                            if (!params.id) return;
                            doRemoveMember.mutate({ teamId: params.id, userId: member._id });
                          }}
                        >
                          Remove
                        </button>
                      ) : (
                        <span />
                      )}
                    </article>
                  );
                })
              ) : (
                <div className='px-4 py-6 text-sm text-slate-600 dark:text-gray-300'>
                  No members are assigned to this team.
                </div>
              )}
            </div>
          </div>
        )}
      </PlaceholderDiv>

      <AggieDialog
        isOpen={createUserOpen}
        onClose={() => setCreateUserOpen(false)}
        className='px-3 py-4 w-full max-w-lg'
        data={{ title: `Create member for ${data?.team.name || "team"}` }}
      >
        <CreateEditUserForm
          onClose={() => {
            setCreateUserOpen(false);
            queryClient.invalidateQueries(["teams", params.id]);
            queryClient.invalidateQueries(["users", "manageable"]);
          }}
          currentUserRole={session?.role}
          scopedTeamLead={isScopedTeamLead}
          creationTeamIds={params.id ? [params.id] : []}
        />
      </AggieDialog>
    </section>
  );
};

export default TeamDetails;
