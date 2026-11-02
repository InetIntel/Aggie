'use strict';

// Fixture definitions shared by the access-control smoke scripts: the seed
// (access-control-smoke.js), the API matrix (access-control-matrix.js), and the
// UI screenshot sweep (scripts/access-control-screens.js).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FIXTURE_KEY = 'access-control-smoke-v1';
const CREDENTIAL_NAME = 'Access Smoke';
const SOURCE_NICKNAME = 'Access Control Smoke Source';
// Public source whose name starts with "=". The KPI CSV export must write it
// as text ('=...) so spreadsheets don't run it as a formula.
const FORMULA_SOURCE_NICKNAME = '=Access Control Smoke Formula Source';
const PUBLIC_INCIDENT_TITLE = 'Access Control Smoke Public Incident';
const PUBLIC_INCIDENT_NOTES = 'Disposable public incident for access-control smoke testing.';
const RESTRICTED_INCIDENT_TITLE = 'Access Control Smoke Restricted Incident';
const RESTRICTED_INCIDENT_NOTES = 'Disposable Team Alpha incident for access-control smoke testing.';
// The seed generates a new random password for all smoke users on every run
// and saves it here (scratchpad/ is gitignored), so no working password for
// these accounts is ever committed to this public repo.
const PASSWORD_FILE = path.join(__dirname, '..', '..', 'scratchpad', 'access-control-smoke-password.txt');

const generatePassword = () => crypto.randomBytes(18).toString('base64url');

const savePassword = (password) => {
  fs.mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true });
  fs.writeFileSync(PASSWORD_FILE, `${password}\n`, { mode: 0o600 });
};

const readPassword = () => {
  try {
    return fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    throw new Error(
      `No smoke password found at ${PASSWORD_FILE}. ` +
      'Run: ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed'
    );
  }
};

const removePassword = () => fs.rmSync(PASSWORD_FILE, { force: true });

// The matrix saves its latest KPI check results here so the screens report
// can show them without running the KPI checks (which create data) itself.
const KPI_RESULTS_FILE = path.join(__dirname, '..', '..', 'scratchpad', 'access-control-kpi-results.json');

const saveKpiResults = (data) => {
  fs.mkdirSync(path.dirname(KPI_RESULTS_FILE), { recursive: true });
  fs.writeFileSync(KPI_RESULTS_FILE, `${JSON.stringify(data, null, 2)}\n`);
};

// Returns null when the matrix hasn't saved KPI results since the last seed.
const readKpiResults = () => {
  try {
    return JSON.parse(fs.readFileSync(KPI_RESULTS_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
};

const removeKpiResults = () => fs.rmSync(KPI_RESULTS_FILE, { force: true });
const CUTOFF_DATE = new Date('2026-01-15T00:00:00.000Z');

const USERS = {
  admin: {
    username: 'smoke_access_admin',
    displayName: 'Smoke Test Admin',
    email: 'smoke-access-admin@example.invalid',
    role: 'admin',
  },
  teamLead: {
    username: 'smoke_access_team_lead',
    displayName: 'Smoke Test Global Team Lead',
    email: 'smoke-access-team-lead@example.invalid',
    role: 'team_lead',
  },
  alpha: {
    username: 'smoke_access_alpha',
    displayName: 'Smoke Test Alpha Monitor',
    email: 'smoke-access-alpha@example.invalid',
    role: 'monitor',
  },
  scopedMonitor: {
    username: 'smoke_access_scoped_monitor',
    displayName: 'Smoke Test Team Monitor',
    email: 'smoke-access-scoped-monitor@example.invalid',
    role: 'viewer',
  },
  outsider: {
    username: 'smoke_access_outsider',
    displayName: 'Smoke Test Outside Monitor',
    email: 'smoke-access-outsider@example.invalid',
    role: 'monitor',
  },
  viewer: {
    username: 'smoke_access_viewer',
    displayName: 'Smoke Test Viewer',
    email: 'smoke-access-viewer@example.invalid',
    role: 'viewer',
  },
  monitorNoEdit: {
    username: 'smoke_access_monitor_no_edit',
    displayName: 'Smoke Test Monitor (edit denied)',
    email: 'smoke-access-monitor-no-edit@example.invalid',
    role: 'monitor',
    permissionOverrides: { allow: [], deny: ['edit data'] },
  },
  viewerCanEdit: {
    username: 'smoke_access_viewer_can_edit',
    displayName: 'Smoke Test Viewer (edit allowed)',
    email: 'smoke-access-viewer-can-edit@example.invalid',
    role: 'viewer',
    permissionOverrides: { allow: ['edit data'], deny: [] },
  },
  teamAMonitor: {
    username: 'smoke_access_team_a_monitor',
    displayName: 'Smoke Test Team A Monitor (France)',
    email: 'smoke-access-team-a-monitor@example.invalid',
    role: 'viewer',
  },
  teamBMonitor: {
    username: 'smoke_access_team_b_monitor',
    displayName: 'Smoke Test Team B Monitor (Mexico)',
    email: 'smoke-access-team-b-monitor@example.invalid',
    role: 'viewer',
  },
  teamCMonitor: {
    username: 'smoke_access_team_c_monitor',
    displayName: 'Smoke Test Team C Monitor (France, Mexico)',
    email: 'smoke-access-team-c-monitor@example.invalid',
    role: 'viewer',
  },
  teamABMonitor: {
    username: 'smoke_access_team_ab_monitor',
    displayName: 'Smoke Test Team A and B Monitor (France, Mexico)',
    email: 'smoke-access-team-ab-monitor@example.invalid',
    role: 'viewer',
  },
};

// Team members get access to country_restricted sources whose countries
// overlap their teams' countryCodes.
const TEAMS = {
  smoke: {
    label: 'smoke team',
    name: 'Access Control Smoke',
    description: 'Disposable team for local access-control smoke testing.',
    countryCodes: [],
  },
  teamA: {
    label: 'Team A (FR)',
    name: 'Access Control Smoke Team A',
    description: 'Disposable France-focused team for access-control smoke testing.',
    countryCodes: ['FR'],
  },
  teamB: {
    label: 'Team B (MX)',
    name: 'Access Control Smoke Team B',
    description: 'Disposable Mexico-focused team for access-control smoke testing.',
    countryCodes: ['MX'],
  },
  teamC: {
    label: 'Team C (FR, MX)',
    name: 'Access Control Smoke Team C',
    description: 'Disposable France and Mexico team for access-control smoke testing.',
    countryCodes: ['FR', 'MX'],
  },
};

// Role each user holds on each team, keyed by user then team. Users not listed
// are not on any team.
const TEAM_MEMBERSHIPS = {
  alpha: { smoke: 'team_lead' },
  scopedMonitor: { smoke: 'monitor' },
  teamAMonitor: { teamA: 'monitor' },
  teamBMonitor: { teamB: 'monitor' },
  teamCMonitor: { teamC: 'monitor' },
  teamABMonitor: { teamA: 'monitor', teamB: 'monitor' },
};

// Users added to each team's `leads` list, keyed by team.
const TEAM_LEADS = {
  smoke: ['alpha'],
};

// Incidents restricted to a single team, keyed by team.
const TEAM_INCIDENTS = Object.fromEntries(['teamA', 'teamB', 'teamC'].map((teamKey) => {
  const label = TEAMS[teamKey].label;
  return [teamKey, {
    title: `Access Control Smoke ${label} Incident`,
    notes: `Disposable incident restricted to ${label} for access-control smoke testing.`,
  }];
}));

// Disabled country_restricted sources, each with one report.
const COUNTRY_SOURCES = {
  france: { nickname: 'Access Control Smoke France Source', countryCodes: ['FR'] },
  mexico: { nickname: 'Access Control Smoke Mexico Source', countryCodes: ['MX'] },
};

// Every fixture source, for lookups and cleanup.
const SOURCE_NICKNAMES = [
  SOURCE_NICKNAME,
  FORMULA_SOURCE_NICKNAME,
  ...Object.values(COUNTRY_SOURCES).map((source) => source.nickname),
];

// Access restrictions the smoke tests know about, compared against the schemas
// by checkAccessCoverage before the matrix runs. `covered` values have
// fixtures and CHECKS; `knownGaps` are real restrictions with no coverage yet;
// `notAccess` Team fields don't control access. A value in none of the lists
// stops the matrix, so a new restriction can't land without someone deciding
// how it is tested.
const ACCESS_COVERAGE = {
  sourceModes: {
    covered: ['public', 'country_restricted'],
    knownGaps: ['restricted', 'public_until'],
  },
  incidentModes: {
    covered: ['public', 'restricted'],
    knownGaps: [],
  },
  teamRoles: {
    covered: ['monitor', 'team_lead'],
    knownGaps: ['viewer'],
  },
  teamFields: {
    covered: ['countryCodes', 'leads'],
    knownGaps: ['active', 'permissionLimits'],
    notAccess: ['name', 'description'],
  },
};

// Throws if a schema has an access mode, team role or Team field that isn't in
// ACCESS_COVERAGE.
const checkAccessCoverage = () => {
  const Group = require('../models/group');
  const Source = require('../models/source');
  const Team = require('../models/team');
  const { TEAM_MEMBERSHIP_ROLES } = require('../access/teamMemberships');

  const teamFields = [...new Set(Object.keys(Team.schema.paths).map((p) => p.split('.')[0]))]
    .filter((field) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(field));
  const actual = {
    sourceModes: Source.schema.path('accessPolicy.mode').enumValues,
    incidentModes: Group.schema.path('accessPolicy.mode').enumValues,
    teamRoles: TEAM_MEMBERSHIP_ROLES,
    teamFields,
  };

  const uncovered = Object.entries(actual).flatMap(([kind, values]) => {
    const { covered, knownGaps, notAccess = [] } = ACCESS_COVERAGE[kind];
    const known = new Set([...covered, ...knownGaps, ...notAccess]);
    return values.filter((value) => !known.has(value)).map((value) => `${kind}: ${value}`);
  });

  if (uncovered.length > 0) {
    throw new Error(
      `New access restriction(s) with no smoke coverage: ${uncovered.join(', ')}.\n` +
      'Add fixtures (backend/scripts/access-control-fixtures.js) and CHECKS ' +
      '(backend/scripts/access-control-matrix.js) for each, update ' +
      'docs/claude/runbooks/access-control-smoke-tests.md and docs/access-control/, ' +
      'then add it to ACCESS_COVERAGE (covered; or knownGaps plus a runbook ' +
      '"Coverage gaps (TODO)" item if it is deferred; or notAccess for a Team ' +
      'field that does not control access).'
    );
  }
};

// Report metadata shaped like a fetched IODA event, so fixture reports render
// like real ones.
const buildIodaMetadata = (period, start, durationSeconds = 3600) => ({
  fixture: FIXTURE_KEY,
  period,
  rawAPIResponse: {
    rawEvent: {
      start: Math.floor(start.getTime() / 1000),
      duration: durationSeconds,
      datasource: 'ping-slash24',
    },
    entityLevel: 'AS',
    entityScope: 'AS64500',
    entityName: 'Access Control Smoke Network',
    dataSource: 'Active Probing',
    started: start.toISOString(),
    ended: new Date(start.getTime() + durationSeconds * 1000).toISOString(),
    isOngoing: false,
  },
});

// "monitor on Team A (FR)" style summary of a user's team roles.
const describeMemberships = (userKey) => Object.entries(TEAM_MEMBERSHIPS[userKey] || {})
  .map(([teamKey, role]) => `${role} on ${TEAMS[teamKey].label}`)
  .join(', ');

// Looks up the seeded fixture documents so other scripts can target them.
// Requires an open database connection.
const loadFixtureIds = async () => {
  const Group = require('../models/group');
  const Report = require('../models/report');
  const Source = require('../models/source');
  const Team = require('../models/team');
  const User = require('../models/user');

  const teamNames = Object.values(TEAMS).map((team) => team.name);
  const [teams, sources, reports, incidents, users] = await Promise.all([
    Team.find({ name: { $in: teamNames } }).select('_id name').lean(),
    Source.find({ nickname: { $in: SOURCE_NICKNAMES } }).select('_id nickname').lean(),
    Report.find({ 'metadata.fixture': FIXTURE_KEY }).select('_id guid').lean(),
    Group.find({ tags: FIXTURE_KEY }).select('_id title').lean(),
    User.find({ username: { $in: Object.values(USERS).map((user) => user.username) } })
      .select('_id username')
      .lean(),
  ]);

  const reportByGuid = new Map(reports.map((report) => [report.guid, String(report._id)]));
  const incidentByTitle = new Map(incidents.map((incident) => [incident.title, String(incident._id)]));
  const userIdByUsername = new Map(users.map((user) => [user.username, String(user._id)]));
  const teamIdByName = new Map(teams.map((team) => [team.name, String(team._id)]));
  const sourceIdByNickname = new Map(sources.map((source) => [source.nickname, String(source._id)]));

  const ids = {
    team: teamIdByName.get(TEAMS.smoke.name),
    teams: Object.fromEntries(
      Object.entries(TEAMS).map(([key, team]) => [key, teamIdByName.get(team.name)])
    ),
    source: sourceIdByNickname.get(SOURCE_NICKNAME),
    formulaSource: sourceIdByNickname.get(FORMULA_SOURCE_NICKNAME),
    countrySources: Object.fromEntries(
      Object.entries(COUNTRY_SOURCES).map(([key, source]) => [key, sourceIdByNickname.get(source.nickname)])
    ),
    reports: {
      before: reportByGuid.get(`${FIXTURE_KEY}-before`),
      after: reportByGuid.get(`${FIXTURE_KEY}-after`),
      comment: reportByGuid.get(`${FIXTURE_KEY}-comment`),
      ...Object.fromEntries(
        Object.keys(COUNTRY_SOURCES).map((key) => [key, reportByGuid.get(`${FIXTURE_KEY}-${key}`)])
      ),
    },
    incidents: {
      public: incidentByTitle.get(PUBLIC_INCIDENT_TITLE),
      restricted: incidentByTitle.get(RESTRICTED_INCIDENT_TITLE),
    },
    teamIncidents: Object.fromEntries(
      Object.entries(TEAM_INCIDENTS).map(([teamKey, { title }]) => [teamKey, incidentByTitle.get(title)])
    ),
    users: Object.fromEntries(
      Object.entries(USERS).map(([key, user]) => [key, userIdByUsername.get(user.username)])
    ),
  };

  const missing = [
    ...Object.entries(ids.teams).map(([key, id]) => [`team ${key}`, id]),
    ['source', ids.source],
    ['formula source', ids.formulaSource],
    ...Object.entries(ids.countrySources).map(([key, id]) => [`${key} source`, id]),
    ...Object.entries(ids.reports)
      .filter(([key]) => key !== 'comment')
      .map(([key, id]) => [`${key} report`, id]),
    ['public incident', ids.incidents.public],
    ['restricted incident', ids.incidents.restricted],
    ...Object.entries(ids.teamIncidents).map(([teamKey, id]) => [`${teamKey} incident`, id]),
    ...Object.entries(ids.users).map(([key, id]) => [`user ${key}`, id]),
  ].filter(([, id]) => !id).map(([label]) => label);

  if (missing.length > 0) {
    throw new Error(
      `Smoke fixtures are missing (${missing.join(', ')}). ` +
      'Run: ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed'
    );
  }

  return ids;
};

module.exports = {
  ACCESS_COVERAGE,
  COUNTRY_SOURCES,
  CREDENTIAL_NAME,
  CUTOFF_DATE,
  FIXTURE_KEY,
  FORMULA_SOURCE_NICKNAME,
  KPI_RESULTS_FILE,
  PASSWORD_FILE,
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
  USERS,
  buildIodaMetadata,
  checkAccessCoverage,
  describeMemberships,
  generatePassword,
  loadFixtureIds,
  readKpiResults,
  readPassword,
  removeKpiResults,
  removePassword,
  saveKpiResults,
  savePassword,
};
