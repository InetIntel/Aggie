import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  addTeamMember,
  getTeam,
  removeTeamMember,
  updateTeamMemberPermissions,
  updateTeamPermissionLimits,
  updateTeamStatus,
} from "../../../api/teams";
import type {
  TeamDetailResponse,
  TeamMember,
  TeamPermission,
} from "../../../api/teams/types";
import type { Session } from "../../../api/session/types";
import { searchTeamMemberCandidates } from "../../../api/users";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import AggieSwitch from "../../../components/AggieSwitch";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import CreateEditUserForm from "../user/CreateEditUserForm";

interface IProps {
  session?: Session;
}

type TeamRole = "viewer" | "monitor" | "team_lead";
type TeamTab = "overview" | "members" | "advanced";
type PermissionChoice = "default" | "allow" | "deny";

const teamPermissions: Array<{
  key: TeamPermission;
  label: string;
  description: string;
}> = [
  {
    key: "view data",
    label: "View team data",
    description: "View sources, reports, and incidents available to this team.",
  },
  {
    key: "edit data",
    label: "Edit team data",
    description: "Make changes to reports and incidents available to this team.",
  },
  {
    key: "manage incident access",
    label: "Manage incident access",
    description: "Set or change which teams can access an incident.",
  },
];

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

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (typeof response?.data === "string") return response.data;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

const TeamDetails = ({ session }: IProps) => {
  const params = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<TeamRole>("viewer");
  const [pendingRoles, setPendingRoles] = useState<Record<string, TeamRole>>({});
  const [removingUserId, setRemovingUserId] = useState<string>();
  const [pendingPermission, setPendingPermission] = useState("");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const requestedTab = searchParams.get("tab");
  const activeTab: TeamTab = requestedTab === "members" || requestedTab === "advanced"
    ? requestedTab
    : "overview";
  const isAdmin = session?.role === "admin";
  const isGlobalTeamLead = session?.role === "team_lead";
  const isScopedTeamLead = session?.isTeamLead === true && !isAdmin && !isGlobalTeamLead;

  const { data, isLoading, isError, error } = useQuery(["teams", params.id], () => {
    if (params.id) return getTeam(params.id);
    return undefined;
  });
  const trimmedMemberSearch = memberSearch.trim();

  useEffect(() => {
    if (selectedUserId || trimmedMemberSearch.length < 2) {
      setMemberSearchQuery("");
      return;
    }

    const timeout = window.setTimeout(() => {
      setMemberSearchQuery(trimmedMemberSearch);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [selectedUserId, trimmedMemberSearch]);

  const {
    data: memberCandidates,
    isFetching: isSearchingMembers,
    isError: memberSearchFailed,
  } = useQuery(
    ["users", "member-candidates", memberSearchQuery],
    () => searchTeamMemberCandidates(memberSearchQuery),
    { enabled: memberSearchQuery.length >= 2 }
  );

  const saveTeam = (updatedTeam: TeamDetailResponse) => {
    queryClient.setQueryData(["teams", params.id], updatedTeam);
    queryClient.invalidateQueries(["users"]);
    queryClient.invalidateQueries(["users", "manageable"]);
  };

  const doAddMember = useMutation(addTeamMember, {
    onMutate: () => setActionError(""),
    onSuccess: (updatedTeam: TeamDetailResponse) => {
      saveTeam(updatedTeam);
      setSelectedUserId("");
      setMemberSearch("");
      setSelectedRole("viewer");
    },
    onError: (error) => setActionError(getErrorMessage(error, "Unable to add this member.")),
  });

  const doUpdateRole = useMutation(addTeamMember, {
    onMutate: ({ userId, role }) => {
      setActionError("");
      setPendingRoles((current) => ({
        ...current,
        [userId]: role as TeamRole,
      }));
    },
    onSuccess: saveTeam,
    onError: (error) => setActionError(getErrorMessage(error, "Unable to update this role.")),
    onSettled: (_data, _error, variables) => {
      setPendingRoles((current) => {
        const next = { ...current };
        delete next[variables.userId];
        return next;
      });
    },
  });

  const doRemoveMember = useMutation(removeTeamMember, {
    onMutate: ({ userId }) => {
      setActionError("");
      setRemovingUserId(userId);
    },
    onSuccess: saveTeam,
    onError: (error) => setActionError(getErrorMessage(error, "Unable to remove this member.")),
    onSettled: () => setRemovingUserId(undefined),
  });

  const doUpdateMemberPermissions = useMutation(
    ({
      member,
      permission,
      choice,
    }: {
      member: TeamMember;
      permission: TeamPermission;
      choice: PermissionChoice;
    }) => {
      if (!params.id) throw new Error("Team id is missing.");

      const allow = new Set(member.teamPermissionOverrides?.allow || []);
      const deny = new Set(member.teamPermissionOverrides?.deny || []);
      allow.delete(permission);
      deny.delete(permission);

      if (choice === "allow") allow.add(permission);
      if (choice === "deny") deny.add(permission);

      return updateTeamMemberPermissions({
        teamId: params.id,
        userId: member._id,
        allow: Array.from(allow),
        deny: Array.from(deny),
      });
    },
    {
      onMutate: ({ member, permission }) => {
        setActionError("");
        setPendingPermission(`${member._id}:${permission}`);
      },
      onSuccess: saveTeam,
      onError: (error) => setActionError(
        getErrorMessage(error, "Unable to update this permission.")
      ),
      onSettled: () => setPendingPermission(""),
    }
  );

  const doUpdateTeamLimits = useMutation(updateTeamPermissionLimits, {
    onMutate: () => setActionError(""),
    onSuccess: saveTeam,
    onError: (error) => setActionError(
      getErrorMessage(error, "Unable to update the team limits.")
    ),
  });

  const doUpdateStatus = useMutation(updateTeamStatus, {
    onMutate: () => setActionError(""),
    onSuccess: (updatedTeam) => {
      saveTeam(updatedTeam);
      queryClient.invalidateQueries(["teams"]);
      queryClient.invalidateQueries(["teams", "manageable"]);
      queryClient.invalidateQueries(["teams", "incident-access"]);
    },
    onError: (error) => setActionError(
      getErrorMessage(error, "Unable to update the team status.")
    ),
  });

  const members = data?.members || [];
  const teamLeads = members.filter((member) => getTeamRole(member) === "team_lead");
  const monitors = members.filter((member) => getTeamRole(member) === "monitor");
  const viewers = members.filter((member) => getTeamRole(member) === "viewer");
  const deniedTeamPermissions = data?.team.permissionLimits?.deny || [];
  const existingMemberIds = new Set(members.map((member) => member._id));
  const selectableUsers = (memberCandidates || []).filter(
    (user) => !existingMemberIds.has(user._id)
  );
  const searchIsPending =
    trimmedMemberSearch.length >= 2 && memberSearchQuery !== trimmedMemberSearch;
  const isSaving =
    doAddMember.isLoading ||
    doUpdateRole.isLoading ||
    doRemoveMember.isLoading ||
    doUpdateMemberPermissions.isLoading ||
    doUpdateTeamLimits.isLoading ||
    doUpdateStatus.isLoading;

  const setTab = (tab: TeamTab) => {
    setSearchParams(tab === "overview" ? {} : { tab });
  };

  const getPermissionChoice = (
    member: TeamMember,
    permission: TeamPermission
  ): PermissionChoice => {
    if (member.teamPermissionOverrides?.allow.includes(permission)) return "allow";
    if (member.teamPermissionOverrides?.deny.includes(permission)) return "deny";
    return "default";
  };

  if (isError) {
    return (
      <section className='mt-4'>
        <Link to='/settings/teams' className='text-sm text-lime-800 hover:underline'>
          Back to Teams
        </Link>
        <div className='mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800'>
          {getErrorMessage(error, "Unable to load this team.")}
        </div>
      </section>
    );
  }

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
            {isAdmin ? (
              <div className='flex items-center gap-2 text-sm px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded border border-slate-300'>
                <span>{data?.team.active === false ? "Inactive" : "Active"}</span>
                <AggieSwitch
                  checked={data?.team.active !== false}
                  disabled={!data || doUpdateStatus.isLoading}
                  label='Change team status'
                  onChange={() => {
                    if (!params.id || !data) return;
                    doUpdateStatus.mutate({
                      teamId: params.id,
                      active: data.team.active === false,
                    });
                  }}
                />
              </div>
            ) : (
              <span className='text-sm px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded border border-slate-300'>
                {data?.team.active === false ? "Inactive" : "Active"}
              </span>
            )}
          </div>

          <div aria-live='polite'>
            {actionError && (
              <p className='mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800'>
                {actionError}
              </p>
            )}
            {isSaving && !actionError && (
              <p className='mt-3 text-sm text-slate-600 dark:text-gray-300'>
                Saving changes...
              </p>
            )}
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
            <button
              type='button'
              className={`px-3 py-2 text-sm font-medium border-b-2 ${
                activeTab === "advanced"
                  ? "border-lime-700 text-lime-800"
                  : "border-transparent text-slate-600"
              }`}
              onClick={() => setTab("advanced")}
            >
              Advanced
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
        ) : activeTab === "members" ? (
          <div className='grid gap-4 mt-4'>
            <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-4'>
              <div className='flex justify-between items-center gap-3 mb-3'>
                <div>
                  <h3 className='text-xl font-medium'>Add team member</h3>
                  <p className='text-sm text-slate-600 dark:text-gray-300 mt-1'>
                    Add an existing account or create a new one. Permission exceptions are available under Advanced.
                  </p>
                </div>
                <AggieButton
                  type='button'
                  variant='secondary'
                  className='px-3 py-2 text-sm'
                  disabled={data?.team.active === false}
                  onClick={() => setCreateUserOpen(true)}
                >
                  Create new member
                </AggieButton>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-[1fr_180px_120px] gap-2 items-end'>
                <div className='flex flex-col gap-1 text-sm'>
                  <label htmlFor='team-member-search' className='font-medium'>User</label>
                  <div className='relative'>
                    <input
                      id='team-member-search'
                      type='search'
                      className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700 w-full'
                      value={memberSearch}
                      placeholder='Search by name or username'
                      disabled={data?.team.active === false}
                      onChange={(event) => {
                        setMemberSearch(event.target.value);
                        setSelectedUserId("");
                      }}
                    />

                    {!selectedUserId && trimmedMemberSearch.length >= 2 && (
                      <div className='absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded border border-slate-300 bg-white dark:bg-gray-800 shadow-lg'>
                        {searchIsPending || isSearchingMembers ? (
                          <p className='px-3 py-2 text-slate-600 dark:text-gray-300'>
                            Searching...
                          </p>
                        ) : memberSearchFailed ? (
                          <p className='px-3 py-2 text-red-700'>Search failed. Try again.</p>
                        ) : selectableUsers.length > 0 ? (
                          selectableUsers.map((user) => (
                            <button
                              key={user._id}
                              type='button'
                              className='block w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-gray-700'
                              onClick={() => {
                                setSelectedUserId(user._id);
                                setMemberSearch(user.displayName || user.username);
                              }}
                            >
                              <span className='font-medium'>
                                {user.displayName || user.username}
                              </span>
                              {user.displayName && (
                                <span className='ml-2 text-slate-600 dark:text-gray-300'>
                                  {user.username}
                                </span>
                              )}
                            </button>
                          ))
                        ) : (
                          <p className='px-3 py-2 text-slate-600 dark:text-gray-300'>
                            No available users found
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <label className='flex flex-col gap-1 text-sm'>
                  <span className='font-medium'>Role on this team</span>
                  <select
                    className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
                    value={selectedRole}
                    disabled={data?.team.active === false || doAddMember.isLoading}
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
                  disabled={
                    !params.id ||
                    !selectedUserId ||
                    doAddMember.isLoading ||
                    data?.team.active === false
                  }
                  onClick={() => {
                    if (!params.id || !selectedUserId) return;
                    doAddMember.mutate({
                      teamId: params.id,
                      userId: selectedUserId,
                      role: selectedRole,
                    });
                  }}
                >
                  {doAddMember.isLoading ? "Adding..." : "Add"}
                </button>
              </div>
              {selectedUserId && (
                <p className='text-xs text-slate-600 dark:text-gray-300 mt-2'>
                  Selected: {memberSearch}
                </p>
              )}
              {data?.team.active === false && (
                <p className='text-sm text-slate-600 dark:text-gray-300 mt-3'>
                  Reactivate this team before adding new members.
                </p>
              )}
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
        ) : (
          <div className='grid gap-4 mt-4'>
            <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-4'>
              <h3 className='text-xl font-medium'>Team-wide limits</h3>
              <p className='text-sm text-slate-600 dark:text-gray-300 mt-1'>
                These limits apply to everyone on the team, even when a member has a broader role.
              </p>

              <div className='grid md:grid-cols-2 gap-3 mt-4'>
                {teamPermissions
                  .filter((permission) => permission.key !== "view data")
                  .map((permission) => {
                    const blocked = deniedTeamPermissions.includes(permission.key);

                    return (
                      <div
                        key={permission.key}
                        className='flex items-start justify-between gap-4 rounded border border-slate-300 p-3'
                      >
                        <span>
                          <span className='font-medium'>{permission.label}</span>
                          <span className='block text-sm text-slate-600 dark:text-gray-300 mt-1'>
                            {permission.description}
                          </span>
                        </span>
                        <span className='flex items-center gap-2 shrink-0 text-sm'>
                          <span>{blocked ? "Blocked" : "Allowed"}</span>
                          <AggieSwitch
                            checked={!blocked}
                            disabled={!isAdmin || !params.id || doUpdateTeamLimits.isLoading}
                            label={`Allow ${permission.label.toLowerCase()}`}
                            onChange={() => {
                              if (!params.id) return;
                              const deny = blocked
                                ? deniedTeamPermissions.filter((item) => item !== permission.key)
                                : [...deniedTeamPermissions, permission.key];
                              doUpdateTeamLimits.mutate({ teamId: params.id, deny });
                            }}
                          />
                        </span>
                      </div>
                    );
                  })}
              </div>

              {!isAdmin && (
                <p className='text-sm text-slate-600 dark:text-gray-300 mt-3'>
                  Only an administrator can change limits for the whole team.
                </p>
              )}
            </div>

            <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 overflow-hidden'>
              <div className='p-4 border-b border-slate-300'>
                <h3 className='text-xl font-medium'>Member permission exceptions</h3>
                <p className='text-sm text-slate-600 dark:text-gray-300 mt-1'>
                  Use the team role by default, or make an exception for one member on this team.
                </p>
              </div>

              {members.length > 0 ? (
                members.map((member) => {
                  const savedRole = getTeamRole(member);
                  const memberIsAdmin = member.accountRole === "admin";
                  const canEditPermissions =
                    !memberIsAdmin && (isAdmin || savedRole !== "team_lead");

                  return (
                    <article
                      key={member._id}
                      className='grid gap-4 p-4 lg:grid-cols-[180px_minmax(0,1fr)] border-b border-slate-200 last:border-b-0'
                    >
                      <div>
                        <p className='font-medium'>{member.displayName || member.username}</p>
                        <p className='text-xs text-slate-600 dark:text-gray-300 mt-1'>
                          {roleLabels[savedRole]}
                        </p>
                      </div>

                      <div className='grid gap-3 sm:grid-cols-3'>
                        {teamPermissions.map((permission) => {
                          const choice = getPermissionChoice(member, permission.key);
                          const blockedByTeam = deniedTeamPermissions.includes(permission.key);
                          const allowed = member.teamPermissions?.includes(permission.key) === true;
                          const pendingKey = `${member._id}:${permission.key}`;

                          return (
                            <label key={permission.key} className='flex flex-col gap-1 text-sm min-w-0'>
                              <span className='font-medium'>{permission.label}</span>
                              <select
                                className='px-2 py-1 rounded border border-slate-300 dark:bg-gray-700 w-full min-w-0'
                                value={choice}
                                disabled={
                                  !canEditPermissions ||
                                  pendingPermission === pendingKey ||
                                  blockedByTeam
                                }
                                onChange={(event) => {
                                  doUpdateMemberPermissions.mutate({
                                    member,
                                    permission: permission.key,
                                    choice: event.target.value as PermissionChoice,
                                  });
                                }}
                              >
                                <option value='default'>Use team role</option>
                                <option value='allow'>Allow</option>
                                <option value='deny'>Deny</option>
                              </select>
                              <span
                                className={`w-fit rounded-full px-2 py-0.5 text-xs ${
                                  blockedByTeam || !allowed
                                    ? "bg-slate-200 text-slate-700 dark:bg-gray-700 dark:text-gray-200"
                                    : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                                }`}
                              >
                                {pendingPermission === pendingKey
                                  ? "Saving..."
                                  : blockedByTeam
                                    ? "Blocked for team"
                                    : allowed
                                      ? "Allowed"
                                      : "Not allowed"}
                              </span>
                            </label>
                          );
                        })}
                      </div>
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
            queryClient.invalidateQueries(["users", "member-candidates"]);
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
