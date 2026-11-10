'use strict';

require('dotenv').config();

if (String(process.env.ACCESS_CONTROL_SMOKE_FIXTURES).toLowerCase() !== 'true') {
  console.error(
    'Refusing to modify the database. Set ACCESS_CONTROL_SMOKE_FIXTURES=true for this command.'
  );
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

const database = require('../database');
const { getUploadDir } = require('../api/utils/fileStorage');
const Credentials = require('../models/credentials');
const Group = require('../models/group');
const KpiEvent = require('../models/kpiEvent');
const Report = require('../models/report');
const Source = require('../models/source');
const Team = require('../models/team');
const User = require('../models/user');

const {
  ATTACHMENT_CONTENT,
  ATTACHMENT_FILENAME,
  ATTACHMENT_PATH,
  COUNTRY_SOURCES,
  CREDENTIAL_NAME,
  CUTOFF_DATE,
  FIXTURE_KEY,
  FORMULA_SOURCE_NICKNAME,
  PASSWORD_FILE,
  POLICY_INCIDENT_NOTES,
  POLICY_INCIDENT_TITLE,
  PUBLIC_INCIDENT_NOTES,
  PUBLIC_INCIDENT_TITLE,
  RESTRICTED_INCIDENT_NOTES,
  RESTRICTED_INCIDENT_TITLE,
  SOURCE_NICKNAME,
  SOURCE_NICKNAMES,
  TEAMS,
  TEAM_INCIDENTS,
  TEAM_LEADS,
  TEAM_MEMBERSHIPS,
  TEAM_MEMBERSHIP_OVERRIDES,
  TEAM_SOURCES,
  USERS,
  buildIodaMetadata,
  generatePassword,
  isSmokeUpload,
  removeKpiResults,
  removeMatrixResults,
  removePassword,
  savePassword,
  teamSourceReportGuid,
} = require('./access-control-fixtures');

const attachmentFile = () => path.join(getUploadDir(), ATTACHMENT_FILENAME);

const waitForDatabase = async () => {
  if (database.mongoose.connection.readyState === 1) return;

  await new Promise((resolve, reject) => {
    database.mongoose.connection.once('open', resolve);
    database.mongoose.connection.once('error', reject);
  });
};

const registerUser = (userData, password) => new Promise((resolve, reject) => {
  User.register(
    {
      ...userData,
      active: true,
      hasDefaultPassword: false,
    },
    password,
    (err, user) => {
      if (err) return reject(err);
      return resolve(user);
    }
  );
});

const cleanup = async () => {
  // KPI events made by smoke users or about smoke fixtures (signups, logins,
  // triage from the matrix's KPI checks) would otherwise stay in the KPI totals.
  const [users, reports, groups] = await Promise.all([
    User.find({ username: { $in: Object.values(USERS).map((user) => user.username) } }).select('_id').lean(),
    Report.find({ 'metadata.fixture': FIXTURE_KEY }).select('_id').lean(),
    Group.find({ tags: FIXTURE_KEY }).select('_id').lean(),
  ]);
  const userIds = users.map((user) => String(user._id));
  const subjectIds = [...users, ...reports, ...groups].map((doc) => String(doc._id));
  await KpiEvent.deleteMany({
    $or: [{ actor: { $in: userIds } }, { subject: { $in: subjectIds } }],
  }).exec();
  // Saved matrix and KPI results describe fixtures that are about to be deleted.
  removeMatrixResults();
  removeKpiResults();

  await Group.deleteMany({ tags: FIXTURE_KEY }).exec();
  await Report.deleteMany({ 'metadata.fixture': FIXTURE_KEY }).exec();
  await Source.deleteMany({ nickname: { $in: SOURCE_NICKNAMES } }).exec();
  await Credentials.deleteMany({ name: CREDENTIAL_NAME, type: 'ioda' }).exec();
  await User.deleteMany({
    username: { $in: Object.values(USERS).map((user) => user.username) },
  }).exec();
  await Team.deleteMany({ name: { $in: Object.values(TEAMS).map((team) => team.name) } }).exec();
  fs.rmSync(attachmentFile(), { force: true });
  // Uploads the matrix's upload check would normally remove itself.
  if (fs.existsSync(getUploadDir())) {
    fs.readdirSync(getUploadDir())
      .filter(isSmokeUpload)
      .forEach((fileName) => fs.rmSync(path.join(getUploadDir(), fileName), { force: true }));
  }
};

const seed = async () => {
  await cleanup();

  const password = generatePassword();
  savePassword(password);

  const teams = {};
  for (const [key, { name, description, countryCodes, active = true, permissionLimits }] of Object.entries(TEAMS)) {
    teams[key] = await Team.create({ name, description, countryCodes, active, permissionLimits });
  }
  const team = teams.smoke;

  const users = {};
  for (const [key, userData] of Object.entries(USERS)) {
    const memberships = Object.entries(TEAM_MEMBERSHIPS[key] || {});
    users[key] = await registerUser({
      ...userData,
      teams: memberships.map(([teamKey]) => teams[teamKey]._id),
      teamMemberships: memberships.map(([teamKey, role]) => ({
        team: teams[teamKey]._id,
        role,
        permissionOverrides: (TEAM_MEMBERSHIP_OVERRIDES[key] || {})[teamKey] || { allow: [], deny: [] },
      })),
    }, password);
  }
  const { admin, alpha } = users;

  for (const [teamKey, userKeys] of Object.entries(TEAM_LEADS)) {
    userKeys.forEach((key) => teams[teamKey].leads.addToSet(users[key]._id));
    await teams[teamKey].save();
  }

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

  const formulaSource = await Source.create({
    media: 'ioda',
    nickname: FORMULA_SOURCE_NICKNAME,
    resource_id: `${FIXTURE_KEY}-formula`,
    enabled: false,
    credentials: credentials._id,
    user: admin._id,
    accessPolicy: { mode: 'public', teams: [], cutoffDate: null },
  });

  const countrySources = {};
  const countryReports = {};
  for (const [key, { nickname, countryCodes }] of Object.entries(COUNTRY_SOURCES)) {
    countrySources[key] = await Source.create({
      media: 'ioda',
      nickname,
      resource_id: `${FIXTURE_KEY}-${key}`,
      enabled: false,
      credentials: credentials._id,
      user: admin._id,
      countryCodes,
      accessPolicy: { mode: 'country_restricted', teams: [], cutoffDate: null },
    });

    const start = new Date('2026-03-01T12:00:00.000Z');
    countryReports[key] = await Report.create({
      authoredAt: start,
      isOutageEvent: true,
      fetchedAt: new Date('2026-03-01T12:05:00.000Z'),
      storedAt: new Date('2026-03-01T12:10:00.000Z'),
      content: `ACCESS CONTROL SMOKE: ${key} country-restricted report`,
      author: 'Smoke Fixture',
      guid: `${FIXTURE_KEY}-${key}`,
      _sources: [String(countrySources[key]._id)],
      _sourceNicknames: [nickname],
      _media: ['ioda'],
      metadata: buildIodaMetadata(key, start),
    });
  }

  const teamSources = {};
  const teamSourceReports = {};
  for (const [sourceKey, { nickname, accessPolicy, reports }] of Object.entries(TEAM_SOURCES)) {
    teamSources[sourceKey] = await Source.create({
      media: 'ioda',
      nickname,
      resource_id: `${FIXTURE_KEY}-${sourceKey}`,
      enabled: false,
      credentials: credentials._id,
      user: admin._id,
      accessPolicy: {
        ...accessPolicy,
        teams: accessPolicy.teams.map((teamKey) => teams[teamKey]._id),
      },
    });

    teamSourceReports[sourceKey] = {};
    for (const [reportKey, start] of Object.entries(reports)) {
      teamSourceReports[sourceKey][reportKey] = await Report.create({
        authoredAt: start,
        isOutageEvent: true,
        fetchedAt: new Date(start.getTime() + 5 * 60 * 1000),
        storedAt: new Date(start.getTime() + 10 * 60 * 1000),
        content: `ACCESS CONTROL SMOKE: ${nickname} ${reportKey} report`,
        author: 'Smoke Fixture',
        guid: teamSourceReportGuid(sourceKey, reportKey),
        _sources: [String(teamSources[sourceKey]._id)],
        _sourceNicknames: [nickname],
        _media: ['ioda'],
        metadata: buildIodaMetadata(`${sourceKey}-${reportKey}`, start),
      });
    }
  }

  const beforeReportStart = new Date('2026-01-01T12:00:00.000Z');
  const beforeReport = await Report.create({
    authoredAt: beforeReportStart,
    isOutageEvent: true,
    fetchedAt: new Date('2026-01-01T12:05:00.000Z'),
    storedAt: new Date('2026-01-01T12:10:00.000Z'),
    content: 'ACCESS CONTROL SMOKE: report before the cutoff',
    author: 'Smoke Fixture',
    guid: `${FIXTURE_KEY}-before`,
    _sources: [String(source._id)],
    _sourceNicknames: [SOURCE_NICKNAME],
    _media: ['ioda'],
    metadata: buildIodaMetadata('before', beforeReportStart),
  });

  const afterReportStart = new Date('2026-02-01T12:00:00.000Z');
  const afterReport = await Report.create({
    authoredAt: afterReportStart,
    isOutageEvent: true,
    fetchedAt: new Date('2026-02-01T12:05:00.000Z'),
    storedAt: new Date('2026-02-01T12:10:00.000Z'),
    content: 'ACCESS CONTROL SMOKE: report after the cutoff',
    author: 'Smoke Fixture',
    guid: `${FIXTURE_KEY}-after`,
    _sources: [String(source._id)],
    _sourceNicknames: [SOURCE_NICKNAME],
    _media: ['ioda'],
    metadata: buildIodaMetadata('after', afterReportStart),
  });

  const commentStart = new Date('2026-02-01T12:01:00.000Z');
  const comment = await Report.create({
    authoredAt: commentStart,
    isOutageEvent: true,
    fetchedAt: new Date('2026-02-01T12:06:00.000Z'),
    storedAt: new Date('2026-02-01T12:11:00.000Z'),
    content: 'ACCESS CONTROL SMOKE: comment on the post-cutoff report',
    author: 'Smoke Fixture Commenter',
    guid: `${FIXTURE_KEY}-comment`,
    commentTo: afterReport._id,
    _sources: [String(source._id)],
    _sourceNicknames: [SOURCE_NICKNAME],
    _media: ['ioda'],
    metadata: buildIodaMetadata('after-comment', commentStart),
  });

  const publicIncident = await Group.create({
    title: PUBLIC_INCIDENT_TITLE,
    creator: admin._id,
    tags: [FIXTURE_KEY],
    notes: PUBLIC_INCIDENT_NOTES,
    accessPolicy: { mode: 'public', teams: [] },
  });

  // Downloads are served from the upload directory by filename, so the file
  // must exist there as well as on the comment.
  fs.mkdirSync(getUploadDir(), { recursive: true });
  fs.writeFileSync(attachmentFile(), ATTACHMENT_CONTENT);

  const restrictedIncident = await Group.create({
    title: RESTRICTED_INCIDENT_TITLE,
    creator: admin._id,
    tags: [FIXTURE_KEY],
    notes: RESTRICTED_INCIDENT_NOTES,
    _reports: [afterReport._id],
    comments: [{
      data: 'ACCESS CONTROL SMOKE: restricted incident comment',
      author: alpha._id,
      attachments: [{
        fileName: ATTACHMENT_FILENAME,
        path: ATTACHMENT_PATH,
        serverPath: attachmentFile(),
        mimeType: 'text/plain',
        fileSize: Buffer.byteLength(ATTACHMENT_CONTENT),
      }],
    }],
    accessPolicy: { mode: 'restricted', teams: [team._id] },
  });

  const policyIncident = await Group.create({
    title: POLICY_INCIDENT_TITLE,
    creator: admin._id,
    tags: [FIXTURE_KEY],
    notes: POLICY_INCIDENT_NOTES,
    accessPolicy: { mode: 'restricted', teams: [team._id] },
  });

  afterReport._group = restrictedIncident._id;
  await afterReport.save();

  const teamIncidents = {};
  for (const [teamKey, { title, notes }] of Object.entries(TEAM_INCIDENTS)) {
    teamIncidents[teamKey] = await Group.create({
      title,
      creator: admin._id,
      tags: [FIXTURE_KEY],
      notes,
      accessPolicy: { mode: 'restricted', teams: [teams[teamKey]._id] },
    });
  }

  console.log('Access-control smoke fixtures created.');
  Object.entries(TEAMS).forEach(([key, { name, countryCodes, active = true, permissionLimits }]) => {
    const notes = [
      String(teams[key]._id),
      ...(countryCodes.length > 0 ? [`countries ${countryCodes.join(', ')}`] : []),
      ...(permissionLimits ? [`limits deny ${permissionLimits.deny.join(', ')}`] : []),
      ...(active ? [] : ['inactive']),
    ];
    console.log(`Team: ${name} (${notes.join(', ')})`);
  });
  console.log(`Source: ${SOURCE_NICKNAME} (${source._id})`);
  console.log(`Source: ${FORMULA_SOURCE_NICKNAME} (${formulaSource._id})`);
  Object.entries(COUNTRY_SOURCES).forEach(([key, { nickname, countryCodes }]) => {
    console.log(`Source: ${nickname} (${countrySources[key]._id}, country_restricted to ${countryCodes.join(', ')})`);
    console.log(`  Report: ${countryReports[key]._id}`);
  });
  Object.entries(TEAM_SOURCES).forEach(([sourceKey, { nickname, accessPolicy }]) => {
    const teamNames = accessPolicy.teams.map((teamKey) => TEAMS[teamKey].name).join(', ');
    const cutoff = accessPolicy.cutoffDate ? `, cutoff ${CUTOFF_DATE.toISOString().slice(0, 10)}` : '';
    console.log(`Source: ${nickname} (${teamSources[sourceKey]._id}, ${accessPolicy.mode} to ${teamNames}${cutoff})`);
    Object.entries(teamSourceReports[sourceKey]).forEach(([reportKey, report]) => {
      console.log(`  ${reportKey} report: ${report._id}`);
    });
  });
  console.log(`Cutoff (public-until source): ${CUTOFF_DATE.toISOString().slice(0, 10)}`);
  console.log(`Before report: ${beforeReport._id}`);
  console.log(`After report: ${afterReport._id}`);
  console.log(`Comment: ${comment._id}`);
  console.log(`Public incident: ${publicIncident._id}`);
  console.log(`Restricted incident: ${restrictedIncident._id}`);
  console.log(`  Attachment: ${ATTACHMENT_PATH} (file: ${attachmentFile()})`);
  console.log(`Policy incident: ${policyIncident._id}`);
  Object.entries(TEAM_INCIDENTS).forEach(([teamKey, { title }]) => {
    console.log(`${title}: ${teamIncidents[teamKey]._id}`);
  });
  console.log(`Users (password for all: ${password}, saved to ${PASSWORD_FILE}):`);
  Object.values(USERS).forEach((user) => {
    console.log(`  ${user.username}  (${user.displayName})`);
  });
};

const main = async () => {
  const command = process.argv[2];

  await waitForDatabase();

  if (command === 'seed') {
    await seed();
  } else if (command === 'cleanup') {
    await cleanup();
    removePassword();
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
