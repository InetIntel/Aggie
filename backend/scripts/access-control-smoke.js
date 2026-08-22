'use strict';

require('dotenv').config();

if (String(process.env.ACCESS_CONTROL_SMOKE_FIXTURES).toLowerCase() !== 'true') {
  console.error(
    'Refusing to modify the database. Set ACCESS_CONTROL_SMOKE_FIXTURES=true for this command.'
  );
  process.exit(1);
}

const database = require('../database');
const Credentials = require('../models/credentials');
const Group = require('../models/group');
const Report = require('../models/report');
const Source = require('../models/source');
const Team = require('../models/team');
const User = require('../models/user');

const FIXTURE_KEY = 'access-control-smoke-v1';
const TEAM_NAME = 'Access Control Smoke';
const CREDENTIAL_NAME = 'Access Smoke';
const SOURCE_NICKNAME = 'Access Control Smoke Source';
const PUBLIC_INCIDENT_TITLE = 'Access Control Smoke Public Incident';
const RESTRICTED_INCIDENT_TITLE = 'Access Control Smoke Restricted Incident';
const PASSWORD = 'AggieSmokeTest!2026';
const CUTOFF_DATE = new Date('2026-01-15T00:00:00.000Z');

const USERS = {
  admin: {
    username: 'smoke_access_admin',
    displayName: 'Smoke Test Admin',
    email: 'smoke-access-admin@example.invalid',
    role: 'admin',
  },
  alpha: {
    username: 'smoke_access_alpha',
    displayName: 'Smoke Test Alpha Monitor',
    email: 'smoke-access-alpha@example.invalid',
    role: 'monitor',
  },
  outsider: {
    username: 'smoke_access_outsider',
    displayName: 'Smoke Test Outside Monitor',
    email: 'smoke-access-outsider@example.invalid',
    role: 'monitor',
  },
};

const waitForDatabase = async () => {
  if (database.mongoose.connection.readyState === 1) return;

  await new Promise((resolve, reject) => {
    database.mongoose.connection.once('open', resolve);
    database.mongoose.connection.once('error', reject);
  });
};

const registerUser = (userData) => new Promise((resolve, reject) => {
  User.register(
    {
      ...userData,
      active: true,
      hasDefaultPassword: false,
    },
    PASSWORD,
    (err, user) => {
      if (err) return reject(err);
      return resolve(user);
    }
  );
});

const cleanup = async () => {
  await Group.deleteMany({ tags: FIXTURE_KEY }).exec();
  await Report.deleteMany({ 'metadata.fixture': FIXTURE_KEY }).exec();
  await Source.deleteMany({ nickname: SOURCE_NICKNAME }).exec();
  await Credentials.deleteMany({ name: CREDENTIAL_NAME, type: 'ioda' }).exec();
  await User.deleteMany({
    username: { $in: Object.values(USERS).map((user) => user.username) },
  }).exec();
  await Team.deleteMany({ name: TEAM_NAME }).exec();
};

const seed = async () => {
  await cleanup();

  const team = await Team.create({
    name: TEAM_NAME,
    description: 'Disposable team for local access-control smoke testing.',
  });

  const admin = await registerUser(USERS.admin);
  const alpha = await registerUser({ ...USERS.alpha, teams: [team._id] });
  const outsider = await registerUser(USERS.outsider);

  team.leads.addToSet(alpha._id);
  await team.save();

  const credentials = await Credentials.create({
    name: CREDENTIAL_NAME,
    type: 'ioda',
    secrets: {},
  });

  const source = await Source.create({
    media: 'ioda',
    nickname: SOURCE_NICKNAME,
    resource_id: FIXTURE_KEY,
    enabled: false,
    credentials: credentials._id,
    user: admin._id,
    accessPolicy: {
      mode: 'public',
      teams: [],
      cutoffDate: null,
    },
  });

  const beforeReport = await Report.create({
    authoredAt: new Date('2026-01-01T12:00:00.000Z'),
    fetchedAt: new Date('2026-01-01T12:05:00.000Z'),
    storedAt: new Date('2026-01-01T12:10:00.000Z'),
    content: 'ACCESS CONTROL SMOKE: report before the cutoff',
    author: 'Smoke Fixture',
    guid: `${FIXTURE_KEY}-before`,
    _sources: [String(source._id)],
    _sourceNicknames: [SOURCE_NICKNAME],
    _media: ['ioda'],
    metadata: { fixture: FIXTURE_KEY, period: 'before' },
  });

  const afterReport = await Report.create({
    authoredAt: new Date('2026-02-01T12:00:00.000Z'),
    fetchedAt: new Date('2026-02-01T12:05:00.000Z'),
    storedAt: new Date('2026-02-01T12:10:00.000Z'),
    content: 'ACCESS CONTROL SMOKE: report after the cutoff',
    author: 'Smoke Fixture',
    guid: `${FIXTURE_KEY}-after`,
    _sources: [String(source._id)],
    _sourceNicknames: [SOURCE_NICKNAME],
    _media: ['ioda'],
    metadata: { fixture: FIXTURE_KEY, period: 'after' },
  });

  const comment = await Report.create({
    authoredAt: new Date('2026-02-01T12:01:00.000Z'),
    fetchedAt: new Date('2026-02-01T12:06:00.000Z'),
    storedAt: new Date('2026-02-01T12:11:00.000Z'),
    content: 'ACCESS CONTROL SMOKE: comment on the post-cutoff report',
    author: 'Smoke Fixture Commenter',
    guid: `${FIXTURE_KEY}-comment`,
    commentTo: afterReport._id,
    _sources: [String(source._id)],
    _sourceNicknames: [SOURCE_NICKNAME],
    _media: ['ioda'],
    metadata: { fixture: FIXTURE_KEY, period: 'after-comment' },
  });

  const publicIncident = await Group.create({
    title: PUBLIC_INCIDENT_TITLE,
    creator: admin._id,
    tags: [FIXTURE_KEY],
    notes: 'Disposable public incident for access-control smoke testing.',
    accessPolicy: { mode: 'public', teams: [] },
  });

  const restrictedIncident = await Group.create({
    title: RESTRICTED_INCIDENT_TITLE,
    creator: admin._id,
    tags: [FIXTURE_KEY],
    notes: 'Disposable Team Alpha incident for access-control smoke testing.',
    _reports: [afterReport._id],
    comments: [{
      data: 'ACCESS CONTROL SMOKE: restricted incident comment',
      author: alpha._id,
    }],
    accessPolicy: { mode: 'restricted', teams: [team._id] },
  });

  afterReport._group = restrictedIncident._id;
  await afterReport.save();

  console.log('Access-control smoke fixtures created.');
  console.log(`Team: ${TEAM_NAME}`);
  console.log(`Source: ${SOURCE_NICKNAME} (${source._id})`);
  console.log(`Cutoff to use: ${CUTOFF_DATE.toISOString().slice(0, 10)}`);
  console.log(`Before report: ${beforeReport._id}`);
  console.log(`After report: ${afterReport._id}`);
  console.log(`Comment: ${comment._id}`);
  console.log(`Public incident: ${publicIncident._id}`);
  console.log(`Restricted incident: ${restrictedIncident._id}`);
  console.log('Users:');
  console.log(`  ${USERS.admin.username} / ${PASSWORD}`);
  console.log(`  ${USERS.alpha.username} / ${PASSWORD}`);
  console.log(`  ${USERS.outsider.username} / ${PASSWORD}`);
};

const main = async () => {
  const command = process.argv[2];

  await waitForDatabase();

  if (command === 'seed') {
    await seed();
  } else if (command === 'cleanup') {
    await cleanup();
    console.log('Access-control smoke fixtures removed.');
  } else {
    throw new Error('Usage: access-control-smoke.js <seed|cleanup>');
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.mongoose.connection.close();
  });
