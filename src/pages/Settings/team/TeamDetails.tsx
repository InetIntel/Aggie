import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { getTeam } from "../../../api/teams";
import type { TeamMember } from "../../../api/teams/types";
import PlaceholderDiv from "../../../components/PlaceholderDiv";

const MemberList = ({
  title,
  members,
}: {
  title: string;
  members: TeamMember[];
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
            className='grid grid-cols-3 px-3 py-3 border-b border-slate-200 last:border-b-0 items-center'
          >
            <p className='font-medium'>
              {member.displayName || member.username}
            </p>
            <p className='text-sm text-slate-600 dark:text-gray-300'>
              {member.email}
            </p>
            <p className='text-sm'>{member.role}</p>
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

const TeamDetails = () => {
  const params = useParams();

  const { data, isLoading } = useQuery(["teams", params.id], () => {
    if (params.id) return getTeam(params.id);
    return undefined;
  });

  const members = data?.members || [];

  const teamLeads = members.filter((member) => member.role === "team_lead");
  const monitors = members.filter((member) => member.role === "monitor");
  const viewers = members.filter((member) => member.role === "viewer");
  const admins = members.filter((member) => member.role === "admin");
  const otherMembers = members.filter(
    (member) =>
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

        <div className='flex flex-col gap-4'>
          <MemberList title='Team Leads' members={teamLeads} />
          <MemberList title='Monitors' members={monitors} />
          <MemberList title='Viewers' members={viewers} />

          {admins.length > 0 && (
            <MemberList title='Admins' members={admins} />
          )}

          {otherMembers.length > 0 && (
            <MemberList title='Other Members' members={otherMembers} />
          )}
        </div>
      </PlaceholderDiv>
    </section>
  );
};

export default TeamDetails;