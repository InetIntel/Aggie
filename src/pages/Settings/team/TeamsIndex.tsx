import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTeam, deleteTeam, getTeams } from "../../../api/teams";
import AggieButton from "../../../components/AggieButton";
import PlaceholderDiv from "../../../components/PlaceholderDiv";

const TeamsIndex = () => {
  const queryClient = useQueryClient();

  const { data: teams, isLoading } = useQuery(["teams"], getTeams);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const doCreateTeam = useMutation(createTeam, {
    onSuccess: () => {
      setName("");
      setDescription("");
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
      active: true,
    });
  }

  return (
    <section className='mt-4'>
      <div className='flex justify-between items-center mb-3'>
        <h2 className='text-3xl font-medium'>Teams</h2>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4'>
        <div className='bg-white dark:bg-gray-800 rounded-xl border border-slate-300 overflow-hidden'>
          <div className='grid grid-cols-4 px-3 py-3 font-medium text-sm border-b border-slate-300'>
            <p>Name</p>
            <p>Description</p>
            <p>Status</p>
          </div>

          <PlaceholderDiv loading={isLoading}>
            {teams && teams.length > 0 ? (
              teams.map((team) => (
                <article
                  key={team._id}
                  className='grid grid-cols-4 px-3 py-3 items-center border-b border-slate-200 last:border-b-0'
                >
                  <p className='font-medium'>{team.name}</p>
                  <p className='text-sm text-slate-600 dark:text-gray-300'>
                    {team.description || "No description"}
                  </p>
                  <p className='text-sm'>
                    {team.active === false ? "Inactive" : "Active"}
                  </p>
                  <div className='flex justify-end'>
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
                  </div>
                </article>
              ))
            ) : (
              <div className='px-3 py-6 text-sm text-slate-600 dark:text-gray-300'>
                No teams have been created yet.
              </div>
            )}
          </PlaceholderDiv>
        </div>

        <form
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

          <AggieButton
            variant='primary'
            type='submit'
            disabled={doCreateTeam.isLoading || !name.trim()}
            loading={doCreateTeam.isLoading}
          >
            Create Team
          </AggieButton>
        </form>
      </div>
    </section>
  );
};

export default TeamsIndex;