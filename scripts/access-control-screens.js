'use strict';

// Logs in as every smoke fixture user, opens each page in PAGES, and saves a
// screenshot. Writes scratchpad/access-control-screens/index.html with one row
// per page and one column per user, so a reviewer can compare what each role
// sees side by side, and opens it in the default browser when done.
//
// Prerequisites:
//   ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed
//   npm run dev:backend and npm run dev:frontend (app on :8000, API on :3000)
//   npm run smoke:access:matrix   (for the report's matrix and KPI sections)
//
// Usage:
//   npm run smoke:access:screens
//   npm run smoke:access:screens -- --only=incident   (filter pages by name)
//   npm run smoke:access:screens -- --no-open         (don't open the report)
//   AGGIE_APP_URL=https://localhost:8000 npm run smoke:access:screens
//
// Pages with a `verify` hook also check something on the page (the incident
// access selector) and show the result under the screenshot.
//
// The report also shows the API permission matrix grid and the KPI check
// results saved by the last `npm run smoke:access:matrix`, with when it ran.
// This script makes no API checks itself; rerun the matrix to refresh them.

require('dotenv').config();

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const database = require('../backend/database');
const {
  readKpiResults,
  readMatrixResults,
  readPassword,
  TEAMS,
  TEAM_INCIDENTS,
  USERS,
  describeMemberships,
  loadFixtureIds,
} = require('../backend/scripts/access-control-fixtures');
const { buildUserContext } = require('../backend/scripts/access-control-matrix');

const APP_URL = (process.env.AGGIE_APP_URL || 'http://localhost:8000').replace(/\/$/, '');
const OUTPUT_DIR = path.join(__dirname, '..', 'scratchpad', 'access-control-screens');
// Users captured at the same time, each in its own browser context.
const CONCURRENCY = 4;

// The "Incident Access" box in the open incident form.
const accessSelector = (page) =>
  page.getByRole('dialog').locator('h3', { hasText: 'Incident Access' }).locator('xpath=..');

// Opens the Edit form from the incident page's "..." menu. With `restrict`,
// also switches Access Mode to "Restricted to teams" so the team list shows.
// Returns false when the page has no Edit option, for example because it
// redirected away from an incident the user can't see.
const openIncidentEditForm = async (page, waitForApiIdle, { restrict = false } = {}) => {
  const menuButtons = page.locator('button:has(svg[data-icon^="ellipsis"])');
  const editItem = page.getByText('Edit Incident', { exact: true });
  let found = false;
  for (let i = 0; i < await menuButtons.count() && !found; i += 1) {
    await menuButtons.nth(i).click();
    found = await editItem.waitFor({ timeout: 1000 }).then(() => true, () => false);
    if (!found) await page.keyboard.press('Escape');
  }
  if (!found) return false;

  await editItem.click();
  await page.getByRole('dialog').waitFor();
  if (restrict && await accessSelector(page).count() > 0) {
    await accessSelector(page).locator('button[id^="headlessui-listbox-button"]').click();
    await page.getByRole('option', { name: 'Restricted to teams' }).click();
  }
  await waitForApiIdle({ fresh: true });
  return true;
};

// The selector must list exactly the fixture teams GET /api/team/incident-access
// should return for this user (other teams in the database are ignored). If
// the form hides the selector, the user must have no such teams.
const verifyAccessSelector = async (page, u, opened) => {
  if (!opened) return { status: 'skipped', message: 'no Edit form, not checked' };
  const expected = u.incidentAccessTeamKeys().map((teamKey) => TEAMS[teamKey].name).sort();
  const box = accessSelector(page);
  if (await box.count() === 0) {
    return expected.length === 0
      ? { status: 'pass', message: 'no access selector, as expected' }
      : { status: 'fail', message: `access selector hidden, expected ${expected.join(', ')}` };
  }
  const fixtureNames = new Set(Object.values(TEAMS).map((team) => team.name));
  const listed = (await box.locator('label span').allTextContents())
    .map((name) => name.trim())
    .filter((name) => fixtureNames.has(name))
    .sort();
  const matches = listed.length === expected.length && listed.every((name, i) => name === expected[i]);
  const describe = (names) => (names.length > 0 ? names.join(', ') : 'no teams');
  return matches
    ? { status: 'pass', message: `selector OK: ${describe(listed)}` }
    : { status: 'fail', message: `selector lists ${describe(listed)}, expected ${describe(expected)}` };
};

// Pages to capture. `path` receives the fixture ids from loadFixtureIds.
// `settle` waits for the page's own requests and its loading text to finish
// before the screenshot; the report lists and alert details need it.
// `action(page, waitForApiIdle)` runs before the screenshot, and
// `verify(page, u, actionResult)` after it, where `u` is the user's expected
// access from buildUserContext. verify returns { status: 'pass' | 'fail' |
// 'skipped', message }.
const PAGES = [
  { name: 'Dashboard', path: () => '/dashboard' },
  { name: 'Alerts', path: () => '/alerts', settle: true },
  { name: 'Alert detail', path: (f) => `/alerts/${f.reports.before}`, settle: true },
  { name: 'France alert', path: (f) => `/alerts/${f.reports.france}`, settle: true },
  { name: 'Mexico alert', path: (f) => `/alerts/${f.reports.mexico}`, settle: true },
  { name: 'Social media posts', path: () => '/mediaposts', settle: true },
  { name: 'Incidents', path: () => '/incidents' },
  { name: 'Public incident', path: (f) => `/incidents/${f.incidents.public}` },
  { name: 'Team incident', path: (f) => `/incidents/${f.incidents.restricted}` },
  ...Object.keys(TEAM_INCIDENTS).map((teamKey) => ({
    name: `${TEAMS[teamKey].label} incident`,
    path: (f) => `/incidents/${f.teamIncidents[teamKey]}`,
  })),
  {
    name: 'Edit public incident form',
    path: (f) => `/incidents/${f.incidents.public}`,
    action: (page, waitForApiIdle) => openIncidentEditForm(page, waitForApiIdle, { restrict: true }),
    verify: verifyAccessSelector,
  },
  {
    name: 'Edit team incident form',
    path: (f) => `/incidents/${f.incidents.restricted}`,
    action: (page, waitForApiIdle) => openIncidentEditForm(page, waitForApiIdle),
    verify: verifyAccessSelector,
  },
  { name: 'New incident', path: () => '/incidents/new' },
  { name: 'Sources', path: () => '/settings/sources' },
  { name: 'Source detail', path: (f) => `/settings/source/${f.source}` },
  { name: 'France source', path: (f) => `/settings/source/${f.countrySources.france}` },
  { name: 'Mexico source', path: (f) => `/settings/source/${f.countrySources.mexico}` },
  { name: 'Tags', path: () => '/settings/tags' },
  { name: 'Users', path: () => '/settings/users' },
  { name: 'Teams', path: () => '/settings/teams' },
  { name: 'Team detail', path: (f) => `/settings/team/${f.team}` },
  { name: 'Team C detail', path: (f) => `/settings/team/${f.teams.teamC}` },
  { name: 'Credentials', path: () => '/settings/credentials' },
  { name: 'Connections', path: () => '/settings/connections' },
  { name: 'KPIs', path: () => '/settings/kpis' },
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const login = async (context, username, password) => {
  const res = await context.request.post(`${APP_URL}/login`, {
    data: { username, password },
  });
  if (!res.ok()) throw new Error(`Login failed for ${username}: HTTP ${res.status()}`);
  const body = await res.json().catch(() => ({}));
  if (body.mfa_required) {
    throw new Error(`Login for ${username} requires MFA. Smoke users should not have MFA enrolled.`);
  }
};

// Resolves once the page has no /api requests in flight and has been quiet for
// quietMs. The app's socket connection never goes idle, so Playwright's
// 'networkidle' would always wait for its full timeout.
const trackApiRequests = (page) => {
  let inFlight = 0;
  let lastChange = Date.now();
  const isApi = (request) => new URL(request.url()).pathname.startsWith('/api/');
  const settle = (request) => {
    if (!isApi(request)) return;
    inFlight = Math.max(0, inFlight - 1);
    lastChange = Date.now();
  };
  page.on('request', (request) => {
    if (!isApi(request)) return;
    inFlight += 1;
    lastChange = Date.now();
  });
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);

  // With `fresh`, the quiet period starts no earlier than the call, so quiet
  // time left over from the previous page can't end the wait before this
  // page has sent its requests.
  return async ({ quietMs = 500, timeoutMs = 10000, fresh = false } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const quietSince = fresh ? Math.max(lastChange, start) : lastChange;
      if (inFlight === 0 && Date.now() - quietSince >= quietMs) return;
      await page.waitForTimeout(100);
    }
  };
};

// Shown while a settled page loads: the report list, the alert detail
// beside it, and the outage chart and OONI history inside the detail.
const LOADING_TEXTS = ['Loading data...', '...loading', 'Loading…', 'Loading last 14 days…'];

const waitForLoadingText = (page) => page.waitForFunction(
  (texts) => !texts.some((text) => document.body.innerText.includes(text)),
  LOADING_TEXTS,
  { timeout: 8000 }
).catch(() => {});

const capture = async (page, waitForApiIdle, target, url, file, userContext) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (target.settle) {
    await waitForApiIdle({ fresh: true });
    await waitForLoadingText(page);
    await waitForApiIdle({ fresh: true });
  } else {
    await waitForApiIdle();
  }
  // Read the path before the action, which may open a dialog but not navigate.
  const finalPath = new URL(page.url()).pathname;
  const actionResult = target.action ? await target.action(page, waitForApiIdle) : undefined;
  await page.screenshot({ path: file, fullPage: true });
  const verify = target.verify ? await target.verify(page, userContext, actionResult) : null;
  return { finalPath, verify };
};

const formatTime = (date) => date.toLocaleString();

const formatDuration = (ms) => {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
};

const userHeaderCells = (userKeys) => userKeys.map((key) => {
  const user = USERS[key];
  // Saved matrix results can name a user since removed from the fixtures.
  if (!user) return `<th>${escapeHtml(key)}</th>`;
  const memberships = describeMemberships(key);
  const membership = memberships ? `<br>${escapeHtml(memberships)}` : '';
  return `<th>${escapeHtml(key)}<small>${escapeHtml(user.role)}${membership}</small></th>`;
}).join('');

const columnGroup = (userKeys) =>
  `<colgroup><col class="label">${userKeys.map(() => '<col>').join('')}</colgroup>`;

const renderScreenshots = ({ pages, userKeys, results }) => {
  const failures = pages.flatMap((page) => userKeys
    .map((key) => [key, results[page.name][key]])
    .filter(([, result]) => result && result.verify && result.verify.status === 'fail')
    .map(([key, result]) => `${page.name} as ${key}: ${result.verify.message}`));
  const verifySummary = failures.length === 0
    ? ''
    : `<p class="error">${failures.length} page check(s) failed:</p><ul class="error">` +
      failures.map((line) => `<li>${escapeHtml(line)}</li>`).join('') + '</ul>';

  const rows = pages.map((page) => {
    const cells = userKeys.map((key) => {
      const result = results[page.name][key];
      if (!result) return '<td class="pending">not captured</td>';
      if (result.error) return `<td class="error">${escapeHtml(result.error)}</td>`;
      const redirected = result.finalPath !== result.requestedPath;
      const caption = `${page.name}: ${key} (${result.finalPath})`;
      const verify = result.verify
        ? `<span class="verify ${result.verify.status}">${escapeHtml(result.verify.message)}</span>`
        : '';
      // One link holds the screenshot and its path, and stretches over the
      // whole cell so a click anywhere in it opens the screenshot.
      return `<td class="shot-cell"><a class="shot" href="${result.file}" data-caption="${escapeHtml(caption)}">` +
        `<img src="${result.file}" loading="lazy" alt="">` +
        `<span class="${redirected ? 'redirect' : 'path'}">${redirected ? 'redirected to ' : ''}${escapeHtml(result.finalPath)}</span>` +
        `${verify}</a></td>`;
    }).join('');
    return `<tr><th scope="row">${escapeHtml(page.name)}</th>${cells}</tr>`;
  }).join('\n');

  return `<p>Click a screenshot or its path to view it full size (Esc or click outside it to close). The last one opened stays outlined. Orange paths mean the page redirected. Green or red text under a path is that page's check.</p>
${verifySummary}
<table>
${columnGroup(userKeys)}
<thead><tr><th></th>${userHeaderCells(userKeys)}</tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
};

const renderMatrix = (matrix) => {
  if (!matrix) {
    return '<p class="pending">No matrix results yet. Run <code>npm run smoke:access:matrix</code> ' +
      'to generate them.</p>';
  }

  const { ranAt, baseUrl, filter, checkNames, userKeys, results, mismatches } = matrix;
  const rows = checkNames.map((name) => {
    const cells = userKeys.map((key) => {
      const { expected, actual, status, detail } = results[name][key];
      if (actual === expected) {
        return `<td class="${actual}">${actual}</td>`;
      }
      const reason = `expected ${expected}, HTTP ${status}${detail ? `: ${detail}` : ''}`;
      return `<td class="mismatch" title="${escapeHtml(reason)}">` +
        `${actual.toUpperCase()}!<small>${escapeHtml(reason)}</small></td>`;
    }).join('');
    return `<tr><th scope="row">${escapeHtml(name)}</th>${cells}</tr>`;
  }).join('\n');

  const summary = mismatches.length === 0
    ? `<p class="ok">All ${checkNames.length * userKeys.length} checks match.</p>`
    : `<p class="error">${mismatches.length} mismatch(es):</p><ul class="error">` +
      mismatches.map((line) => `<li>${escapeHtml(line)}</li>`).join('') + '</ul>';

  const filtered = filter
    ? ` It ran with <code>--only=${escapeHtml(filter)}</code>, so only matching checks are shown.`
    : '';
  return `<p>Expected vs. actual API access for each user, from the last ` +
    `<code>npm run smoke:access:matrix</code>, run ${escapeHtml(formatTime(new Date(ranAt)))} ` +
    `against ${escapeHtml(baseUrl)}.${filtered} Rerun the matrix to refresh it.</p>` +
    `${summary}
<table class="matrix">
${columnGroup(userKeys)}
<thead><tr><th></th>${userHeaderCells(userKeys)}</tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
};

const renderKpi = (kpi) => {
  if (!kpi) {
    return '<p class="pending">No KPI results yet. Run <code>npm run smoke:access:matrix</code> ' +
      '(without <code>--only</code>, or with <code>--only=kpi</code>) to generate them.</p>';
  }
  const { ranAt, baseUrl, results } = kpi;
  const failed = results.filter(({ pass }) => !pass).length;
  const summary = failed === 0
    ? `<p class="ok">All ${results.length} KPI checks pass.</p>`
    : `<p class="error">${failed} of ${results.length} KPI checks failed.</p>`;
  const rows = results.map(({ name, pass, detail }) => `<tr class="${pass ? 'pass' : 'fail'}">` +
    `<td>${pass ? 'PASS' : 'FAIL'}</td><th scope="row">${escapeHtml(name)}</th>` +
    `<td>${pass ? '' : escapeHtml(detail || '')}</td></tr>`).join('\n');

  return `<p>From the last <code>npm run smoke:access:matrix</code>, run ` +
    `${escapeHtml(formatTime(new Date(ranAt)))} against ${escapeHtml(baseUrl)}. ` +
    'Rerun the matrix to refresh them.</p>' +
    `${summary}
<table class="kpi">
<colgroup><col class="result"><col class="check"><col></colgroup>
<thead><tr><th>Result</th><th>Check</th><th>Details</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
};

const writeIndex = (report) => {
  let timing = `started ${escapeHtml(formatTime(report.startedAt))}`;
  if (report.finishedAt) {
    timing += `, finished ${escapeHtml(formatTime(report.finishedAt))}` +
      ` (${formatDuration(report.finishedAt - report.startedAt)})`;
  } else if (report.stoppedAt) {
    timing += `, stopped early at ${escapeHtml(formatTime(report.stoppedAt))}`;
  } else {
    timing += ', still running';
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Access Control Screens</title>
<style>
  body { font: 13px system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
  h2 { margin-top: 32px; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; }
  col.label { width: 160px; }
  th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; overflow: hidden; }
  thead th { position: sticky; top: 0; z-index: 2; background: #f6f6f6; text-align: left; }
  th small, td small { display: block; font-weight: normal; color: #666; }
  tbody th { text-align: left; }
  img { display: block; width: 100%; max-height: 240px; object-fit: cover; object-position: top; border: 1px solid #eee; }
  .path { display: block; margin-top: 4px; color: #666; word-break: break-all; }
  .redirect { display: block; margin-top: 4px; color: #b45309; font-weight: 600; word-break: break-all; }
  .verify { display: block; margin-top: 4px; word-break: break-word; }
  .verify.pass { color: #15803d; }
  .verify.fail { color: #b91c1c; font-weight: 600; }
  .verify.skipped { color: #999; }
  .error { color: #b91c1c; }
  .ok { color: #15803d; }
  .pending { color: #999; }
  .matrix td.allow { background: #f0fdf4; color: #15803d; }
  .matrix td.deny { color: #999; }
  .matrix td.mismatch { background: #fef2f2; color: #b91c1c; font-weight: 600; }
  td.shot-cell { position: relative; padding: 0; }
  td.shot-cell:hover { background: #f8fafc; }
  a.shot { display: block; padding: 6px; color: inherit; text-decoration: none; }
  a.shot::after { content: ''; position: absolute; inset: 0; }
  td.shot-cell.selected { outline: 3px solid #2563eb; outline-offset: -3px; background: #eff6ff; }
  #viewer { position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column; background: rgba(0, 0, 0, 0.85); }
  #viewer[hidden] { display: none; }
  .viewer-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 16px; color: #fff; background: #111; }
  .viewer-bar span { min-width: 0; overflow-wrap: anywhere; }
  .viewer-bar button { flex-shrink: 0; font: inherit; padding: 4px 12px; cursor: pointer; }
  .viewer-body { flex: 1; overflow: auto; padding: 0 16px 16px; }
  #viewer-img { width: 100%; max-height: none; object-fit: contain; border: 0; }
  .kpi col.result { width: 64px; }
  .kpi col.check { width: 40%; }
  .kpi td, .kpi th { word-break: break-word; }
  .kpi tr.pass td:first-child { color: #15803d; }
  .kpi tr.fail td:first-child, .kpi tr.fail td:last-child { color: #b91c1c; font-weight: 600; }
</style>
</head>
<body>
<h1>Access control screens</h1>
<p>${escapeHtml(APP_URL)}, ${timing}.</p>
<h2>Screenshots</h2>
${renderScreenshots(report)}
<h2>API permission matrix</h2>
${renderMatrix(report.matrix)}
<h2>KPI checks</h2>
${renderKpi(report.kpi)}
<div id="viewer" hidden role="dialog" aria-modal="true" aria-labelledby="viewer-caption">
  <div class="viewer-bar"><span id="viewer-caption"></span><button type="button" id="viewer-close">Close (Esc)</button></div>
  <div class="viewer-body"><img id="viewer-img" alt=""></div>
</div>
<script>
  // Opens screenshots in an overlay instead of a new window, and outlines the
  // last one opened. The report is rewritten during a run, so the selection is
  // kept in sessionStorage to survive a reload.
  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewer-img');
  const viewerBody = viewer.querySelector('.viewer-body');
  const closeButton = document.getElementById('viewer-close');
  const storageKey = 'access-control-screens:selected';
  let opener = null;

  const select = (link) => {
    document.querySelectorAll('td.selected').forEach((cell) => cell.classList.remove('selected'));
    link.closest('td').classList.add('selected');
    try { sessionStorage.setItem(storageKey, link.getAttribute('href')); } catch (err) {}
  };
  const open = (link) => {
    select(link);
    opener = link;
    viewerImg.src = link.getAttribute('href');
    document.getElementById('viewer-caption').textContent = link.dataset.caption;
    viewer.hidden = false;
    viewerBody.scrollTop = 0;
    closeButton.focus();
  };
  const close = () => {
    viewer.hidden = true;
    viewerImg.removeAttribute('src');
    if (opener) opener.focus();
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a.shot');
    // Modified clicks still open the image in a new tab.
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(link);
  });
  closeButton.addEventListener('click', close);
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer || event.target === viewerBody) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !viewer.hidden) close();
  });

  try {
    const saved = sessionStorage.getItem(storageKey);
    const link = saved && [...document.querySelectorAll('a.shot')].find((a) => a.getAttribute('href') === saved);
    if (link) link.closest('td').classList.add('selected');
  } catch (err) {}
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);
};

const openInBrowser = (file) => {
  const [command, args] = {
    darwin: ['open', [file]],
    win32: ['cmd', ['/c', 'start', '', file]],
  }[process.platform] || ['xdg-open', [file]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Could not open a browser. Open ${file} manually.`));
  child.unref();
};

const main = async () => {
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
  const filter = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null;
  const pages = filter
    ? PAGES.filter((page) => page.name.toLowerCase().includes(filter))
    : PAGES;
  if (pages.length === 0) throw new Error(`No pages match "${filter}".`);

  await new Promise((resolve, reject) => {
    if (database.mongoose.connection.readyState === 1) return resolve();
    database.mongoose.connection.once('open', resolve);
    database.mongoose.connection.once('error', reject);
  });
  const fixtures = await loadFixtureIds();
  const password = readPassword();

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const userKeys = Object.keys(USERS);
  const indexPath = path.join(OUTPUT_DIR, 'index.html');
  const report = {
    pages,
    userKeys,
    results: Object.fromEntries(pages.map((page) => [page.name, {}])),
    startedAt: new Date(),
    finishedAt: null,
    stoppedAt: null,
    matrix: readMatrixResults(),
    kpi: readKpiResults(),
  };
  const { results } = report;
  writeIndex(report);

  // Ctrl+C still leaves a viewable index of whatever was captured.
  process.once('SIGINT', () => {
    report.stoppedAt = new Date();
    writeIndex(report);
    console.log(`\nStopped. Partial results: ${indexPath}`);
    process.exit(130);
  });

  if (!report.matrix) {
    console.log('No saved matrix results. Run npm run smoke:access:matrix to include them in the report.');
  }

  console.log('Capturing screenshots...');
  const browser = await chromium.launch();

  const captureUser = async (key) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    try {
      await login(context, USERS[key].username, password);
      const userContext = buildUserContext(key);
      const page = await context.newPage();
      const waitForApiIdle = trackApiRequests(page);
      for (const target of pages) {
        const requestedPath = target.path(fixtures);
        const file = `${slug(target.name)}/${key}.png`;
        fs.mkdirSync(path.join(OUTPUT_DIR, slug(target.name)), { recursive: true });
        const started = Date.now();
        try {
          const { finalPath, verify } = await capture(
            page,
            waitForApiIdle,
            target,
            `${APP_URL}${requestedPath}`,
            path.join(OUTPUT_DIR, file),
            userContext
          );
          results[target.name][key] = { file, requestedPath, finalPath, verify };
          const seconds = ((Date.now() - started) / 1000).toFixed(1);
          const failed = verify && verify.status === 'fail' ? `, CHECK FAILED: ${verify.message}` : '';
          console.log(`  ${key}: ${target.name} (${seconds}s${failed})`);
        } catch (err) {
          results[target.name][key] = { error: err.message.split('\n')[0] };
          console.log(`  ${key}: ${target.name} FAILED: ${err.message.split('\n')[0]}`);
        }
      }
    } catch (err) {
      pages.forEach((target) => {
        results[target.name][key] = { error: err.message.split('\n')[0] };
      });
      console.log(`  ${key}: FAILED: ${err.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
    writeIndex(report);
    console.log(`Finished ${key}`);
  };

  try {
    const queue = [...userKeys];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) await captureUser(queue.shift());
    });
    await Promise.all(workers);
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date();
  writeIndex(report);
  const failedChecks = Object.values(results)
    .flatMap((byUser) => Object.values(byUser))
    .filter((result) => result.verify && result.verify.status === 'fail').length;
  if (failedChecks > 0) console.log(`\n${failedChecks} page check(s) failed. See the report.`);
  console.log(`\nReport: ${indexPath}`);
  if (!process.argv.includes('--no-open')) openInBrowser(indexPath);
};

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.mongoose.connection.close();
  });
