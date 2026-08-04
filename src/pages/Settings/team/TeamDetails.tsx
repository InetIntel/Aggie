import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { addTeamMember, getTeam, removeTeamMember } from "../../../api/teams";
import { getManageableUsers } from "../../../api/users";
import type { TeamMember, TeamDetailResponse } from "../../../api/teams/types";
import type { Session } from "../../../api/session/types";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import CreateEditUserForm from "../user/CreateEditUserForm";

import { useState } from "react";

const MemberList = ({
  title,
  members,
  onRemove,
  removingUserId,
}: {
  title: string;
  members: TeamMember[];
  onRemove?: (userId: string) => void;
  removingUserId?: string;
}) => {
  return (
    <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 overflow-hidden'>
      <div className='px-3 py-3 font-medium border-b border-slate-300'>
        {title}
      </div>

      {members.length > 0 ? (
        members.map((member) => (
          <article
            key={member._id}
            className={`grid ${
              onRemove ? "grid-cols-[1fr_1fr_120px_90px]" : "grid-cols-3"
            } px-3 py-3 border-b border-slate-200 last:border-b-0 items-center gap-2`}
          >
            <p className='font-medium'>
              {member.displayName || member.username}
            </p>
            <p className='text-sm text-slate-600 dark:text-gray-300'>
              {member.email}
            </p>
            <p className='text-sm'>
              {member.isTeamLead
                ? member.role === "team_lead"
                  ? "Team Lead"
                  : `Team Lead · ${member.role}`
                : member.role}
            </p>
            {onRemove && (
            <button
             type='button'
              className='text-sm text-red-700 hover:underline disabled:opacity-50'
              disabled={removingUserId === member._id}
              onClick={() => onRemove(member._id)}
            >
              Remove
            </button>
          )}
          </article>
        ))
      ) : (
        <div className='px-3 py-4 text-sm text-slate-600 dark:text-gray-300'>
          No users in this group.
        </div>
      )}
    </div>
  );
};

interface IProps {
  session?: Session;
}

const TeamDetails = ({ session }: IProps) => {
  const params = useParams();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("viewer");
  const [removingUserId, setRemovingUserId] = useState<string | undefined>();
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const { data: users } = useQuery(["users", "manageable"], getManageableUsers);
  const doAddMember = useMutation(addTeamMember, {
  onSuccess: (updatedTeam: TeamDetailResponse) => {
    queryClient.setQueryData(["teams", params.id], updatedTeam);
    queryClient.invalidateQueries(["users"]);
    queryClient.invalidateQueries(["users", "manageable"]);
    setSelectedUserId("");
    setSelectedRole("viewer");
  },
});

const doRemoveMember = useMutation(removeTeamMember, {
  onMutate: (variables) => {
    setRemovingUserId(variables.userId);
  },
  onSuccess: (updatedTeam: TeamDetailResponse) => {
    queryClient.setQueryData(["teams", params.id], updatedTeam);
    queryClient.invalidateQueries(["users"]);
    queryClient.invalidateQueries(["users", "manageable"]);
  },
  onSettled: () => {
    setRemovingUserId(undefined);
  },
});

const { data, isLoading } = useQuery(["teams", params.id], () => {
    if (params.id) return getTeam(params.id);
    return undefined;
  });

const members = data?.members || [];

const existingMemberIds = new Set(members.map((member) => member._id));

const availableUsers =
  users?.filter((user) => !existingMemberIds.has(user._id)) || [];

  const explicitLeadIds = new Set(
    (data?.team.leads || []).map((lead) =>
      typeof lead === "string" ? lead : lead._id
    )
  );
  const isLeadMember = (member: TeamMember) =>
    member.isTeamLead === true ||
    explicitLeadIds.has(member._id) ||
    member.role === "team_lead";
  const teamLeads = members.filter(isLeadMember);
  const isTeamLead = session?.role === "team_lead";
  const isScopedTeamLead = session?.isTeamLead === true &&
    session.role !== "admin" &&
    session.role !== "team_lead";
  const monitors = members.filter(
    (member) => !isLeadMember(member) && member.role === "monitor"
  );
  const viewers = members.filter(
    (member) => !isLeadMember(member) && member.role === "viewer"
  );
  const admins = members.filter(
    (member) => !isLeadMember(member) && member.role === "admin"
  );
  const otherMembers = members.filter(
    (member) =>
      !isLeadMember(member) &&
      !["admin", "team_lead", "monitor", "viewer"].includes(member.role)
  );

  return (
    <section className='mt-4'>
      <div className='mb-3'>
        <Link
          to='/settings/teams'
          className='text-sm text-lime-800 hover:underline'
        >
          Back to Teams
        </Link>
        {isTeamLead && (
  <p className='text-sm text-slate-600 dark:text-gray-300 mt-2'>
    Viewing team membership as a team lead.
  </p>
)}
      </div>

      <PlaceholderDiv loading={isLoading}>
        <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-3 mb-4'>
          <div className='flex justify-between items-start gap-3'>
            <div>
              <h2 className='text-3xl font-medium'>
                {data?.team.name || "Team"}
              </h2>
              <p className='text-sm text-slate-600 dark:text-gray-300 mt-1'>
                {data?.team.description || "No description"}
              </p>
            </div>

            <span className='text-sm px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded border border-slate-300'>
              {data?.team.active === false ? "Inactive" : "Active"}
            </span>
          </div>
        </div>
        <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-3 mb-4'>
  <div className='flex justify-between items-center gap-3 mb-2'>
    <h3 className='text-xl font-medium'>Add team member</h3>
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
        onChange={(event) => {
          const userId = event.target.value;
          setSelectedUserId(userId);
          if (isScopedTeamLead) {
            const selectedUser = availableUsers.find((user) => user._id === userId);
            if (selectedUser && ["viewer", "monitor"].includes(selectedUser.role)) {
              setSelectedRole(selectedUser.role);
            }
          }
        }}
      >
        <option value=''>Select user</option>
        {availableUsers.map((user) => (
          <option key={user._id} value={user._id}>
            {user.displayName || user.username} ({user.email})
          </option>
        ))}
      </select>
    </label>

    <label className='flex flex-col gap-1 text-sm'>
      <span className='font-medium'>Role</span>
      <select
        className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
        value={selectedRole}
        onChange={(event) => setSelectedRole(event.target.value)}
        disabled={isScopedTeamLead}
      >
        <option value='viewer'>Viewer</option>
        <option value='monitor'>Monitor</option>
        <option value='team_lead_scoped'>Team Lead (this team only)</option>
        <option value='team_lead'>Team Lead (legacy global)</option>
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

  <p className='text-xs text-slate-500 dark:text-gray-400 mt-2'>
    {isScopedTeamLead
      ? "Scoped team leads can add members without changing their global role."
      : "Use the team-only option for new leads. The legacy global option remains available during the compatibility period."}
  </p>
</div>

        <div className='flex flex-col gap-4'>
         <MemberList
  title={`Team Leads (${teamLeads.length})`}
  members={teamLeads}
  removingUserId={removingUserId}
  onRemove={(userId) => {
    if (!params.id) return;
    doRemoveMember.mutate({ teamId: params.id, userId });
  }}
/>

<MemberList
  title={`Monitors (${monitors.length})`}
  members={monitors}
  removingUserId={removingUserId}
  onRemove={(userId) => {
    if (!params.id) return;
    doRemoveMember.mutate({ teamId: params.id, userId });
  }}
/>

<MemberList
  title={`Viewers (${viewers.length})`}
  members={viewers}
  removingUserId={removingUserId}
  onRemove={(userId) => {
    if (!params.id) return;
    doRemoveMember.mutate({ teamId: params.id, userId });
  }}
/>

          {admins.length > 0 && (
            <MemberList title='Admins' members={admins} />
          )}

          {otherMembers.length > 0 && (
            <MemberList title='Other Members' members={otherMembers} />
          )}
        </div>
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
