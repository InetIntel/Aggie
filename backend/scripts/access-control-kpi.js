'use strict';

// KPI checks, run by access-control-matrix.js after the access grid. Acts as a
// few fixture users, then checks that their KPI events are tagged with the
// right teams, that per-team, shared and overall counts add up, and what the
// CSV export contains.
//
// KPI report actions count once per report per day, so every run triages its
// own new fixture reports, which keeps reruns on the same day deterministic.
// Counts are compared before and after the actions, so earlier activity
// doesn't matter, but nobody else should act as a smoke user, or as a user
// with no team, while this runs. Cleanup removes the reports and KPI events.

const crypto = require('crypto');
const KpiEvent = require('../models/kpiEvent');
const Report = require('../models/report');
const {
  COUNTRY_SOURCES,
  FIXTURE_KEY,
  FORMULA_SOURCE_NICKNAME,
  SOURCE_NICKNAME,
  TEAMS,
  USERS,
  buildIodaMetadata,
} = require('./access-control-fixtures');

// What each actor does to this run's reports (see createRunReports).
//   teamAMonitor:  ignores, investigates, then ignores R1 again (a France alert)
//   teamABMonitor: investigates R2 (a France alert)
//   outsider:      ignores R3 (a social post; outsider is on no team)
//   alpha:         links R4 (a public alert) to the smoke team's incident
// Every actor also logs in once.

// Expected change per team in the admin view. `shared` counts actions that
// also count for another team: teamABMonitor's are shared by Team A and B.
// Repeating the ignore on R1 doesn't count twice. Unlisted columns stay at 0.
const TEAM_DELTAS = {
  teamA: {
    totals: { login: 2, alerts_ignore: 1, alerts_investigate: 2 },
    shared: { login: 1, alerts_investigate: 1 },
  },
  teamB: {
    totals: { login: 1, alerts_investigate: 1 },
    shared: { login: 1, alerts_investigate: 1 },
  },
  smoke: { totals: { login: 1, alerts_assigned: 1 }, shared: {} },
  unassigned: { totals: { login: 1, social_ignore: 1 }, shared: {} },
};

// With Team A and B selected, teamABMonitor's actions count once.
const TEAM_AB_OVERALL_DELTA = { login: 2, alerts_ignore: 1, alerts_investigate: 2 };

// Teams each actor's KPI events must be tagged with.
const ACTOR_TEAMS = {
  teamAMonitor: ['teamA'],
  teamABMonitor: ['teamA', 'teamB'],
  outsider: [],
  alpha: ['smoke'],
};

// R1 ignore x2 + investigate, R2 investigate, R3 ignore, R4 assigned.
const TRIAGE_EVENT_COUNT = 6;

// The first columns of every KPI CSV row (reportCsv in backend/api/utils/kpiCsv.js).
const CSV_LEADING_HEADER = [
  'Row type', 'Team ID', 'Team', 'Start (UTC)', 'End (UTC)', 'Date (UTC)', 'Coverage',
  'Tracking started (UTC)',
];

// Unique login users don't change if the actor already logged in today.
const SKIPPED_COLUMNS = ['dailyUsers'];

const createRunReports = async (fixtures, runId) => {
  const now = new Date();
  const create = (n, sourceId, nickname, isOutageEvent) => Report.create({
    authoredAt: now,
    isOutageEvent,
    fetchedAt: now,
    storedAt: now,
    content: `ACCESS CONTROL SMOKE: KPI check report ${n}`,
    author: 'Smoke Fixture',
    guid: `${FIXTURE_KEY}-kpi-${runId}-${n}`,
    _sources: [sourceId],
    _sourceNicknames: [nickname],
    _media: ['ioda'],
    metadata: buildIodaMetadata(`kpi-${n}`, now),
  });
  const france = COUNTRY_SOURCES.france.nickname;
  return {
    r1: String((await create(1, fixtures.countrySources.france, france, true))._id),
    r2: String((await create(2, fixtures.countrySources.france, france, true))._id),
    r3: String((await create(3, fixtures.source, SOURCE_NICKNAME, false))._id),
    r4: String((await create(4, fixtures.source, SOURCE_NICKNAME, true))._id),
  };
};

const parseCsv = (text) => {
  const rows = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      rows[rows.length - 1].push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      rows[rows.length - 1].push(cell);
      cell = '';
      rows.push([]);
      i++;
    } else {
      cell += ch;
    }
  }
  rows[rows.length - 1].push(cell);
  return rows;
};

const sameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value));

// Columns whose change differs from `expected` (missing keys expect 0).
const deltaMismatches = (columns, before, after, expected) => columns
  .filter(({ key }) => !SKIPPED_COLUMNS.includes(key))
  .map(({ key }) => ({ key, actual: (after[key] ?? 0) - (before[key] ?? 0), want: expected[key] || 0 }))
  .filter(({ actual, want }) => actual !== want)
  .map(({ key, actual, want }) => `${key} changed by ${actual}, expected ${want}`);

const runKpiChecks = async ({ baseUrl, login, fixtures, password }) => {
  const results = [];
  const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });

  const call = async (cookie, method, path, body) => {
    const options = { method, headers: { Cookie: cookie } };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${path}`, options);
    // Buffer.toString keeps a leading BOM, which res.text() would strip.
    return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
  };

  const today = new Date().toISOString().slice(0, 10);
  const query = (params) => new URLSearchParams(
    Object.entries({ start: today, end: today, ...params }).filter(([, value]) => value !== undefined)
  ).toString();
  const getKpis = async (cookie, params = {}) => {
    const path = `/api/analytics/kpis?${query(params)}`;
    const { status, body } = await call(cookie, 'GET', path, null);
    if (status !== 200) throw new Error(`GET ${path} returned HTTP ${status}: ${body.toString().slice(0, 200)}`);
    return JSON.parse(body.toString());
  };

  const teamId = (key) => (key === 'unassigned' ? 'unassigned' : fixtures.teams[key]);
  const teamAB = `${fixtures.teams.teamA},${fixtures.teams.teamB}`;

  try {
    // Log in as admin before the baseline so that login isn't counted.
    const adminCookie = await login(USERS.admin.username, password);
    const reports = await createRunReports(fixtures, crypto.randomBytes(4).toString('hex'));
    const reportIds = Object.values(reports);

    const before = { all: await getKpis(adminCookie), ab: await getKpis(adminCookie, { team: teamAB }) };
    const runStart = new Date();

    const act = async (userKey, steps) => {
      const cookie = await login(USERS[userKey].username, password);
      for (const [label, path, body] of steps) {
        const { status, body: text } = await call(cookie, 'PATCH', path, body);
        check(`${userKey} can ${label}`, status === 200, `HTTP ${status}: ${text.toString().slice(0, 200)}`);
      }
      return cookie;
    };
    const irrelevance = (id, value) => ['/api/report/_irrelevance', { ids: [id], irrelevance: value }];
    await act('teamAMonitor', [
      ['ignore R1', ...irrelevance(reports.r1, 'true')],
      ['investigate R1', ...irrelevance(reports.r1, 'false')],
      ['ignore R1 again', ...irrelevance(reports.r1, 'true')],
    ]);
    await act('teamABMonitor', [['investigate R2', ...irrelevance(reports.r2, 'false')]]);
    await act('outsider', [['ignore R3', ...irrelevance(reports.r3, 'true')]]);
    const alphaCookie = await act('alpha', [[
      'link R4 to the smoke team incident',
      '/api/report/_group',
      { ids: [reports.r4], group: { _id: fixtures.incidents.restricted } },
    ]]);

    // Events are written in save hooks, which can finish just after the response.
    for (let waited = 0; waited < 5000; waited += 250) {
      const count = await KpiEvent.countDocuments({ subject: { $in: reportIds }, at: { $gte: runStart } });
      if (count >= TRIAGE_EVENT_COUNT) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Team tagging, read straight from the events.
    const actorIds = Object.keys(ACTOR_TEAMS).map((key) => fixtures.users[key]);
    const events = await KpiEvent.find({
      at: { $gte: runStart },
      $or: [{ actor: { $in: actorIds } }, { subject: { $in: reportIds } }],
    }).lean();
    const triage = events.filter((event) => reportIds.includes(event.subject));
    const untagged = triage.filter((event) => !event.actor || !Array.isArray(event.teamIds));
    check(
      'Triage events record the acting user and their teams',
      triage.length === TRIAGE_EVENT_COUNT && untagged.length === 0,
      `${triage.length} of ${TRIAGE_EVENT_COUNT} triage events recorded, ${untagged.length} missing actor or ` +
        'teamIds (missing teamIds means the request context was lost and they count as "Team not recorded")'
    );
    Object.entries(ACTOR_TEAMS).forEach(([userKey, teamKeys]) => {
      const expected = teamKeys.map((key) => fixtures.teams[key]);
      const own = events.filter((event) => event.actor === fixtures.users[userKey]);
      const wrong = own.filter((event) => !Array.isArray(event.teamIds) || !sameSet(event.teamIds, expected));
      const label = teamKeys.length ? teamKeys.map((key) => TEAMS[key].label).join(' and ') : 'no team';
      check(
        `${userKey}'s events are tagged with ${label}`,
        own.some((event) => event.kind === 'login') && own.length > 1 && wrong.length === 0,
        `${own.length} events (${own.map((event) => event.kind).join(', ') || 'none'}), ` +
          `${wrong.length} with other teamIds: ${JSON.stringify(wrong.map((event) => event.teamIds))}`
      );
    });

    // Per-team and shared counts.
    const after = { all: await getKpis(adminCookie), ab: await getKpis(adminCookie, { team: teamAB }) };
    const { columns } = after.all;
    Object.entries(TEAM_DELTAS).forEach(([key, expected]) => {
      const name = key === 'unassigned' ? 'No team' : TEAMS[key].label;
      const was = before.all.teams.find((team) => team.id === teamId(key));
      const now = after.all.teams.find((team) => team.id === teamId(key));
      if (!was || !now) {
        check(`${name} counts`, false, 'Team missing from the KPI response');
        return;
      }
      const totals = deltaMismatches(columns, was.totals, now.totals, expected.totals);
      check(`${name} counts`, totals.length === 0, totals.join('; '));
      const shared = deltaMismatches(columns, was.shared, now.shared, expected.shared);
      check(`${name} shared counts`, shared.length === 0, shared.join('; '));
    });
    const overall = deltaMismatches(columns, before.ab.totals, after.ab.totals, TEAM_AB_OVERALL_DELTA);
    check('Team A and B selected count shared actions once', overall.length === 0, overall.join('; '));
    check('No KPI write failures', after.all.writeWarning === false, 'writeWarning is true; check the backend log');

    // A team lead sees only their own team.
    const alphaView = await getKpis(alphaCookie);
    const smokeOnly = [fixtures.teams.smoke];
    check(
      'alpha sees only the smoke team',
      alphaView.globalAccess === false &&
        sameSet(alphaView.teamOptions.map((team) => team.id), smokeOnly) &&
        sameSet(alphaView.teams.map((team) => team.id), smokeOnly),
      `globalAccess ${alphaView.globalAccess}, teams ${alphaView.teamOptions.map((team) => team.name).join(', ')}`
    );

    // CSV export for Team A, compared with the JSON for the same request.
    const teamA = fixtures.teams.teamA;
    const json = await getKpis(adminCookie, { team: teamA, details: '1' });
    const exported = await call(adminCookie, 'GET', `/api/analytics/kpis/export?${query({ team: teamA })}`, null);
    check('Admin can export Team A', exported.status === 200, `HTTP ${exported.status}`);
    const bytes = exported.body;
    check('CSV starts with a UTF-8 BOM', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
    const rows = parseCsv(bytes.toString('utf8').replace(/^﻿/, ''));
    const header = rows[0];
    check(
      'CSV header starts with the row and team columns',
      CSV_LEADING_HEADER.every((name, i) => header[i] === name),
      header.slice(0, CSV_LEADING_HEADER.length).join(', ')
    );

    const values = (row, offset) => row.slice(offset, offset + json.columns.length);
    const expectedValues = (source) => json.columns.map(({ key }) => String(source[key] ?? ''));
    const first = CSV_LEADING_HEADER.length;
    const jsonTeam = json.teams.find((team) => team.id === teamA);
    const teamRow = rows.find((row) => row[0] === 'Team total' && row[1] === teamA);
    check(
      'CSV Team A total matches the JSON',
      teamRow && jsonTeam && teamRow[2] === TEAMS.teamA.name &&
        values(teamRow, first).every((value, i) => value === expectedValues(jsonTeam.totals)[i]),
      teamRow ? `CSV ${values(teamRow, first).join(',')} vs JSON ${jsonTeam && expectedValues(jsonTeam.totals).join(',')}` : 'No Team total row for Team A'
    );
    const sharedOffset = first + json.columns.length;
    check(
      'CSV Team A shared counts match the JSON',
      teamRow && jsonTeam &&
        values(teamRow, sharedOffset).every((value, i) => value === expectedValues(jsonTeam.shared)[i]),
      teamRow ? `CSV ${values(teamRow, sharedOffset).join(',')} vs JSON ${jsonTeam && expectedValues(jsonTeam.shared).join(',')}` : 'No Team total row for Team A'
    );
    const jsonDay = json.days.find((day) => day.date === today);
    const dayRow = rows.find((row) => row[0] === 'Daily total' && row[5] === today);
    check(
      'CSV daily total for today matches the JSON',
      dayRow && jsonDay && values(dayRow, first).every((value, i) => value === expectedValues(jsonDay)[i]),
      dayRow ? `CSV ${values(dayRow, first).join(',')} vs JSON ${jsonDay && expectedValues(jsonDay).join(',')}` : `No Daily total row for ${today}`
    );

    const column = (name) => header.indexOf(name);
    const usersRow = rows.find((row) => row[0] === 'Current total' && row[column('Metric')] === 'Users');
    check(
      'CSV counts Team A\'s 2 users',
      usersRow && usersRow[column('Value')] === '2',
      usersRow ? `Users is ${usersRow[column('Value')]}` : 'No Users row'
    );
    const sourceRows = rows.filter((row) => row[0] === 'Reports by source');
    const sourceRow = (id) => sourceRows.find((row) => row[column('Source ID')] === id);
    const franceRow = sourceRow(fixtures.countrySources.france);
    check(
      'CSV lists the France source with this run\'s alerts',
      franceRow && Number(franceRow[column('Alerts received')]) >= 2,
      franceRow ? `Alerts received is ${franceRow[column('Alerts received')]}` : 'France source missing'
    );
    check('CSV leaves out the Mexico source', !sourceRow(fixtures.countrySources.mexico));
    const formulaRow = sourceRow(fixtures.formulaSource);
    check(
      'CSV escapes a source name that starts with "="',
      formulaRow && formulaRow[column('Source / feed')] === `'${FORMULA_SOURCE_NICKNAME}`,
      formulaRow ? `Cell is ${formulaRow[column('Source / feed')]}` : 'Formula source missing'
    );

    const noTeam = await call(adminCookie, 'GET', `/api/analytics/kpis/export?${query({ team: 'unassigned' })}`, null);
    check(
      'CSV for "No team" has no current totals',
      noTeam.status === 200 && parseCsv(noTeam.body.toString('utf8')).some((row) => row[0] === 'Current totals unavailable'),
      `HTTP ${noTeam.status}`
    );
  } catch (err) {
    check('KPI checks could not finish', false, err.message || String(err));
  }

  if (new Date().toISOString().slice(0, 10) !== today) {
    check('Run stayed within one UTC day', false, 'The run crossed UTC midnight, so counts span two days. Rerun.');
  }
  return results;
};

module.exports = { runKpiChecks };
