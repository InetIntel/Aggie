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
// Restricted to the smoke team. The matrix changes its access policy and adds
// comments with uploads to it, and puts it back after each request, so no
// other check reads it.
const POLICY_INCIDENT_TITLE = 'Access Control Smoke Policy Incident';
const POLICY_INCIDENT_NOTES = 'Disposable incident whose access policy and comments the matrix changes and restores.';
// Attached to the restricted incident's comment. The file lives in the upload
// directory (getUploadDir in backend/api/utils/fileStorage.js), not MongoDB.
const ATTACHMENT_FILENAME = 'access-control-smoke-attachment.txt';
const ATTACHMENT_PATH = `/incidents/uploads/${ATTACHMENT_FILENAME}`;
const ATTACHMENT_CONTENT = 'Access-control smoke test attachment.\n';
// Uploaded by the matrix's upload check. The backend saves uploads as
// `<timestamp>_<name>`, so leftovers are found by this suffix.
const UPLOAD_FILENAME = 'access-control-smoke-upload.txt';
const isSmokeUpload = (fileName) => fileName.endsWith(`_${UPLOAD_FILENAME}`);
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

// The matrix saves its latest grid and KPI check results in scratchpad/ so the
// screens report can show them without making the requests again. Seeding and
// cleanup delete them, since they describe fixtures that no longer exist.
const resultsFile = (name) => {
  const file = path.join(__dirname, '..', '..', 'scratchpad', name);
  return {
    file,
    save: (data) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    },
    // Returns null when the matrix hasn't saved results since the last seed.
    read: () => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    remove: () => fs.rmSync(file, { force: true }),
  };
};

const matrixResults = resultsFile('access-control-matrix-results.json');
const kpiResults = resultsFile('access-control-kpi-results.json');
const MATRIX_RESULTS_FILE = matrixResults.file;
const KPI_RESULTS_FILE = kpiResults.file;
const { save: saveMatrixResults, read: readMatrixResults, remove: removeMatrixResults } = matrixResults;
const { save: saveKpiResults, read: readKpiResults, remove: removeKpiResults } = kpiResults;
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
  smokeViewer: {
    username: 'smoke_access_smoke_viewer',
    displayName: 'Smoke Test Team Viewer',
    email: 'smoke-access-smoke-viewer@example.invalid',
    role: 'viewer',
  },
  smokeMonitorNoEdit: {
    username: 'smoke_access_smoke_monitor_no_edit',
    displayName: 'Smoke Test Team Monitor (team edit denied)',
    email: 'smoke-access-smoke-monitor-no-edit@example.invalid',
    role: 'viewer',
  },
  smokeViewerCanEdit: {
    username: 'smoke_access_smoke_viewer_can_edit',
    displayName: 'Smoke Test Team Viewer (team edit allowed)',
    email: 'smoke-access-smoke-viewer-can-edit@example.invalid',
    role: 'viewer',
  },
  limitedMonitor: {
    username: 'smoke_access_limited_monitor',
    displayName: 'Smoke Test Limited Team Monitor',
    email: 'smoke-access-limited-monitor@example.invalid',
    role: 'viewer',
  },
  limitedLead: {
    username: 'smoke_access_limited_lead',
    displayName: 'Smoke Test Limited Team Lead',
    email: 'smoke-access-limited-lead@example.invalid',
    role: 'monitor',
  },
  inactiveMonitor: {
    username: 'smoke_access_inactive_monitor',
    displayName: 'Smoke Test Inactive Team Monitor (Germany)',
    email: 'smoke-access-inactive-monitor@example.invalid',
    role: 'viewer',
  },
};

// Team members get access to country_restricted sources whose countries
// overlap their teams' countryCodes. `active` (default true) and
// `permissionLimits` are written to the Team as given.
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
  // Team-wide deny list: no member gets 'edit data' on this team, leads included.
  limited: {
    label: 'Limited Team',
    name: 'Access Control Smoke Limited Team',
    description: 'Disposable team whose permission limits deny edit data.',
    countryCodes: [],
    permissionLimits: { deny: ['edit data'] },
  },
  // Inactive teams' countries stop granting country access, and incidents
  // can't be restricted to them.
  inactive: {
    label: 'Inactive Team (DE)',
    name: 'Access Control Smoke Inactive Team (DE)',
    description: 'Disposable inactive Germany-focused team for access-control smoke testing.',
    countryCodes: ['DE'],
    active: false,
  },
};

const isTeamActive = (teamKey) => TEAMS[teamKey].active !== false;

// Role each user holds on each team, keyed by user then team. Users not listed
// are not on any team.
const TEAM_MEMBERSHIPS = {
  alpha: { smoke: 'team_lead' },
  scopedMonitor: { smoke: 'monitor' },
  teamAMonitor: { teamA: 'monitor' },
  teamBMonitor: { teamB: 'monitor' },
  teamCMonitor: { teamC: 'monitor' },
  teamABMonitor: { teamA: 'monitor', teamB: 'monitor' },
  smokeViewer: { smoke: 'viewer' },
  smokeMonitorNoEdit: { smoke: 'monitor' },
  smokeViewerCanEdit: { smoke: 'viewer' },
  limitedMonitor: { limited: 'monitor' },
  limitedLead: { limited: 'team_lead' },
  inactiveMonitor: { inactive: 'monitor' },
};

// Per-team permission overrides on a membership, keyed by user then team.
const TEAM_MEMBERSHIP_OVERRIDES = {
  smokeMonitorNoEdit: { smoke: { allow: [], deny: ['edit data'] } },
  smokeViewerCanEdit: { smoke: { allow: ['edit data'], deny: [] } },
};

// Users added to each team's `leads` list, keyed by team.
const TEAM_LEADS = {
  smoke: ['alpha'],
  limited: ['limitedLead'],
};

// Incidents restricted to a single team, keyed by team.
const TEAM_INCIDENTS = Object.fromEntries(['teamA', 'teamB', 'teamC', 'limited'].map((teamKey) => {
  const label = TEAMS[teamKey].label;
  return [teamKey, {
    title: `Access Control Smoke ${label} Incident`,
    notes: `Disposable incident restricted to ${label} for access-control smoke testing.`,
  }];
}));

// Disabled country_restricted sources, each with one report. Germany is
// covered only by the inactive team.
const COUNTRY_SOURCES = {
  france: { label: 'France', nickname: 'Access Control Smoke France Source', countryCodes: ['FR'] },
  mexico: { label: 'Mexico', nickname: 'Access Control Smoke Mexico Source', countryCodes: ['MX'] },
  germany: { label: 'Germany', nickname: 'Access Control Smoke Germany Source', countryCodes: ['DE'] },
};

// Disabled team-restricted sources. `teams` are team keys. Each report is
// seeded with guid `${FIXTURE_KEY}-${sourceKey}-${reportKey}` and the given date
// as authoredAt.
const TEAM_SOURCES = {
  teamA: {
    label: 'Team A source',
    nickname: 'Access Control Smoke Team A Source',
    accessPolicy: { mode: 'restricted', teams: ['teamA'], cutoffDate: null },
    reports: { report: new Date('2026-03-01T12:00:00.000Z') },
  },
  // Public before CUTOFF_DATE; reports on or after it only reach the smoke team.
  publicUntil: {
    label: 'public-until source',
    nickname: 'Access Control Smoke Public Until Source',
    accessPolicy: { mode: 'public_until', teams: ['smoke'], cutoffDate: CUTOFF_DATE },
    reports: {
      before: new Date('2026-01-01T12:00:00.000Z'),
      after: new Date('2026-02-01T12:00:00.000Z'),
    },
  },
};

// Every fixture source, for lookups and cleanup.
const SOURCE_NICKNAMES = [
  SOURCE_NICKNAME,
  FORMULA_SOURCE_NICKNAME,
  ...Object.values(COUNTRY_SOURCES).map((source) => source.nickname),
  ...Object.values(TEAM_SOURCES).map((source) => source.nickname),
];

// Access restrictions the smoke tests know about, compared against the schemas
// by checkAccessCoverage before the matrix runs. `covered` values have
// fixtures and CHECKS; `knownGaps` are real restrictions with no coverage yet;
// `notAccess` Team fields don't control access. A value in none of the lists
// stops the matrix, so a new restriction can't land without someone deciding
// how it is tested.
const ACCESS_COVERAGE = {
  sourceModes: {
    covered: ['public', 'country_restricted', 'restricted', 'public_until'],
    knownGaps: [],
  },
  incidentModes: {
    covered: ['public', 'restricted'],
    knownGaps: [],
  },
  teamRoles: {
    covered: ['viewer', 'monitor', 'team_lead'],
    knownGaps: [],
  },
  teamFields: {
    covered: ['countryCodes', 'leads', 'active', 'permissionLimits'],
    knownGaps: [],
    notAccess: ['name', 'description'],
  },
  // Fields on User.teamMemberships[] (the per-team role and its overrides).
  teamMembershipFields: {
    covered: ['team', 'role', 'permissionOverrides'],
    knownGaps: [],
  },
};

// Top-level field names in a schema, without the bookkeeping fields.
const schemaFields = (schema) => [...new Set(Object.keys(schema.paths).map((p) => p.split('.')[0]))]
  .filter((field) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(field));

// Throws if a schema has an access mode, team role, Team field or team
// membership field that isn't in ACCESS_COVERAGE.
const checkAccessCoverage = () => {
  const Group = require('../models/group');
  const Source = require('../models/source');
  const Team = require('../models/team');
  const User = require('../models/user');
  const { TEAM_MEMBERSHIP_ROLES } = require('../access/teamMemberships');

  const actual = {
    sourceModes: Source.schema.path('accessPolicy.mode').enumValues,
    incidentModes: Group.schema.path('accessPolicy.mode').enumValues,
    teamRoles: TEAM_MEMBERSHIP_ROLES,
    teamFields: schemaFields(Team.schema),
    teamMembershipFields: schemaFields(User.schema.path('teamMemberships').schema),
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

// "monitor on Team A (FR)" style summary of a user's team roles, with any
// per-team overrides and team settings that change them.
const describeMemberships = (userKey) => Object.entries(TEAM_MEMBERSHIPS[userKey] || {})
  .map(([teamKey, role]) => {
    const { allow = [], deny = [] } = (TEAM_MEMBERSHIP_OVERRIDES[userKey] || {})[teamKey] || {};
    const notes = [
      ...allow.map((permission) => `allows ${permission}`),
      ...deny.map((permission) => `denies ${permission}`),
      ...(TEAMS[teamKey].permissionLimits?.deny || []).map((permission) => `team limit denies ${permission}`),
      ...(isTeamActive(teamKey) ? [] : ['team inactive']),
    ];
    return `${role} on ${TEAMS[teamKey].label}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`;
  })
  .join(', ');

// Seeded guid of a TEAM_SOURCES report.
const teamSourceReportGuid = (sourceKey, reportKey) => `${FIXTURE_KEY}-${sourceKey}-${reportKey}`;

// Looks up the seeded fixture documents so other scripts can target them.
// Requires an open database connection.
const loadFixtureIds = async () => {
  const Group = require('../models/group');
  const Report = require('../models/report');
  const Source = require('../models/source');
  const Team = require('../models/team');
  const User = require('../models/user');

  const { getUploadDir } = require('../api/utils/fileStorage');

  const teamNames = Object.values(TEAMS).map((team) => team.name);
  const [teams, sources, reports, incidents, users, attachmentIncident] = await Promise.all([
    Team.find({ name: { $in: teamNames } }).select('_id name').lean(),
    Source.find({ nickname: { $in: SOURCE_NICKNAMES } }).select('_id nickname').lean(),
    Report.find({ 'metadata.fixture': FIXTURE_KEY }).select('_id guid').lean(),
    Group.find({ tags: FIXTURE_KEY }).select('_id title').lean(),
    User.find({ username: { $in: Object.values(USERS).map((user) => user.username) } })
      .select('_id username')
      .lean(),
    Group.findOne({ tags: FIXTURE_KEY, 'comments.attachments.path': ATTACHMENT_PATH }).select('_id').lean(),
  ]);
  const attachmentOnDisk = fs.existsSync(path.join(getUploadDir(), ATTACHMENT_FILENAME));

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
    teamSources: Object.fromEntries(
      Object.entries(TEAM_SOURCES).map(([key, source]) => [key, sourceIdByNickname.get(source.nickname)])
    ),
    // Report ids keyed by source key, then report key.
    teamSourceReports: Object.fromEntries(
      Object.entries(TEAM_SOURCES).map(([sourceKey, source]) => [sourceKey, Object.fromEntries(
        Object.keys(source.reports).map((reportKey) => [
          reportKey,
          reportByGuid.get(teamSourceReportGuid(sourceKey, reportKey)),
        ])
      )])
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
      policy: incidentByTitle.get(POLICY_INCIDENT_TITLE),
    },
    attachment: attachmentIncident && attachmentOnDisk ? ATTACHMENT_PATH : undefined,
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
    ...Object.entries(ids.teamSources).map(([key, id]) => [`${key} source`, id]),
    ...Object.entries(ids.teamSourceReports).flatMap(([sourceKey, reports]) =>
      Object.entries(reports).map(([reportKey, id]) => [`${sourceKey} ${reportKey} report`, id])),
    ...Object.entries(ids.reports)
      .filter(([key]) => key !== 'comment')
      .map(([key, id]) => [`${key} report`, id]),
    ['public incident', ids.incidents.public],
    ['restricted incident', ids.incidents.restricted],
    ['policy incident', ids.incidents.policy],
    ['incident attachment (in MongoDB and the upload directory)', ids.attachment],
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
  ATTACHMENT_CONTENT,
  ATTACHMENT_FILENAME,
  ATTACHMENT_PATH,
  COUNTRY_SOURCES,
  CREDENTIAL_NAME,
  CUTOFF_DATE,
  FIXTURE_KEY,
  FORMULA_SOURCE_NICKNAME,
  KPI_RESULTS_FILE,
  MATRIX_RESULTS_FILE,
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
  UPLOAD_FILENAME,
  USERS,
  buildIodaMetadata,
  checkAccessCoverage,
  describeMemberships,
  generatePassword,
  isSmokeUpload,
  isTeamActive,
  loadFixtureIds,
  readKpiResults,
  readMatrixResults,
  readPassword,
  removeKpiResults,
  removeMatrixResults,
  removePassword,
  saveKpiResults,
  saveMatrixResults,
  savePassword,
  teamSourceReportGuid,
};
