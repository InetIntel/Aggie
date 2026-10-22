import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTeam, deleteTeam, getTeams } from "../../../api/teams";

import { Link } from "react-router-dom";
import AggieButton from "../../../components/AggieButton";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import CountryMultiSelect, { getCountryLabel } from "../../../components/CountryMultiSelect";


interface IProps {
  session?: {
    role?: string;
  };
}

const TeamsIndex = ({ session }: IProps) => {

  const isAdmin = session?.role === "admin";
  const isTeamLead = session?.role === "team_lead";
  const canCreateTeams = isAdmin || isTeamLead;
  const queryClient = useQueryClient();
  const teamGridColumns = canCreateTeams
    ? "grid-cols-[minmax(7.5rem,1.1fr)_minmax(10rem,1.6fr)_minmax(7rem,1fr)_5rem_4rem]"
    : "grid-cols-[minmax(7.5rem,1.1fr)_minmax(10rem,1.6fr)_minmax(7rem,1fr)_5rem]";

const { data: teams, isLoading } = useQuery(["teams", "all"], getTeams);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [teamSearch, setTeamSearch] = useState("");

  const normalizedSearch = teamSearch.trim().toLowerCase();
  const filteredTeams = (teams || []).filter((team) => {
    if (!normalizedSearch) return true;

    const countryText = (team.countryCodes || [])
      .map((code) => getCountryLabel(code))
      .join(" ");
    return [team.name, team.description || "", countryText]
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  const doCreateTeam = useMutation(createTeam, {
    onSuccess: () => {
      setName("");
      setDescription("");
      setCountryCodes([]);
      queryClient.invalidateQueries(["teams"]);
      queryClient.invalidateQueries(["teams", "manageable"]);
    },
  });
  const doDeleteTeam = useMutation(deleteTeam, {
  onSuccess: () => {
    queryClient.invalidateQueries(["teams"]);
    queryClient.invalidateQueries(["teams", "manageable"]);
    queryClient.invalidateQueries(["users"]);
  },
});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) return;

    doCreateTeam.mutate({
      name: trimmedName,
      description: description.trim(),
      countryCodes: isAdmin ? countryCodes : [],
      active: true,
    });
  }

  return (
    <section className='mt-3 pb-8'>
      <div className='flex flex-wrap justify-between items-center gap-3 mb-3'>
        <h2 className='text-3xl font-medium'>Teams</h2>
        <input
          type='search'
          value={teamSearch}
          onChange={(event) => setTeamSearch(event.target.value)}
          placeholder='Search teams or countries'
          aria-label='Search teams'
          className='w-full sm:w-72 px-3 py-2 rounded border border-slate-300 bg-white dark:bg-gray-800'
        />
      </div>

      <div className={canCreateTeams ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4" : "grid"}>
        <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 overflow-x-auto'>
          <div className={`grid ${teamGridColumns} min-w-[38rem] gap-3 px-3 py-3 font-medium text-sm border-b border-slate-300`}>
            <p>Name</p>
            <p>Description</p>
            <p>Countries</p>
            <p>Status</p>
          </div>

          <PlaceholderDiv loading={isLoading}>
            {filteredTeams.length > 0 ? (
              filteredTeams.map((team) => (
                <article
                  key={team._id}
                  className={`grid ${teamGridColumns} min-w-[38rem] gap-3 px-3 py-3 items-center border-b border-slate-200 last:border-b-0`}
                >
                  <Link 
                    to={`/settings/team/${team._id}`}
                    className='font-medium text-lime-800 hover:underline break-words'
                  >
                    {team.name}
                  </Link>
                  <p className='text-sm text-slate-600 dark:text-gray-300 break-words'>
                    {team.description || "No description"}
                  </p>
                  <div className='flex flex-wrap gap-1 text-sm'>
                    {team.countryCodes?.length ? (
                      team.countryCodes.map((code) => (
                        <span
                          key={code}
                          className='px-2 py-0.5 rounded bg-slate-100 dark:bg-gray-700 border border-slate-300'
                        >
                          {code}
                        </span>
                      ))
                    ) : (
                      <span className='text-slate-600 dark:text-gray-300'>None</span>
                    )}
                  </div>
                  <p className='text-sm'>
                    {team.active === false ? "Inactive" : "Active"}
                  </p>
                  {canCreateTeams && <div className='flex justify-end'>
                    <AggieButton
                      variant='danger'
                      disabled={doDeleteTeam.isLoading}
                      onClick={() => {
                        if (window.confirm(`Delete team "${team.name}"? This will remove it from assigned users.`)) {
                          doDeleteTeam.mutate(team._id);
                        }
                      }}
                    >
                      Delete
                    </AggieButton>
                  </div>}
                </article>
              ))
            ) : (
              <div className='px-3 py-6 text-sm text-slate-600 dark:text-gray-300'>
                {teams?.length ? "No teams match your search." : "No teams have been created yet."}
              </div>
            )}
          </PlaceholderDiv>
        </div>

        {canCreateTeams && <form
          onSubmit={onSubmit}
          className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 p-3 h-fit flex flex-col gap-3'
        >
          <h3 className='text-xl font-medium'>Create team</h3>

          <label className='flex flex-col gap-1 text-sm'>
            <span className='font-medium'>Name</span>
            <input
              className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Team name'
            />
          </label>

          <label className='flex flex-col gap-1 text-sm'>
            <span className='font-medium'>Description</span>
            <textarea
              className='px-3 py-2 rounded border border-slate-300 dark:bg-gray-700'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder='Optional description'
              rows={4}
            />
          </label>

          {isAdmin && (
            <CountryMultiSelect value={countryCodes} onChange={setCountryCodes} />
          )}

          <AggieButton
            variant='primary'
            type='submit'
            disabled={doCreateTeam.isLoading || !name.trim()}
            loading={doCreateTeam.isLoading}
          >
            Create Team
          </AggieButton>
        </form>}
      </div>
    </section>
  );
};

export default TeamsIndex;
