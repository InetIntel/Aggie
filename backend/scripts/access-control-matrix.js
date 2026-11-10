'use strict';

// Logs in as every smoke fixture user, calls each endpoint in CHECKS, and
// prints a user x check grid comparing the expected outcome to what the API
// returned. Then runs the KPI checks (access-control-kpi.js), which act as a
// few fixture users and verify KPI team tagging, shared counts and the CSV
// export. The grid leaves the fixtures as seeded (checks that change a fixture
// put it back); the KPI checks add fixture reports and KPI events, which
// cleanup removes. Saves both results to scratchpad/ for the screens report
// (scripts/access-control-screens.js). Exits non-zero on any mismatch or
// failed KPI check.
//
// Prerequisites:
//   ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed
//   npm run dev:backend   (ADMIN_PARTY must not be true)
//
// Usage:
//   npm run smoke:access:matrix
//   npm run smoke:access:matrix -- --only=incident   (filter checks by name;
//                                                     skips the KPI checks unless
//                                                     the filter matches "kpi")
//   AGGIE_API_URL=http://127.0.0.1:3000 npm run smoke:access:matrix

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const database = require('../database');
const Group = require('../models/group');
const { hasPermission } = require('../access/permissions');
const { getTeamIdsWithPermission, getTeamPermissions } = require('../access/teamMemberships');
const { canExportKpis, getKpiAccess } = require('../access/kpiAccess');
const {
  canModifyIncidentWithScope,
  canSetIncidentPolicy,
  canViewIncident,
} = require('../access/incidentAccess');
const { canViewSource, canViewSourceDataForDate } = require('../access/sourceAccess');
const { getUploadDir } = require('../api/utils/fileStorage');
const {
  readPassword,
  saveKpiResults,
  saveMatrixResults,
  COUNTRY_SOURCES,
  PUBLIC_INCIDENT_NOTES,
  RESTRICTED_INCIDENT_NOTES,
  TEAMS,
  TEAM_INCIDENTS,
  TEAM_LEADS,
  TEAM_MEMBERSHIPS,
  TEAM_MEMBERSHIP_OVERRIDES,
  TEAM_SOURCES,
  UPLOAD_FILENAME,
  USERS,
  checkAccessCoverage,
  describeMemberships,
  isSmokeUpload,
  isTeamActive,
  loadFixtureIds,
} = require('./access-control-fixtures');

const BASE_URL = (process.env.AGGIE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

// A well-formed id that matches no document. Destructive checks target it so an
// allowed request reaches the controller and gets a 404 without deleting anything.
const MISSING_ID = '000000000000000000000000';

// Sources as the access helpers read them, with team keys as ids (see
// buildUserContext).
const countrySourceDoc = ({ countryCodes }) => ({
  accessPolicy: { mode: 'country_restricted', teams: [], cutoffDate: null },
  countryCodes,
});
const teamSourceDoc = ({ accessPolicy }) => ({ accessPolicy, countryCodes: [] });

// The policy incident's seeded access policy, which its checks put back.
const POLICY_INCIDENT_POLICY = { mode: 'restricted', teams: ['smoke'] };

// Puts the policy incident back as seeded: its access policy, and no comments.
// Deletes files uploaded to its comments (only smoke uploads, by name).
const resetPolicyIncident = async (f) => {
  const incident = await Group.findById(f.incidents.policy).select('comments').lean();
  (incident ? incident.comments : [])
    .flatMap((comment) => comment.attachments || [])
    .map((attachment) => path.basename(attachment.path || ''))
    .filter(isSmokeUpload)
    .forEach((fileName) => fs.rmSync(path.join(getUploadDir(), fileName), { force: true }));
  await Group.updateOne(
    { _id: f.incidents.policy },
    { $set: { accessPolicy: { mode: 'restricted', teams: [f.team] }, comments: [], commentsLength: 0 } }
  ).exec();
};

const sameKeys = (first, second) => {
  const [a, b] = [[...first].sort(), [...second].sort()];
  return a.length === b.length && a.every((key, i) => key === b[i]);
};
const listKeys = (keys) => (keys.length > 0 ? keys.join(', ') : 'none');

// Each check is one request made as every fixture user.
//   permission: expected outcome is hasPermission(user, permission).
//   expect(u):  use instead of `permission` when the route adds team scope or
//               controller rules on top of the role permission. `u` is described
//               in buildUserContext below.
//   hidden:     the route answers 404 instead of 403 to hide the document, so a
//               404 counts as denied. Otherwise 404 counts as allowed, because it
//               means the request got past the permission checks.
//   deniedStatuses: other statuses that count as denied, for a route that
//               refuses some requests with a 400.
//   form(f, userKey): sends this multipart FormData instead of a JSON `body`.
//   expectBody(u, body, f): for a request that is allowed as expected, checks
//               the JSON response (or what the request saved). Returns true,
//               or a string saying what is wrong, or a promise of either; the
//               cell then shows BODY! instead of allow.
//   reset(f):   runs after every request of the check, through this script's
//               database connection, to put back a fixture the request may
//               have changed.
// Mutating checks only touch fixture documents or MISSING_ID, and write back the
// values the seed already stored (or use `reset`), so reruns leave the fixtures
// unchanged.
const CHECKS = [
  // Reading data
  { name: 'List reports', method: 'GET', path: () => '/api/report', permission: 'view data' },
  {
    name: 'View report',
    method: 'GET',
    path: (f) => `/api/report/${f.reports.before}`,
    permission: 'view data',
  },
  { name: 'List incidents', method: 'GET', path: () => '/api/group', permission: 'view data' },
  {
    name: 'View public incident',
    method: 'GET',
    path: (f) => `/api/group/${f.incidents.public}`,
    permission: 'view data',
  },
  {
    name: 'View team incident',
    method: 'GET',
    path: (f) => `/api/group/${f.incidents.restricted}`,
    hidden: true,
    // Restricted incidents are visible to admins and members of the incident's
    // teams only. A global team lead who is not on the team cannot see it.
    expect: (u) => u.can('view data') && (u.isAdmin || u.onTeam('smoke')),
  },
  {
    name: 'View team incident attachment',
    method: 'GET',
    // Outside /api, but served by the same backend.
    path: (f) => f.attachment,
    hidden: true,
    expect: (u) => u.can('view data') && (u.isAdmin || u.onTeam('smoke')),
  },
  {
    name: 'List reports in team incident',
    method: 'GET',
    path: (f) => `/api/report?groupId=${f.incidents.restricted}`,
    hidden: true,
    expect: (u) => u.can('view data') && (u.isAdmin || u.onTeam('smoke')),
  },
  { name: 'List sources', method: 'GET', path: () => '/api/source', permission: 'view data' },
  { name: 'List tags', method: 'GET', path: () => '/api/tag', permission: 'view data' },
  {
    name: 'Dashboard overview',
    method: 'GET',
    path: () => '/api/analytics/overview',
    permission: 'view data',
  },
  {
    name: 'Trends',
    method: 'GET',
    path: () => '/api/visualization/media',
    permission: 'manage trends',
  },

  // Editing data
  {
    name: 'Edit report (no team)',
    method: 'PATCH',
    path: () => '/api/report/_read',
    body: (f) => ({ ids: [f.reports.before], read: false }),
    permission: 'edit data',
  },
  {
    name: 'Edit report (team incident)',
    method: 'PATCH',
    path: () => '/api/report/_read',
    body: (f) => ({ ids: [f.reports.after], read: false }),
    // The report belongs to a team-restricted incident, so editors need global
    // scope (admin or global team lead) or edit rights on that team.
    expect: (u) => u.hasGlobalScope('edit data') || u.teamCan('smoke', 'edit data'),
  },
  {
    name: 'Edit public incident',
    method: 'PATCH',
    path: () => '/api/group/_notes',
    body: (f) => ({ ids: [f.incidents.public], notes: PUBLIC_INCIDENT_NOTES }),
    permission: 'edit data',
  },
  {
    name: 'Edit team incident',
    method: 'PATCH',
    path: () => '/api/group/_notes',
    body: (f) => ({ ids: [f.incidents.restricted], notes: RESTRICTED_INCIDENT_NOTES }),
    expect: (u) => u.isAdmin || u.teamCan('smoke', 'edit data'),
  },
  // Incidents restricted to Team A, B or C. Visible to admins and the team's
  // members; editable by admins and members with edit rights on that team.
  ...Object.entries(TEAM_INCIDENTS).flatMap(([teamKey, { notes }]) => [
    {
      name: `View ${TEAMS[teamKey].label} incident`,
      method: 'GET',
      path: (f) => `/api/group/${f.teamIncidents[teamKey]}`,
      hidden: true,
      expect: (u) => u.can('view data') && (u.isAdmin || u.onTeam(teamKey)),
    },
    {
      name: `Edit ${TEAMS[teamKey].label} incident`,
      method: 'PATCH',
      path: () => '/api/group/_notes',
      body: (f) => ({ ids: [f.teamIncidents[teamKey]], notes }),
      expect: (u) => u.isAdmin || u.teamCan(teamKey, 'edit data'),
    },
  ]),

  // Changing who can see an incident. Each check sends only `accessPolicy` to
  // the policy incident (restricted to the smoke team) and then puts the
  // seeded policy back. Expected results follow the PUT /api/group/:id chain:
  // edit scope, visibility, canSetIncidentPolicy, team scope, active teams.
  {
    name: 'Incident access teams',
    method: 'GET',
    path: () => '/api/team/incident-access',
    // Every signed-in user may ask; the list is the teams they may pick.
    expect: () => true,
    expectBody: (u, body, f) => {
      if (!Array.isArray(body)) return 'response is not a list';
      const keyById = new Map(Object.entries(f.teams).map(([key, id]) => [id, key]));
      const listed = body.map((team) => keyById.get(String(team._id))).filter(Boolean);
      const expected = u.incidentAccessTeamKeys();
      return sameKeys(listed, expected) || `lists ${listKeys(listed)}, expected ${listKeys(expected)}`;
    },
  },
  ...[
    ['Widen incident access (add Team A)', { mode: 'restricted', teams: ['smoke', 'teamA'] }],
    ['Make incident public', { mode: 'public', teams: [] }],
    // Admins get past every permission check and are refused with a 400.
    ['Restrict incident to inactive team', { mode: 'restricted', teams: ['smoke', 'inactive'] }, [400]],
  ].map(([name, policy, deniedStatuses]) => ({
    name,
    method: 'PUT',
    path: (f) => `/api/group/${f.incidents.policy}`,
    body: (f) => ({ accessPolicy: { mode: policy.mode, teams: policy.teams.map((key) => f.teams[key]) } }),
    hidden: true,
    deniedStatuses,
    expect: (u) => u.canChangeIncidentPolicy(POLICY_INCIDENT_POLICY, policy),
    reset: resetPolicyIncident,
  })),
  {
    // Same permission checks as `Edit team incident`, then the file is saved.
    // Sent to the policy incident (also restricted to the smoke team), whose
    // reset removes the comment and the uploaded file.
    name: 'Upload team incident attachment',
    method: 'PATCH',
    path: () => '/api/group/_comment_add',
    form: (f, userKey) => {
      const form = new FormData();
      form.append('ids[]', f.incidents.policy);
      form.append('comment[data]', 'ACCESS CONTROL SMOKE: upload check');
      form.append('comment[author]', f.users[userKey]);
      form.append(
        'comment[attachments]',
        new Blob(['Access-control smoke test upload.\n'], { type: 'text/plain' }),
        UPLOAD_FILENAME
      );
      return form;
    },
    expect: (u) => u.isAdmin || u.teamCan('smoke', 'edit data'),
    expectBody: async (u, body, f) => {
      const incident = await Group.findById(f.incidents.policy).select('comments').lean();
      const uploaded = (incident ? incident.comments : [])
        .flatMap((comment) => comment.attachments || [])
        .find((attachment) => attachment.fileName === UPLOAD_FILENAME);
      if (!uploaded) return 'no attachment saved on the incident';
      if (!fs.existsSync(path.join(getUploadDir(), path.basename(uploaded.path)))) {
        return 'attachment file missing from the upload directory';
      }
      return true;
    },
    reset: resetPolicyIncident,
  },

  // Country-focused teams. Team A covers France, Team B Mexico, Team C both,
  // and only the inactive team covers Germany. Members see country_restricted
  // sources whose countries overlap their active teams'. Editing also needs
  // edit rights on an active team that covers the country.
  ...Object.entries(COUNTRY_SOURCES).flatMap(([key, source]) => {
    const doc = countrySourceDoc(source);
    return [
      {
        name: `View ${source.label} source`,
        method: 'GET',
        path: (f) => `/api/source/${f.countrySources[key]}`,
        expect: (u) => u.canViewSourceDoc(doc),
      },
      {
        name: `View ${source.label} report`,
        method: 'GET',
        path: (f) => `/api/report/${f.reports[key]}`,
        expect: (u) => u.canViewSourceReport(doc, null),
      },
      {
        name: `Edit ${source.label} report`,
        method: 'PATCH',
        path: () => '/api/report/_read',
        body: (f) => ({ ids: [f.reports[key]], read: false }),
        expect: (u) => u.canEditSourceReport(doc, null),
      },
    ];
  }),

  // Team-restricted sources. The Team A source is visible to Team A members
  // only. The public-until source is public for reports before the cutoff;
  // the source itself, and later reports, are visible to the smoke team only.
  // Reports on either can be edited by global editors or members with edit
  // rights on one of the source's teams.
  ...Object.entries(TEAM_SOURCES).flatMap(([sourceKey, source]) => {
    const doc = teamSourceDoc(source);
    return [
      {
        name: `View ${source.label}`,
        method: 'GET',
        path: (f) => `/api/source/${f.teamSources[sourceKey]}`,
        expect: (u) => u.canViewSourceDoc(doc),
      },
      ...Object.entries(source.reports).flatMap(([reportKey, date]) => {
        const label = reportKey === 'report' ? `${source.label} report` : `${source.label} report ${reportKey} cutoff`;
        return [
          {
            name: `View ${label}`,
            method: 'GET',
            path: (f) => `/api/report/${f.teamSourceReports[sourceKey][reportKey]}`,
            expect: (u) => u.canViewSourceReport(doc, date),
          },
          {
            name: `Edit ${label}`,
            method: 'PATCH',
            path: () => '/api/report/_read',
            body: (f) => ({ ids: [f.teamSourceReports[sourceKey][reportKey]], read: false }),
            expect: (u) => u.canEditSourceReport(doc, date),
          },
        ];
      }),
    ];
  }),
  {
    name: 'Release report batch',
    method: 'PUT',
    path: () => '/api/report/batch',
    permission: 'edit data',
  },

  // Settings and sources
  {
    name: 'View credentials',
    method: 'GET',
    path: () => '/api/credential',
    permission: 'change settings',
  },
  {
    name: 'View settings',
    method: 'GET',
    path: () => '/api/setting/fetching',
    permission: 'change settings',
  },
  {
    name: 'Delete source',
    method: 'DELETE',
    path: () => `/api/source/${MISSING_ID}`,
    permission: 'manage sources',
  },
  {
    name: 'Delete tag',
    method: 'DELETE',
    path: () => `/api/tag/${MISSING_ID}`,
    permission: 'edit tags',
  },

  // Users and teams
  {
    name: 'User directory',
    method: 'GET',
    path: () => '/api/user/directory',
    permission: 'view users',
  },
  { name: 'List all users', method: 'GET', path: () => '/api/user', permission: 'view other users' },
  {
    name: 'Edit another user',
    method: 'PUT',
    path: (f) => `/api/user/${f.users.admin}`,
    body: () => ({}),
    // The role map grants 'update users' to viewers and monitors, but the
    // controller only lets admins edit other accounts.
    expect: (u) => u.isAdmin,
  },
  {
    name: 'Delete user',
    method: 'DELETE',
    path: () => `/api/user/${MISSING_ID}`,
    permission: 'delete users',
  },
  {
    name: 'Delete team',
    method: 'DELETE',
    path: () => `/api/team/${MISSING_ID}`,
    expect: (u) => u.isAdmin || u.role === 'team_lead',
  },
  {
    name: 'View user permissions',
    method: 'GET',
    path: (f) => `/api/permission/user/${f.users.admin}`,
    expect: (u) => u.isAdmin,
  },
  // KPI access comes from getKpiAccess: admins and holders of 'view all kpis'
  // see every team; team leads and members granted 'view team kpis' see only
  // their own teams. Exporting also needs 'export kpis' on every team in scope.
  { name: 'KPIs', method: 'GET', path: () => '/api/analytics/kpis', expect: (u) => u.kpi.canView },
  {
    name: 'Export KPIs',
    method: 'GET',
    path: () => '/api/analytics/kpis/export',
    expect: (u) => u.kpi.canView && canExportKpis(u.kpi, []),
  },
  {
    name: 'KPIs for Team A',
    method: 'GET',
    path: (f) => `/api/analytics/kpis?team=${f.teams.teamA}`,
    expect: (u) => u.kpi.canView && (u.kpi.global || u.kpi.teamIds.includes('teamA')),
  },
];

// Team settings the access helpers read (permissionLimits), keyed by team key.
const TEAM_SETTINGS = new Map(Object.entries(TEAMS).map(([teamKey, team]) => [
  teamKey,
  { _id: teamKey, active: isTeamActive(teamKey), permissionLimits: team.permissionLimits || { deny: [] } },
]));

// Mirrors the fields the access helpers read from a user document, using team
// keys as ids since the helpers only compare ids.
const buildUserContext = (key) => {
  const definition = USERS[key];
  const memberships = TEAM_MEMBERSHIPS[key] || {};
  const overrides = TEAM_MEMBERSHIP_OVERRIDES[key] || {};
  const user = {
    role: definition.role,
    permissionOverrides: definition.permissionOverrides,
    teams: Object.keys(memberships),
    teamMemberships: Object.entries(memberships).map(([team, role]) => ({
      team,
      role,
      permissionOverrides: overrides[team] || { allow: [], deny: [] },
    })),
  };
  const ledTeamIds = Object.keys(TEAM_LEADS).filter((teamKey) => TEAM_LEADS[teamKey].includes(key));
  const userTeamKeys = [...new Set([...user.teams, ...ledTeamIds])];
  const teamCan = (teamKey, permission) =>
    getTeamPermissions(user, teamKey, ledTeamIds, TEAM_SETTINGS).includes(permission);
  const isGlobalRole = ['admin', 'team_lead'].includes(user.role);

  // Edit scope as allowGlobalOrScoped builds it, or null when it refuses the
  // request.
  const editScope = (() => {
    const hasGlobal = hasPermission(user, 'edit data');
    if (isGlobalRole) {
      return hasGlobal ? { permission: 'edit data', global: true, allowUnscoped: true, teamIds: [] } : null;
    }
    const teamIds = getTeamIdsWithPermission(user, 'edit data', ledTeamIds, TEAM_SETTINGS);
    if (!hasGlobal && teamIds.length === 0) return null;
    return { permission: 'edit data', global: false, allowUnscoped: hasGlobal, teamIds };
  })();

  // As getSourceAccessUser: the countries of the user's active teams.
  const sourceUser = {
    ...user,
    teamCountryCodes: userTeamKeys.filter(isTeamActive).flatMap((teamKey) => TEAMS[teamKey].countryCodes),
  };
  const canSeeSourceReport = (source, date) => canViewSourceDataForDate(sourceUser, source, date);

  return {
    role: user.role,
    isAdmin: user.role === 'admin',
    // Member or lead of the given team.
    onTeam: (teamKey) => userTeamKeys.includes(teamKey),
    // Role permission after per-user overrides.
    can: (permission) => hasPermission(user, permission),
    // Permission granted by the user's role on the given team, after
    // per-team overrides and the team's permission limits.
    teamCan,
    // Admins and global team leads act on every team's data at once.
    hasGlobalScope: (permission) => isGlobalRole && hasPermission(user, permission),
    // GET /api/source/:id.
    canViewSourceDoc: (source) => hasPermission(user, 'view data') && canViewSource(sourceUser, source),
    // GET /api/report/:id for a report on the source dated `date`.
    canViewSourceReport: (source, date) => hasPermission(user, 'view data') && canSeeSourceReport(source, date),
    // PATCH /api/report/_read: the report must pass the source filter, then
    // canModifyReportsWithinScope (reportController.js) unless the scope is
    // global. Country sources belong to the scope's active teams that cover
    // the country; other non-public sources to their policy teams.
    canEditSourceReport: (source, date) => {
      if (!editScope || !canSeeSourceReport(source, date)) return false;
      if (editScope.global) return true;
      const { mode, teams } = source.accessPolicy;
      let reportTeamKeys = [];
      if (mode === 'country_restricted') {
        reportTeamKeys = editScope.teamIds.filter((teamKey) => isTeamActive(teamKey) &&
          TEAMS[teamKey].countryCodes.some((country) => source.countryCodes.includes(country)));
      } else if (mode !== 'public') {
        reportTeamKeys = teams;
      }
      if (reportTeamKeys.length === 0) return editScope.allowUnscoped;
      return reportTeamKeys.some((teamKey) => editScope.teamIds.includes(teamKey));
    },
    // Teams GET /api/team/incident-access returns: every active team for
    // admins and global team leads, otherwise the active teams where the user
    // has 'manage incident access'.
    incidentAccessTeamKeys: () => (isGlobalRole
      ? Object.keys(TEAMS)
      : getTeamIdsWithPermission(user, 'manage incident access', ledTeamIds, TEAM_SETTINGS)
    ).filter(isTeamActive),
    // PUT /api/group/:id with only `accessPolicy`: allowGlobalOrScoped,
    // requireIncidentParamAccess, then requireIncidentPolicyAccess.
    canChangeIncidentPolicy: (current, next) => {
      if (!editScope) return false;
      const incident = { accessPolicy: current };
      if (!canViewIncident(user, incident, ledTeamIds)) return false;
      if (!canModifyIncidentWithScope(editScope, incident)) return false;
      const policyTeamIds = user.role === 'admin'
        ? []
        : getTeamIdsWithPermission(user, 'manage incident access', ledTeamIds, TEAM_SETTINGS);
      if (!canSetIncidentPolicy(user, next, policyTeamIds, incident)) return false;
      if (!editScope.global) {
        if (next.mode === 'public' && !editScope.allowUnscoped) return false;
        if (next.mode === 'restricted' && !next.teams.every((teamKey) => editScope.teamIds.includes(teamKey))) {
          return false;
        }
      }
      return next.mode !== 'restricted' || next.teams.every(isTeamActive);
    },
    // KPI scope: { canView, global, teamIds, exportTeamIds, ... } with team keys as ids.
    kpi: getKpiAccess(user, [...TEAM_SETTINGS.values()], ledTeamIds),
  };
};

const expectedOutcome = (check, context) => {
  const allowed = check.expect ? check.expect(context) : context.can(check.permission);
  return allowed ? 'allow' : 'deny';
};

const actualOutcome = (check, status) => {
  if (status === 401 || status === 403) return 'deny';
  if (check.deniedStatuses && check.deniedStatuses.includes(status)) return 'deny';
  if (status === 404) return check.hidden ? 'deny' : 'allow';
  if (status >= 200 && status < 400) return 'allow';
  return 'error';
};

// fetch reports a dropped or refused connection only as "fetch failed", with
// the reason in err.cause. Says which request it was and why.
const fetchOrExplain = async (url, options, label) => {
  try {
    return await fetch(url, options);
  } catch (err) {
    const cause = err.cause ? err.cause.code || err.cause.message : null;
    throw new Error(
      `${label}: ${options.method} ${url} failed (${cause || err.message}). ` +
      'Is the backend running there? Check its terminal for a crash or restart.'
    );
  }
};

const login = async (username, password) => {
  const res = await fetchOrExplain(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, `Logging in as ${username}`);
  if (!res.ok) throw new Error(`Login failed for ${username}: HTTP ${res.status}`);

  const body = await res.json().catch(() => ({}));
  if (body.mfa_required) {
    throw new Error(`Login for ${username} requires MFA. Smoke users should not have MFA enrolled.`);
  }

  const jwtCookie = res.headers.getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .find((cookie) => cookie.startsWith('jwt='));
  if (!jwtCookie) throw new Error(`Login for ${username} did not return a jwt cookie.`);
  return jwtCookie;
};

const request = async (cookie, check, fixtures, userKey) => {
  const options = { method: check.method, headers: { Cookie: cookie } };
  if (check.form) {
    // fetch sets the multipart Content-Type and boundary.
    options.body = check.form(fixtures, userKey);
  } else if (check.body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(check.body(fixtures));
  }
  const res = await fetchOrExplain(
    `${BASE_URL}${check.path(fixtures)}`,
    options,
    `${check.name} as ${userKey}`
  );
  // Always read the body so the connection can be reused.
  const text = await res.text();
  let body = null;
  if (check.expectBody) {
    try {
      body = JSON.parse(text);
    } catch (err) {
      body = text;
    }
  }
  return { status: res.status, body };
};

const pad = (value, width) => String(value).padEnd(width);

const printGrid = (checks, userKeys, results) => {
  const nameWidth = Math.max(...checks.map((check) => check.name.length)) + 2;
  const columnWidth = Math.max(...userKeys.map((key) => key.length)) + 2;

  console.log(
    pad('', nameWidth) + userKeys.map((key) => pad(key, columnWidth)).join('')
  );
  checks.forEach((check) => {
    const cells = userKeys.map((key) => {
      const { expected, actual } = results[check.name][key];
      let cell;
      if (actual === expected) cell = actual === 'allow' ? 'allow' : '-';
      else cell = `${actual.toUpperCase()}!`;
      return pad(cell, columnWidth);
    });
    console.log(pad(check.name, nameWidth) + cells.join(''));
  });

  console.log('\nUsers:');
  userKeys.forEach((key) => {
    const memberships = describeMemberships(key);
    const membership = memberships ? `, ${memberships}` : '';
    console.log(`  ${pad(key, columnWidth)}${USERS[key].displayName} (role: ${USERS[key].role}${membership})`);
  });
};

const waitForDatabase = () => new Promise((resolve, reject) => {
  if (database.mongoose.connection.readyState === 1) return resolve();
  database.mongoose.connection.once('open', resolve);
  database.mongoose.connection.once('error', reject);
});

// Runs CHECKS (optionally filtered by name) as every fixture user. Requires an
// open database connection.
const runMatrix = async ({ filter = null } = {}) => {
  if (String(process.env.ADMIN_PARTY).toLowerCase() === 'true') {
    throw new Error('ADMIN_PARTY=true bypasses permission checks. Turn it off and restart the backend.');
  }

  checkAccessCoverage();

  const checks = filter
    ? CHECKS.filter((check) => check.name.toLowerCase().includes(filter))
    : CHECKS;
  if (checks.length === 0) throw new Error(`No checks match "${filter}".`);

  const fixtures = await loadFixtureIds();
  const password = readPassword();
  const userKeys = Object.keys(USERS);
  const results = Object.fromEntries(checks.map((check) => [check.name, {}]));
  const mismatches = [];

  for (const key of userKeys) {
    const cookie = await login(USERS[key].username, password);
    const context = buildUserContext(key);
    for (const check of checks) {
      const expected = expectedOutcome(check, context);
      let status;
      let actual;
      let detail = null;
      try {
        const response = await request(cookie, check, fixtures, key);
        status = response.status;
        actual = actualOutcome(check, status);
        // Before the reset, so it can look at what the request saved.
        if (actual === 'allow' && expected === 'allow' && check.expectBody) {
          const verdict = await check.expectBody(context, response.body, fixtures);
          if (verdict !== true) {
            actual = 'body';
            detail = typeof verdict === 'string' ? verdict : 'unexpected response body';
          }
        }
      } finally {
        if (check.reset) await check.reset(fixtures);
      }
      results[check.name][key] = { expected, actual, status, detail };
      if (actual !== expected) {
        mismatches.push(
          `${check.name} as ${key}: expected ${expected}, got HTTP ${status}${detail ? ` (${detail})` : ''}`
        );
      }
    }
  }

  return { baseUrl: BASE_URL, checks, userKeys, results, mismatches };
};

const main = async () => {
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
  const filter = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null;

  await waitForDatabase();
  const { checks, userKeys, results, mismatches } = await runMatrix({ filter });
  // For the screens report (scripts/access-control-screens.js).
  saveMatrixResults({
    ranAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    filter,
    checkNames: checks.map((check) => check.name),
    userKeys,
    results,
    mismatches,
  });

  console.log(`Access-control matrix against ${BASE_URL}\n`);
  printGrid(checks, userKeys, results);

  if (mismatches.length > 0) {
    console.log(`\n${mismatches.length} mismatch(es):`);
    mismatches.forEach((line) => console.log(`  ${line}`));
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${checks.length * userKeys.length} checks match.`);
  }

  if (filter && !filter.includes('kpi')) return;
  const { runKpiChecks } = require('./access-control-kpi');
  const kpiResults = await runKpiChecks({
    baseUrl: BASE_URL,
    login,
    fixtures: await loadFixtureIds(),
    password: readPassword(),
  });
  saveKpiResults({ ranAt: new Date().toISOString(), baseUrl: BASE_URL, results: kpiResults });
  console.log('\nKPI checks:');
  kpiResults.forEach(({ name, pass, detail }) => {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`);
  });
  const failed = kpiResults.filter(({ pass }) => !pass).length;
  if (failed > 0) {
    console.log(`\n${failed} KPI check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${kpiResults.length} KPI checks pass.`);
  }
};

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err.message || err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await database.mongoose.connection.close();
    });
}

// The screens script uses it for its access selector check.
module.exports = { buildUserContext };
