'use strict';

require('dotenv').config();

const database = require('../database');
const Team = require('../models/team');
const User = require('../models/user');

const waitForDatabase = async () => {
  if (database.mongoose.connection.readyState === 1) return;

  await new Promise((resolve, reject) => {
    database.mongoose.connection.once('open', resolve);
    database.mongoose.connection.once('error', reject);
  });
};

const main = async () => {
  await waitForDatabase();

  const legacyLeads = await User.find({ role: 'team_lead' })
    .select('_id username teams')
    .lean();
  const assignments = legacyLeads.flatMap((user) =>
    (user.teams || []).map((teamId) => ({
      teamId,
      userId: user._id,
      username: user.username,
    }))
  );

  console.log(`Found ${legacyLeads.length} legacy team lead user(s).`);
  console.log(`Found ${assignments.length} team leadership assignment(s) to backfill.`);

  assignments.forEach((assignment) => {
    console.log(`${assignment.username} -> ${assignment.teamId}`);
  });

  const shouldApply = process.argv.includes('--apply');
  if (!shouldApply) {
    console.log('Dry run only. Re-run with --apply to write these assignments.');
    return;
  }

  if (String(process.env.TEAM_LEAD_BACKFILL).toLowerCase() !== 'true') {
    throw new Error(
      'Refusing to modify the database. Set TEAM_LEAD_BACKFILL=true with --apply.'
    );
  }

  if (assignments.length > 0) {
    await Team.bulkWrite(
      assignments.map((assignment) => ({
        updateOne: {
          filter: { _id: assignment.teamId },
          update: { $addToSet: { leads: assignment.userId } },
        },
      }))
    );
  }

  console.log('Team lead assignments backfilled successfully.');
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.mongoose.connection.close();
  });
