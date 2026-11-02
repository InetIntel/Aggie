'use strict';

// Logs in as every smoke fixture user, calls each endpoint in CHECKS, and
// prints a user x check grid comparing the expected outcome to what the API
// returned. Exits non-zero on any mismatch.
//
// Prerequisites:
//   ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed
//   npm run dev:backend   (ADMIN_PARTY must not be true)
//
// Usage:
//   npm run smoke:access:matrix
//   npm run smoke:access:matrix -- --only=incident   (filter checks by name)
//   AGGIE_API_URL=http://127.0.0.1:3000 npm run smoke:access:matrix

require('dotenv').config();

const database = require('../database');
const { hasPermission } = require('../access/permissions');
const { getTeamPermissions } = require('../access/teamMemberships');
const {
  readPassword,
  PUBLIC_INCIDENT_NOTES,
  RESTRICTED_INCIDENT_NOTES,
  TEAMS,
  TEAM_INCIDENTS,
  TEAM_LEADS,
  TEAM_MEMBERSHIPS,
  USERS,
  describeMemberships,
  loadFixtureIds,
} = require('./access-control-fixtures');

const BASE_URL = (process.env.AGGIE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

// A well-formed id that matches no document. Destructive checks target it so an
// allowed request reaches the controller and gets a 404 without deleting anything.
const MISSING_ID = '000000000000000000000000';

// Each check is one request made as every fixture user.
//   permission: expected outcome is hasPermission(user, permission).
//   expect(u):  use instead of `permission` when the route adds team scope or
//               controller rules on top of the role permission. `u` is described
//               in buildUserContext below.
//   hidden:     the route answers 404 instead of 403 to hide the document, so a
//               404 counts as denied. Otherwise 404 counts as allowed, because it
//               means the request got past the permission checks.
// Mutating checks only touch fixture documents or MISSING_ID, and write back the
// values the seed already stored, so reruns leave the fixtures unchanged.
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

  // Country-focused teams. Team A covers France, Team B Mexico, Team C both.
  // Members see country_restricted sources whose countries overlap their
  // teams'. Editing also needs edit rights on a team that covers the country.
  ...[['France', 'france', 'FR'], ['Mexico', 'mexico', 'MX']].flatMap(([label, key, country]) => [
    {
      name: `View ${label} source`,
      method: 'GET',
      path: (f) => `/api/source/${f.countrySources[key]}`,
      expect: (u) => u.can('view data') && (u.isAdmin || u.coversCountry(country)),
    },
    {
      name: `View ${label} report`,
      method: 'GET',
      path: (f) => `/api/report/${f.reports[key]}`,
      expect: (u) => u.can('view data') && (u.isAdmin || u.coversCountry(country)),
    },
    {
      name: `Edit ${label} report`,
      method: 'PATCH',
      path: () => '/api/report/_read',
      body: (f) => ({ ids: [f.reports[key]], read: false }),
      expect: (u) => u.isAdmin || u.teamCanInCountry(country, 'edit data'),
    },
  ]),
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
  { name: 'KPIs', method: 'GET', path: () => '/api/analytics/kpis', permission: 'admin users' },
];

// Mirrors the fields the access helpers read from a user document, using team
// keys as ids since the helpers only compare ids.
const buildUserContext = (key) => {
  const definition = USERS[key];
  const memberships = TEAM_MEMBERSHIPS[key] || {};
  const user = {
    role: definition.role,
    permissionOverrides: definition.permissionOverrides,
    teams: Object.keys(memberships),
    teamMemberships: Object.entries(memberships).map(([team, role]) => ({ team, role })),
  };
  const ledTeamIds = Object.keys(TEAM_LEADS).filter((teamKey) => TEAM_LEADS[teamKey].includes(key));
  const userTeamKeys = [...new Set([...user.teams, ...ledTeamIds])];
  const teamCan = (teamKey, permission) =>
    getTeamPermissions(user, teamKey, ledTeamIds).includes(permission);
  const teamKeysForCountry = (country) =>
    userTeamKeys.filter((teamKey) => TEAMS[teamKey].countryCodes.includes(country));

  return {
    role: user.role,
    isAdmin: user.role === 'admin',
    // Member or lead of the given team.
    onTeam: (teamKey) => userTeamKeys.includes(teamKey),
    // Role permission after per-user overrides.
    can: (permission) => hasPermission(user, permission),
    // Permission granted by the user's role on the given team.
    teamCan,
    // On at least one team focused on the country.
    coversCountry: (country) => teamKeysForCountry(country).length > 0,
    // Has the permission on at least one team focused on the country.
    teamCanInCountry: (country, permission) =>
      teamKeysForCountry(country).some((teamKey) => teamCan(teamKey, permission)),
    // Admins and global team leads act on every team's data at once.
    hasGlobalScope: (permission) =>
      ['admin', 'team_lead'].includes(user.role) && hasPermission(user, permission),
  };
};

const expectedOutcome = (check, context) => {
  const allowed = check.expect ? check.expect(context) : context.can(check.permission);
  return allowed ? 'allow' : 'deny';
};

const actualOutcome = (check, status) => {
  if (status === 401 || status === 403) return 'deny';
  if (status === 404) return check.hidden ? 'deny' : 'allow';
  if (status >= 200 && status < 400) return 'allow';
  return 'error';
};

const login = async (username, password) => {
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
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

const request = async (cookie, check, fixtures) => {
  const options = { method: check.method, headers: { Cookie: cookie } };
  if (check.body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(check.body(fixtures));
  }
  const res = await fetch(`${BASE_URL}${check.path(fixtures)}`, options);
  // Drain the body so the connection can be reused.
  await res.arrayBuffer();
  return res.status;
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

// Runs CHECKS (optionally filtered by name) as every fixture user. Also used by
// scripts/access-control-screens.js to include the grid in its HTML report.
// Requires an open database connection.
const runMatrix = async ({ filter = null } = {}) => {
  if (String(process.env.ADMIN_PARTY).toLowerCase() === 'true') {
    throw new Error('ADMIN_PARTY=true bypasses permission checks. Turn it off and restart the backend.');
  }

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
      const status = await request(cookie, check, fixtures);
      const expected = expectedOutcome(check, context);
      const actual = actualOutcome(check, status);
      results[check.name][key] = { expected, actual, status };
      if (actual !== expected) {
        mismatches.push(`${check.name} as ${key}: expected ${expected}, got HTTP ${status}`);
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

  console.log(`Access-control matrix against ${BASE_URL}\n`);
  printGrid(checks, userKeys, results);

  if (mismatches.length > 0) {
    console.log(`\n${mismatches.length} mismatch(es):`);
    mismatches.forEach((line) => console.log(`  ${line}`));
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${checks.length * userKeys.length} checks match.`);
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

module.exports = { runMatrix };
