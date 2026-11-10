'use strict';

// Opens every form and modal listed in
// docs/claude/architecture/form-button-layout.md, outlines its Submit/Cancel
// buttons, and saves a screenshot. Writes scratchpad/form-button-screens/index.html:
// one card per form with the component file, where it lives, the button layout
// the doc describes, and the screenshot. Opens the report when done.
//
// It never saves anything. It only opens forms and dialogs, and as a safety net
// it aborts every non-GET request the page makes, so a stray click can't write.
// Forms that can only be reached through a write (for example the Telegram
// code step) are listed in the report as not captured.
//
// Prerequisites:
//   npm run dev:backend and npm run dev:frontend (app on :8000, API on :3000)
//
// Signing in: the script uses its own browser profile in
// scratchpad/form-button-screens-profile and assumes it is already signed in,
// as an admin. If it isn't (the first run, or after the 12-hour session
// expires), a browser window opens on the login page; sign in there, MFA
// included, and the script carries on. The login is kept for later runs.
//
// Usage:
//   node scripts/form-button-screens.js
//   node scripts/form-button-screens.js --only=incident   (filter by title or component)
//   node scripts/form-button-screens.js --no-open         (don't open the report)
//   AGGIE_APP_URL=https://localhost:8000 node scripts/form-button-screens.js

require('dotenv').config();

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP_URL = (process.env.AGGIE_APP_URL || 'http://localhost:8000').replace(/\/$/, '');
const OUTPUT_DIR = path.join(__dirname, '..', 'scratchpad', 'form-button-screens');
// Kept outside OUTPUT_DIR, which is wiped on every run.
const PROFILE_DIR = path.join(__dirname, '..', 'scratchpad', 'form-button-screens-profile');
const CONTEXT_OPTIONS = { ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } };
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

// Thrown when the app has no data for a form (no incident with a comment, no
// enrolled passkey, ...). The report shows the reason instead of an error.
class Skip extends Error {}
const skip = (reason) => { throw new Skip(reason); };

const GROUPS = [
  { key: 'shared', title: 'Shared dialog' },
  { key: 'convention', title: 'Follows the convention (Cancel left, Submit right)' },
  { key: 'outlier', title: 'Outliers' },
  { key: 'submit-only', title: 'Submit with no Cancel' },
  { key: 'picker', title: 'Picker modals' },
];

// ---------------------------------------------------------------------------
// Page helpers

const dialogPanel = (page) => page.locator('[id^="headlessui-dialog-panel"]').last();

const button = (scope, name) => scope.getByRole('button', { name, exact: true }).first();

// The innermost `tag` element that contains every locator in `inner`.
const innermost = (page, tag, ...inner) => {
  let locator = page.locator(tag);
  inner.forEach((has) => { locator = locator.filter({ has }); });
  return locator.last();
};

// Clicks each menu button in turn until `itemText` shows up, then clicks the
// item. Returns false if no menu has it.
const openMenuItem = async (page, menuButtons, itemText) => {
  const item = page.getByText(itemText, { exact: true }).first();
  const count = await menuButtons.count();
  for (let i = 0; i < count; i += 1) {
    const menuButton = menuButtons.nth(i);
    if (!(await menuButton.isVisible())) continue;
    await menuButton.click();
    if (await item.waitFor({ timeout: 1000 }).then(() => true, () => false)) {
      await item.click();
      return true;
    }
    await page.keyboard.press('Escape');
  }
  return false;
};

const ellipsisButtons = (scope) => scope.locator('button:has(svg[data-icon="ellipsis"])');

const clickFirstEnabled = async (locator, reason) => {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    if (await locator.nth(i).isEnabled()) {
      await locator.nth(i).click();
      return;
    }
  }
  skip(reason);
};

// Resolves once the page has no /api requests in flight and has been quiet for
// quietMs. The socket connection never goes idle, so 'networkidle' can't be used.
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
  return async ({ quietMs = 500, timeoutMs = 10000 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const quietSince = Math.max(lastChange, start);
      if (inFlight === 0 && Date.now() - quietSince >= quietMs) return;
      await page.waitForTimeout(100);
    }
  };
};

// ---------------------------------------------------------------------------
// The forms. Each `open(page, { go, data })` navigates, opens the form, and
// returns { target, buttons }: `target` is the form or dialog panel (outlined
// thin and cropped for the close-up) and `buttons` its Submit/Cancel buttons
// (outlined thick). `data` holds ids fetched from the API before the run.

const SHOTS = [
  {
    group: 'shared',
    title: 'Confirmation dialog (logout)',
    component: 'src/components/ConfirmationDialog.tsx',
    where: 'Any page: navbar menu → Logout',
    layout: 'Two full-width buttons: Cancel left, Confirm right',
    enter: 'No (not a form)',
    open: async (page, { go }) => {
      await go('/dashboard');
      await page.locator('button:has(svg[data-icon="bars"])').first().click();
      await page.locator('button:has(svg[data-icon="right-from-bracket"])').first().click();
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Logout')] };
    },
  },

  // Convention -------------------------------------------------------------
  {
    group: 'convention',
    title: 'Create incident page',
    component: 'src/pages/incidents/CreateEditIncidentForm.tsx (FormikWithSchema), hosted by src/pages/incidents/NewIncident/index.tsx',
    where: '/incidents/new',
    layout: 'Cancel left, "Create Incident" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/incidents/new');
      const submit = button(page, 'Create Incident');
      const target = innermost(page, 'form', submit);
      return { target, buttons: [button(target, 'Cancel'), submit] };
    },
  },
  {
    group: 'convention',
    title: 'Edit incident (incident page)',
    component: 'src/pages/incidents/CreateEditIncidentForm.tsx, hosted by src/pages/incidents/Incident/index.tsx',
    where: '/incidents/:id → header "..." menu → Edit Incident',
    layout: 'Cancel left, "Update Incident" right',
    enter: 'Yes',
    open: async (page, { go, data }) => {
      if (!data.incidentId) skip('No incidents in the database.');
      await go(`/incidents/${data.incidentId}`);
      if (!(await openMenuItem(page, ellipsisButtons(page), 'Edit Incident'))) skip('No Edit Incident menu on the incident page.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Update Incident')] };
    },
  },
  {
    group: 'convention',
    title: 'Edit incident (incidents list view)',
    component: 'src/pages/incidents/CreateEditIncidentForm.tsx, hosted by src/pages/incidents/IncidentListItem.tsx',
    where: '/incidents (List view) → row "..." menu → Edit Incident',
    layout: 'Cancel left, "Update Incident" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/incidents');
      const listToggle = page.locator('[role="group"][aria-label="View mode"]').getByRole('button', { name: 'List' });
      if (await listToggle.count()) {
        await listToggle.click();
        await page.waitForTimeout(300);
      }
      if (!(await openMenuItem(page, ellipsisButtons(page), 'Edit Incident'))) skip('No incident rows with an Edit Incident menu.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Update Incident')] };
    },
  },
  {
    group: 'convention',
    title: 'Edit incident (incidents table view)',
    component: 'src/pages/incidents/CreateEditIncidentForm.tsx, hosted by src/pages/incidents/TableView/IncidentsTable.tsx',
    where: '/incidents?view=table → row pencil button',
    layout: 'Cancel left, "Update Incident" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/incidents?view=table');
      const edit = page.locator('button[title="Edit incident"]');
      if (!(await edit.count())) skip('No incident rows in the table.');
      await edit.first().click();
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Update Incident')] };
    },
  },
  {
    group: 'convention',
    title: 'Create incident from a dashboard activity',
    component: 'src/pages/incidents/CreateEditIncidentForm.tsx, hosted by src/pages/Dashboard/index.tsx',
    where: '/dashboard → Notable Activity card → New Incident',
    layout: 'Cancel left, "Create Incident" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/dashboard');
      await clickFirstEnabled(page.getByRole('button', { name: 'New Incident' }), 'No notable activity without a linked incident.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Create Incident')] };
    },
  },
  {
    group: 'convention',
    title: 'Add feed',
    component: 'src/pages/Settings/source/CreateEditSourceForm.tsx (FormikWithSchema), hosted by src/pages/Settings/Connections/ApiTypeSection.tsx',
    where: '/settings/connections → Add feed',
    layout: 'Cancel left, "Confirm" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/connections');
      await clickFirstEnabled(page.getByRole('button', { name: 'Add feed' }), 'No provider has a connection, so Add feed is disabled.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Confirm')] };
    },
  },
  {
    group: 'convention',
    title: 'Edit feed',
    component: 'src/pages/Settings/source/CreateEditSourceForm.tsx, hosted by src/pages/Settings/source/SourceDetailsView.tsx',
    where: '/settings/connections → feed "..." menu → Edit',
    layout: 'Cancel left, "Confirm" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/connections');
      if (!(await openMenuItem(page, ellipsisButtons(page), 'Edit'))) skip('No feeds.');
      const target = dialogPanel(page);
      await target.getByText('Loading feed…').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Confirm')] };
    },
  },
  ...[
    ['Junkipedia', 'Confirm', 'Cancel left, "Confirm" right'],
    ['Telegram', 'Send Code', 'Cancel left, "Send Code" right (first step of the Telegram user login)'],
    ['Mastodon', 'Authorize Mastodon', 'Cancel left, "Authorize Mastodon" right'],
  ].map(([provider, submitText, layout]) => ({
    group: 'convention',
    title: `Connect ${provider}`,
    component: 'src/pages/Settings/Credentials/CreateCredentialForm.tsx (FormikWithSchema), hosted by src/pages/Settings/Connections/ApiTypeSection.tsx',
    where: `/settings/connections → Connect ${provider}`,
    layout,
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/connections');
      const connect = page.getByRole('button', { name: `Connect ${provider}` });
      if (!(await connect.count())) skip(`No "Connect ${provider}" button.`);
      await connect.first().click();
      const target = dialogPanel(page);
      const submit = button(target, submitText);
      // Some providers show a picker step before the form; outline Cancel only then.
      if (!(await submit.waitFor({ timeout: 3000 }).then(() => true, () => false))) {
        return { target, buttons: [button(target, 'Cancel')] };
      }
      return { target, buttons: [button(target, 'Cancel'), submit] };
    },
  })),
  {
    group: 'convention',
    title: 'Rename connection',
    component: 'RenameConnectionForm in src/pages/Settings/Connections/ApiTypeSection.tsx (FormikWithSchema)',
    where: '/settings/connections → pencil on a connection pill',
    layout: 'Cancel left, "Save" right; "Delete connection" below on the left',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/connections');
      const edit = page.locator('button[title="Edit connection"]');
      if (!(await edit.count())) skip('No connections.');
      await edit.first().click();
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Save')] };
    },
  },
  {
    group: 'convention',
    title: 'Create user',
    component: 'src/pages/Settings/user/CreateEditUserForm.tsx, hosted by src/pages/Settings/user/UsersIndex.tsx',
    where: '/settings/users → Create New User',
    layout: 'Cancel left, "Confirm" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/users');
      await button(page, 'Create New User').click();
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Confirm')] };
    },
  },
  {
    group: 'convention',
    title: 'Edit user',
    component: 'src/pages/Settings/user/CreateEditUserForm.tsx, hosted by src/pages/Settings/user/UsersIndex.tsx',
    where: '/settings/users → row "..." menu → Edit',
    layout: 'Cancel left, "Confirm" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/users');
      if (!(await openMenuItem(page, ellipsisButtons(page), 'Edit'))) skip('No other users to edit.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Confirm')] };
    },
  },
  {
    group: 'convention',
    title: 'Change password',
    component: 'src/pages/Settings/user/SetPassword.tsx, hosted by src/pages/Settings/user/UsersIndex.tsx',
    where: '/settings/users → row "..." menu → Change Password',
    layout: 'Cancel left, "Confirm" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/users');
      if (!(await openMenuItem(page, ellipsisButtons(page), 'Change Password'))) skip('No users with Change Password.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Confirm')] };
    },
  },
  {
    group: 'convention',
    title: 'Create member (team page)',
    component: 'src/pages/Settings/user/CreateEditUserForm.tsx, hosted by src/pages/Settings/team/TeamDetails.tsx',
    where: '/settings/team/:id?tab=members → Create new member',
    layout: 'Cancel left, "Confirm" right',
    enter: 'Yes',
    open: async (page, { go, data }) => {
      if (!data.teamId) skip('No teams.');
      await go(`/settings/team/${data.teamId}?tab=members`);
      await clickFirstEnabled(page.getByRole('button', { name: 'Create new member' }), 'Create new member is disabled (inactive team?).');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Confirm')] };
    },
  },
  {
    group: 'convention',
    title: 'Create tag',
    component: 'src/pages/Settings/tag/CreateEditTagForm.tsx, hosted by src/pages/Settings/tag/TagsIndex.tsx',
    where: '/settings/tags → Create New Tag',
    layout: 'Cancel left, "Create tag" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/tags');
      await button(page, 'Create New Tag').click();
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Create tag')] };
    },
  },
  {
    group: 'convention',
    title: 'Edit tag',
    component: 'src/pages/Settings/tag/CreateEditTagForm.tsx, hosted by src/pages/Settings/tag/TagsIndex.tsx',
    where: '/settings/tags → tag "..." menu → Edit',
    layout: 'Cancel left, "Save changes" right',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/tags');
      if (!(await openMenuItem(page, ellipsisButtons(page), 'Edit'))) skip('No editable tags.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Save changes')] };
    },
  },
  {
    group: 'convention',
    title: 'AI tag feedback',
    component: 'src/components/GeneratedTagsList.tsx',
    where: 'Not rendered',
    layout: 'Cancel left, "Submit" right',
    enter: 'Yes',
    notCaptured: 'Nothing imports GeneratedTagsList, so this dialog never renders.',
  },

  // Outliers ---------------------------------------------------------------
  {
    group: 'outlier',
    title: 'Custom tag (Tags page)',
    component: 'src/components/Tags/SpecialTagForm.tsx, hosted by src/pages/Settings/tag/TagsIndex.tsx',
    where: '/settings/tags → ✦ Create custom tag',
    layout: 'Submit ("Create custom tag") LEFT, Cancel right of it; both grouped on the left',
    enter: 'No (not a form)',
    open: async (page, { go }) => {
      await go('/settings/tags');
      await button(page, '✦ Create custom tag').click();
      const submit = button(page, 'Create custom tag');
      const target = innermost(page, 'div', submit, page.getByText('Preview:'));
      return { target, buttons: [submit, button(target, 'Cancel')] };
    },
  },
  {
    group: 'outlier',
    title: 'Incident tags dialog',
    component: 'src/pages/incidents/Incident/IncidentTagsDialog.tsx',
    where: '/incidents/:id → Add tags / Edit tags',
    layout: 'Cancel then "Save tags", both grouped on the RIGHT; selected count on the left',
    enter: 'No (not a form)',
    open: async (page, { go, data }) => {
      if (!data.incidentId) skip('No incidents in the database.');
      await go(`/incidents/${data.incidentId}`);
      await page.locator('button:has(svg[data-icon="tags"])').first().click();
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel'), button(target, 'Save tags')] };
    },
  },
  {
    group: 'outlier',
    title: 'Custom tag (inside incident tags dialog)',
    component: 'src/components/Tags/SpecialTagForm.tsx, hosted by src/pages/incidents/Incident/IncidentTagsDialog.tsx',
    where: '/incidents/:id → Add tags / Edit tags → ✦ Create custom tag',
    layout: 'Submit ("Create custom tag") LEFT, Cancel right of it; the dialog\'s own Cancel / Save tags stay on the right below',
    enter: 'No (not a form)',
    open: async (page, { go, data }) => {
      if (!data.incidentId) skip('No incidents in the database.');
      await go(`/incidents/${data.incidentId}`);
      await page.locator('button:has(svg[data-icon="tags"])').first().click();
      const panel = dialogPanel(page);
      await button(panel, '✦ Create custom tag').click();
      const submit = button(panel, 'Create custom tag');
      const form = innermost(page, 'div', submit, page.getByText('Preview:'));
      return { target: panel, buttons: [submit, button(form, 'Cancel')] };
    },
  },
  {
    group: 'outlier',
    title: 'Date range (alerts filter)',
    component: 'DateRangePanel in src/components/filters/FilterDateTime.tsx, hosted by src/pages/Reports/components/ReportsFilters.tsx',
    where: '/alerts → Filter → Date range',
    layout: 'Cancel then "Apply", both grouped on the RIGHT',
    enter: 'No (not a form)',
    open: async (page, { go }) => {
      await go('/alerts');
      await button(page, 'Filter').click();
      const item = page.getByRole('menuitem', { name: /Date range/ });
      await ((await item.count()) ? item.first() : page.getByText('Date range', { exact: true }).first()).click();
      const apply = button(page, 'Apply');
      const target = innermost(page, 'div', apply, page.getByRole('button', { name: 'Cancel', exact: true }));
      return { target, buttons: [button(target, 'Cancel'), apply] };
    },
  },
  {
    group: 'outlier',
    title: 'Date range (incident start filter)',
    component: 'src/components/filters/FilterDateTime.tsx, hosted by src/pages/incidents/IncidentsFilters.tsx',
    where: '/incidents → Incident start',
    layout: 'Cancel then "Apply", both grouped on the RIGHT',
    enter: 'No (not a form)',
    open: async (page, { go }) => {
      await go('/incidents');
      await page.getByRole('button', { name: /Incident start/ }).first().click();
      const apply = button(page, 'Apply');
      const target = innermost(page, 'div', apply, page.getByRole('button', { name: 'Cancel', exact: true }));
      return { target, buttons: [button(target, 'Cancel'), apply] };
    },
  },
  {
    group: 'outlier',
    title: 'Edit team details',
    component: 'src/pages/Settings/team/TeamDetails.tsx',
    where: '/settings/team/:id → Edit details',
    layout: 'Cancel then "Save", both grouped on the LEFT',
    enter: 'Yes',
    open: async (page, { go, data }) => {
      if (!data.teamId) skip('No teams.');
      await go(`/settings/team/${data.teamId}`);
      await button(page, 'Edit details').click();
      const save = button(page, 'Save');
      const target = innermost(page, 'form', save);
      return { target, buttons: [button(target, 'Cancel'), save] };
    },
  },
  {
    group: 'outlier',
    title: 'Edit comment',
    component: 'src/pages/incidents/Incident/Comment.tsx',
    where: '/incidents/:id → pencil next to a comment',
    layout: 'Cancel then "Update", both grouped on the LEFT',
    enter: 'No (textarea)',
    open: async (page, { go, data }) => {
      // Comments only show up on the incident page, so look through a few.
      for (const id of data.incidentIds.slice(0, 10)) {
        await go(`/incidents/${id}`);
        const edit = page.locator('article button:has(svg[data-icon="pen-to-square"])');
        if (!(await edit.count())) continue;
        await edit.first().click();
        const update = button(page, 'Update');
        const target = innermost(page, 'form', update);
        return { target, buttons: [button(target, 'Cancel'), update] };
      }
      return skip('None of the first 10 incidents has a comment.');
    },
  },
  {
    group: 'outlier',
    title: 'Rename passkey',
    component: 'src/pages/Settings/user/components/WebAuthnDeviceRow.tsx',
    where: 'Your profile → Security → WebAuthn (Passkeys) → Rename',
    layout: '"Save" LEFT, Cancel right of it, then Remove',
    enter: 'No (not a form)',
    open: async (page, { go, data }) => {
      await go(`/settings/user/${data.selfId}`);
      const rename = page.getByRole('button', { name: 'Rename', exact: true });
      if (!(await rename.count())) skip('This account has no enrolled passkeys.');
      await rename.first().click();
      const save = button(page, 'Save');
      const target = save.locator('xpath=../..');
      return { target, buttons: [save, button(target, 'Cancel')] };
    },
  },
  {
    group: 'outlier',
    title: 'Mastodon authorizing step',
    component: 'src/pages/Settings/Credentials/CreateCredentialForm.tsx',
    where: '/settings/connections → Connect Mastodon → Authorize Mastodon',
    layout: '"Open Authorization Window" left, "Start Over" right',
    enter: 'n/a',
    notCaptured: 'Reaching this step starts a real Mastodon OAuth request (a write), so it is not captured.',
  },
  {
    group: 'outlier',
    title: 'Telegram code and password steps',
    component: 'src/pages/Settings/Credentials/CreateCredentialForm.tsx',
    where: '/settings/connections → Connect Telegram → Send Code',
    layout: 'Standard row, plus an extra "Start Over" right-aligned below it',
    enter: 'Yes',
    notCaptured: 'Reaching these steps sends a real Telegram login code (a write), so they are not captured.',
  },

  // Submit only --------------------------------------------------------------
  {
    group: 'submit-only',
    title: 'Login',
    component: 'src/pages/Login.tsx',
    where: '/login (signed out)',
    layout: 'Full-width "Sign in"',
    enter: 'Yes',
    signedOut: true,
    open: async (page, { go }) => {
      await go('/login');
      const submit = button(page, 'Sign in');
      return { target: innermost(page, 'form', submit), buttons: [submit] };
    },
  },
  {
    group: 'submit-only',
    title: 'Create team',
    component: 'src/pages/Settings/team/TeamsIndex.tsx',
    where: '/settings/teams (always-visible panel)',
    layout: 'Full-width "Create Team" at the bottom',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/settings/teams');
      const submit = button(page, 'Create Team');
      return { target: innermost(page, 'form', submit), buttons: [submit] };
    },
  },
  {
    group: 'submit-only',
    title: 'Post comment',
    component: 'src/pages/incidents/Incident/CommentTimeline.tsx',
    where: '/incidents/:id (bottom of the comments)',
    layout: '"Post" bottom left',
    enter: 'No (textarea)',
    open: async (page, { go, data }) => {
      if (!data.incidentId) skip('No incidents in the database.');
      await go(`/incidents/${data.incidentId}`);
      const submit = button(page, 'Post');
      return { target: innermost(page, 'form', submit), buttons: [submit] };
    },
  },
  {
    group: 'submit-only',
    title: 'Display preferences',
    component: 'src/pages/Settings/user/components/DisplayPreferencesSection.tsx',
    where: 'Your profile',
    layout: '"Save Preferences" bottom left',
    enter: 'No (not a form)',
    open: async (page, { go, data }) => {
      await go(`/settings/user/${data.selfId}`);
      const submit = button(page, 'Save Preferences');
      if (!(await submit.count())) skip('No Display preferences section on this profile.');
      return { target: innermost(page, 'section, div', submit, page.getByText('Display preferences')), buttons: [submit] };
    },
  },
  {
    group: 'submit-only',
    title: 'Permission exceptions',
    component: 'src/pages/Settings/user/components/PermissionEditor.tsx',
    where: 'Profile of another, non-admin user',
    layout: '"Save Permissions" bottom left',
    enter: 'No (not a form)',
    open: async (page, { go, data }) => {
      if (!data.nonAdminUserId) skip('No non-admin users.');
      await go(`/settings/user/${data.nonAdminUserId}`);
      const submit = button(page, 'Save Permissions');
      if (!(await submit.count())) skip('No Permissions section on this profile.');
      return { target: submit.locator('xpath=../..'), buttons: [submit] };
    },
  },
  {
    group: 'submit-only',
    title: 'Alerts keyword search',
    component: 'src/pages/Reports/components/ReportsFilters.tsx',
    where: '/alerts toolbar',
    layout: 'Icon submit button next to the input',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/alerts');
      const target = innermost(page, 'form', page.locator('input[name="keywords"]'));
      return { target, buttons: [target.locator('button[type="submit"]').first()] };
    },
  },
  {
    group: 'submit-only',
    title: 'Incidents search',
    component: 'src/pages/incidents/IncidentsFilters.tsx',
    where: '/incidents toolbar',
    layout: 'Icon submit button next to the input, plus "Clear All"',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/incidents');
      const target = innermost(page, 'form', page.locator('input[name="title"]'));
      return { target, buttons: [target.locator('button[type="submit"]').first()] };
    },
  },
  {
    group: 'submit-only',
    title: 'Jump to page',
    component: 'src/components/Pagination.tsx',
    where: '/alerts → "Page N of M"',
    layout: 'Arrow submit button next to the input',
    enter: 'Yes',
    open: async (page, { go }) => {
      await go('/alerts');
      const pager = page.getByRole('button', { name: /^Page \d+ of \d+/ });
      if (!(await pager.count())) skip('No pagination on /alerts.');
      await pager.first().click();
      const target = innermost(page, 'form', page.getByText('Jump to:'));
      return { target, buttons: [target.locator('button[type="submit"]').first()] };
    },
  },
  {
    group: 'submit-only',
    title: 'Advanced contextual search',
    component: 'src/pages/Reports/FlaggedReportsList.tsx',
    where: 'Not routed',
    layout: '"Search!" centered below the input',
    enter: 'Yes',
    notCaptured: 'Nothing imports this component, so it never renders.',
  },

  // Pickers --------------------------------------------------------------------
  {
    group: 'picker',
    title: 'Add activity to incident (dashboard)',
    component: 'src/pages/Dashboard/components/DashboardAddToIncident.tsx',
    where: '/dashboard → Notable Activity card → Add to Incident',
    layout: 'No submit. Cancel at the TOP LEFT',
    enter: 'n/a',
    open: async (page, { go }) => {
      await go('/dashboard');
      await clickFirstEnabled(page.getByRole('button', { name: 'Add to Incident' }), 'No notable activity without a linked incident.');
      const target = dialogPanel(page);
      return { target, buttons: [button(target, 'Cancel')] };
    },
  },
  {
    group: 'picker',
    title: 'Add reports to incident (alerts)',
    component: 'src/pages/Reports/components/AddReportsToIncident.tsx',
    where: '/alerts → Add to Incident on a report row',
    layout: 'No submit. X close at the TOP RIGHT',
    enter: 'n/a',
    open: async (page, { go }) => {
      await go('/alerts');
      const add = page.getByRole('button', { name: 'Add to Incident' });
      if (!(await add.count())) skip('No report rows with Add to Incident (all linked, or table view).');
      // The button stops propagation, so this doesn't open (and mark read) the report.
      await add.first().click({ force: true });
      const target = dialogPanel(page);
      return { target, buttons: [target.getByRole('button', { name: 'Close' }).first()] };
    },
  },
];

// ---------------------------------------------------------------------------
// Running

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const getJson = async (context, urlPath) => {
  const res = await context.request.get(`${APP_URL}${urlPath}`);
  if (!res.ok()) return null;
  return res.json().catch(() => null);
};

const asList = (body) => (Array.isArray(body) ? body : (body && body.results) || []);

// The signed-in user, or null. The jwt cookie is only set once sign-in
// (including MFA) is complete, so a session here is a usable one.
const readSession = async (context) => {
  const session = await getJson(context, '/session');
  return session && session._id ? session : null;
};

// Opens the saved profile, assuming it is signed in. If it isn't, shows a
// browser window on the login page and waits for you to sign in there, then
// reopens the profile headless for the screenshots.
const openSignedIn = async () => {
  let context = await chromium.launchPersistentContext(PROFILE_DIR, CONTEXT_OPTIONS);
  let session = await readSession(context);
  if (session) return { context, session };

  await context.close();
  context = await chromium.launchPersistentContext(PROFILE_DIR, { ...CONTEXT_OPTIONS, headless: false });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(`${APP_URL}/login`);
  console.log('Not signed in. Sign in in the browser window that just opened; the script continues once you have.');
  const deadline = Date.now() + SIGN_IN_TIMEOUT_MS;
  while (!(session = await readSession(context))) {
    if (Date.now() > deadline) {
      await context.close();
      throw new Error('Timed out waiting for you to sign in.');
    }
    await page.waitForTimeout(2000);
  }
  await context.close();
  console.log(`Signed in as ${session.username}.`);
  return { context: await chromium.launchPersistentContext(PROFILE_DIR, CONTEXT_OPTIONS), session };
};

const fetchData = async (context, session) => {
  if (session.role !== 'admin') console.log(`Warning: ${session.username} is ${session.role}, not admin. Some forms will be skipped.`);
  const incidents = asList(await getJson(context, '/api/group'));
  const teams = asList(await getJson(context, '/api/team'));
  const users = asList(await getJson(context, '/api/user'));
  const other = users.find((user) => user._id !== session._id && user.role !== 'admin');
  return {
    username: session.username,
    selfId: session._id,
    incidentIds: incidents.map((incident) => incident._id),
    incidentId: incidents[0] && incidents[0]._id,
    teamId: teams[0] && teams[0]._id,
    nonAdminUserId: other && other._id,
  };
};

// Blocks every non-GET request from the page to the app, so nothing can be
// saved, and dismisses browser confirm() prompts (team delete, passkey remove).
const makeReadOnly = async (page) => {
  page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
  await page.route('**/*', (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const isAppWrite = request.method() !== 'GET'
      && (pathname.startsWith('/api/') || ['/login', '/logout', '/session'].includes(pathname));
    return isAppWrite ? route.abort() : route.continue();
  });
};

const outline = (locator, style) => locator.evaluate((el, css) => {
  el.style.outline = css;
  el.style.outlineOffset = '3px';
}, style).catch(() => {});

const captureShot = async (page, waitForApiIdle, shot, data) => {
  const go = async (urlPath) => {
    await page.goto(`${APP_URL}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await waitForApiIdle();
  };
  const { target, buttons } = await shot.open(page, { go, data });
  await target.waitFor({ timeout: 5000 });
  for (const b of buttons) await b.waitFor({ timeout: 3000 });
  await waitForApiIdle();
  await page.waitForTimeout(300);

  await outline(target, '2px dashed #2563eb');
  for (const b of buttons) await outline(b, '3px solid #e11d48');
  await buttons[buttons.length - 1].scrollIntoViewIfNeeded().catch(() => {});

  const dir = path.join(OUTPUT_DIR, slug(shot.title));
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'page.png') });
  const cropped = await target.screenshot({ path: path.join(dir, 'form.png'), timeout: 5000 })
    .then(() => true, () => false);
  return {
    page: `${slug(shot.title)}/page.png`,
    form: cropped ? `${slug(shot.title)}/form.png` : null,
  };
};

const card = (shot, result) => {
  const meta = `
    <dl>
      <dt>Component</dt><dd><code>${escapeHtml(shot.component)}</code></dd>
      <dt>Where</dt><dd>${escapeHtml(shot.where)}</dd>
      <dt>Buttons</dt><dd>${escapeHtml(shot.layout)}</dd>
      <dt>Enter submits</dt><dd>${escapeHtml(shot.enter)}</dd>
    </dl>`;
  let body;
  if (result.files) {
    const closeUp = result.files.form || result.files.page;
    const fullPage = result.files.form ? `<a href="${result.files.page}" target="_blank">Full page</a> · ` : '';
    body = `
      <a href="${closeUp}" target="_blank"><img src="${closeUp}" alt="${escapeHtml(shot.title)}" loading="lazy"></a>
      <p class="links">${fullPage}<a href="${closeUp}" target="_blank">Open image</a></p>`;
  } else {
    body = `<p class="status ${result.kind}">${escapeHtml(result.message)}</p>`;
  }
  return `<article id="${slug(shot.title)}"><h3>${escapeHtml(shot.title)}</h3>${meta}${body}</article>`;
};

const writeReport = (shots, results, startedAt, username) => {
  const sections = GROUPS.map((group) => {
    const inGroup = shots.filter((shot) => shot.group === group.key);
    if (!inGroup.length) return '';
    return `<section><h2>${escapeHtml(group.title)}</h2><div class="grid">${
      inGroup.map((shot) => card(shot, results.get(shot))).join('')
    }</div></section>`;
  }).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Form Button Layout</title>
<style>
  :root { --bg: #f8fafc; --card: #fff; --text: #0f172a; --muted: #475569; --line: #cbd5e1; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f172a; --card: #1e293b; --text: #e2e8f0; --muted: #94a3b8; --line: #334155; } }
  body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; }
  main { max-width: 1400px; margin: 0 auto; }
  h1 { margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 24px; }
  h2 { margin: 32px 0 12px; font-size: 18px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 16px; }
  article { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px; min-width: 0; }
  h3 { margin: 0 0 8px; font-size: 15px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 10px; margin: 0 0 10px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  code { font-size: 12px; }
  img { display: block; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; }
  .links { margin: 6px 0 0; font-size: 12px; }
  .status { padding: 8px 10px; border-radius: 6px; margin: 0; }
  .status.skipped, .status.not-captured { background: #fef9c3; color: #713f12; }
  .status.error { background: #fee2e2; color: #7f1d1d; }
</style></head>
<body><main>
<h1>Form button layout</h1>
<p class="sub">Captured ${escapeHtml(startedAt.toLocaleString())} from ${escapeHtml(APP_URL)} as ${escapeHtml(username)}.
Blue dashed outline: the form or dialog. Red outline: its Submit/Cancel buttons. Click an image to open it full size.
Source: <code>docs/claude/architecture/form-button-layout.md</code>.</p>
${sections}
</main></body></html>`;
  const file = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(file, html);
  return file;
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
  const only = onlyArg && onlyArg.slice('--only='.length).toLowerCase();
  const shots = only
    ? SHOTS.filter((shot) => `${shot.title} ${shot.component}`.toLowerCase().includes(only))
    : SHOTS;

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const startedAt = new Date();
  const results = new Map();
  const { context: signedIn, session } = await openSignedIn();
  // Only for the signed-out login page, which the saved profile can't show.
  let signedOutBrowser;
  let data;

  try {
    data = await fetchData(signedIn, session);
    console.log(`Capturing ${shots.length} forms...`);

    for (const shot of shots) {
      if (shot.notCaptured) {
        results.set(shot, { kind: 'not-captured', message: `Not captured: ${shot.notCaptured}` });
        console.log(`  - ${shot.title}: not captured`);
        continue;
      }
      // A fresh page per shot, so an open dialog or popover can't leak into the next.
      if (shot.signedOut && !signedOutBrowser) signedOutBrowser = await chromium.launch();
      const context = shot.signedOut ? await signedOutBrowser.newContext(CONTEXT_OPTIONS) : signedIn;
      const page = await context.newPage();
      await makeReadOnly(page);
      const waitForApiIdle = trackApiRequests(page);
      try {
        const files = await captureShot(page, waitForApiIdle, shot, data);
        results.set(shot, { files });
        console.log(`  ✓ ${shot.title}`);
      } catch (err) {
        const message = err.message.split('\n')[0];
        results.set(shot, err instanceof Skip
          ? { kind: 'skipped', message: `Skipped: ${message}` }
          : { kind: 'error', message: `Failed: ${message}` });
        console.log(`  ${err instanceof Skip ? '-' : '✗'} ${shot.title}: ${message}`);
      } finally {
        await page.close();
        if (shot.signedOut) await context.close();
      }
    }
  } finally {
    await signedIn.close();
    if (signedOutBrowser) await signedOutBrowser.close();
  }

  const file = writeReport(shots, results, startedAt, data.username);
  console.log(`\nReport: ${file}`);
  if (!process.argv.includes('--no-open')) openInBrowser(file);
};

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
