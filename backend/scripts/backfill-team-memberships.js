'use strict';

require('dotenv').config();

const database = require('../database');
const Team = require('../models/team');
const User = require('../models/user');
const { normalizeTeamRole } = require('../access/teamMemberships');

const waitForDatabase = async () => {
  if (database.mongoose.connection.readyState === 1) return;

  await new Promise((resolve, reject) => {
    database.mongoose.connection.once('open', resolve);
    database.mongoose.connection.once('error', reject);
  });
};

const main = async () => {
  await waitForDatabase();

  const [users, teams] = await Promise.all([
    User.find({ 'teams.0': { $exists: true } })
      .select('_id username role teams teamMemberships'),
    Team.find({}).select('_id leads').lean(),
  ]);
  const leadIdsByTeam = new Map(teams.map((team) => [
    String(team._id),
    new Set((team.leads || []).map(String)),
  ]));
  const additions = [];

  users.forEach((user) => {
    const existingTeamIds = new Set(
      (user.teamMemberships || []).map((membership) => String(membership.team))
    );

    (user.teams || []).forEach((teamId) => {
      const normalizedTeamId = String(teamId);
      if (existingTeamIds.has(normalizedTeamId)) return;

      const isLead = leadIdsByTeam.get(normalizedTeamId)?.has(String(user._id));
      additions.push({
        user,
        team: teamId,
        role: isLead ? 'team_lead' : normalizeTeamRole(user.role),
      });
    });
  });

  console.log(`Found ${additions.length} missing team membership role(s).`);
  additions.forEach(({ user, team, role }) => {
    console.log(`${user.username} -> ${team}: ${role}`);
  });

  if (!process.argv.includes('--apply')) {
    console.log('Dry run only. Re-run with --apply to write these memberships.');
    return;
  }

  if (String(process.env.TEAM_MEMBERSHIP_BACKFILL).toLowerCase() !== 'true') {
    throw new Error(
      'Refusing to modify the database. Set TEAM_MEMBERSHIP_BACKFILL=true with --apply.'
    );
  }

  const usersToSave = new Set();
  additions.forEach(({ user, team, role }) => {
    user.teamMemberships.push({ team, role });
    usersToSave.add(user);
  });
  await Promise.all([...usersToSave].map((user) => user.save()));

  console.log('Team membership roles backfilled successfully.');
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.mongoose.connection.close();
  });
