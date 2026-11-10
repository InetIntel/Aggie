# Form button layout

Where the Submit and Cancel buttons sit on each form and modal in the frontend, and whether pressing Enter submits. Use this before adding a new form or changing an existing one, so new work follows the main convention instead of one of the outliers.

Audited 2026-11-05 from source (button order and class names), and rechecked against `development` at `579aeb36`. To see every entry in the running app, run `node scripts/form-button-screens.js` (instructions at the top of the file). It writes a screenshot gallery that labels each shot with its component.

"Enter submits" means the fields are inside a real `<form>` or Formik `<Form>` with a `type="submit"` button, so Enter in a text input submits the form. Enter never submits from a textarea, and it does nothing while the submit button is disabled.

## The convention

**Cancel on the left, Submit on the right, pushed to opposite edges** (`flex justify-between`). Cancel is `variant='secondary'` with `type='button'`; Submit is `variant='primary'` with `type='submit'`.

The easiest way to get this is `src/components/FormikWithSchema.tsx`. It renders the button row for you, takes `onSubmitText` (defaults to "Confirm") and `onClose` for Cancel, and keeps Submit disabled until the form is valid and has changed (`allowPristineSubmit` lifts the "has changed" rule for create forms whose initial values are already valid). With a `permission` prop, it also greys out the fields and blocks submitting, Enter included, when the user lacks that permission.

Modals are built from:

| Component | Buttons | Enter submits? |
|---|---|---|
| `src/components/AggieDialog.tsx` | None; the form inside supplies them. Esc closes. | Depends on the form inside |
| `src/components/ConfirmationDialog.tsx` | Two full-width buttons: Cancel left, Confirm right. Esc closes. | No (not a form) |

## Forms that follow the convention

All of these submit on Enter.

- Incident create/edit: `src/pages/incidents/CreateEditIncidentForm.tsx` (FormikWithSchema). Used on the New Incident page, in the edit modals in `src/pages/incidents/Incident/index.tsx`, `src/pages/incidents/IncidentListItem.tsx`, `src/pages/incidents/TableView/IncidentsTable.tsx`, and in the Dashboard "Create Incident" modal (`src/pages/Dashboard/index.tsx`).
- Feed create/edit: `src/pages/Settings/source/CreateEditSourceForm.tsx` (FormikWithSchema, one form per provider). Used in modals from `SourcesSection.tsx`, `src/pages/Settings/Connections/ApiTypeSection.tsx`, and `SourceDetailsView.tsx`.
- Connection create: `src/pages/Settings/Credentials/CreateCredentialForm.tsx` (FormikWithSchema). Submit text varies by step: "Send Code", "Verify Code", "Verify Password", "Authorize Mastodon".
- Rename connection: `RenameConnectionForm` in `src/pages/Settings/Connections/ApiTypeSection.tsx` (FormikWithSchema, "Save"). A separate "Delete connection" button sits below the row on the left.
- User create/edit: `src/pages/Settings/user/CreateEditUserForm.tsx` ("Confirm").
- Set password: `src/pages/Settings/user/SetPassword.tsx` ("Confirm").
- Tag create/edit: `src/pages/Settings/tag/CreateEditTagForm.tsx` ("Create tag" / "Save changes").

## Outliers

| Form | Where | Submit | Cancel | Enter submits? |
|---|---|---|---|---|
| `src/components/Tags/SpecialTagForm.tsx` (custom tag; inline on the Tags page and inside `IncidentTagsDialog`) | Inline | **Left** ("Create custom tag") | Right; both grouped on the left | **No** (not a form) |
| `src/pages/Settings/user/components/WebAuthnDeviceRow.tsx` (rename device) | Inline row | **Left** ("Save") | Right, then "Remove" | **No** (not a form) |
| `src/pages/incidents/Incident/IncidentTagsDialog.tsx` | Modal | Right ("Save tags") | Just left of Save; both grouped on the right, selected count on the left | **No** (not a form) |
| `src/components/filters/FilterDateTime.tsx` (date range) | Popover | Right ("Apply") | Just left of Apply; both grouped on the right | No (not a form) |
| `src/pages/Settings/team/TeamDetails.tsx` (edit team details) | Inline | Right of Cancel; both grouped on the left ("Save") | Left | Yes |
| `src/pages/incidents/Incident/Comment.tsx` (edit comment) | Inline | Right of Cancel; both grouped on the left ("Update") | Left | Textarea, so no |
| Mastodon "authorizing" step in `CreateCredentialForm.tsx` | Modal | "Open Authorization Window" on the left | "Start Over" on the right | n/a |
| Telegram code and password steps in `CreateCredentialForm.tsx` | Modal | Standard row | Standard row, plus an extra "Start Over" right-aligned below it | Yes |

## Submit with no Cancel

- `src/pages/Login.tsx`: full-width "Sign in". Enter submits.
- `src/pages/Settings/team/TeamsIndex.tsx` "Create team" panel: full-width primary button at the bottom. Enter submits.
- `src/pages/incidents/Incident/CommentTimeline.tsx` "Post": bottom left. Textarea, so no Enter.
- `src/pages/Settings/user/components/DisplayPreferencesSection.tsx` "Save Preferences" and `src/pages/Settings/user/components/PermissionEditor.tsx` "Save Permissions": bottom left, not forms, no Enter.
- Search and filter boxes, which submit on Enter with an icon button next to the input:
  - keyword search in `src/pages/Reports/components/ReportsFilters.tsx`
  - search in `src/pages/incidents/IncidentsFilters.tsx` (plus "Clear All")
  - jump to page in `src/components/Pagination.tsx`

## Not rendered

These have forms but nothing imports them, so they never show up in the app:

- `src/components/GeneratedTagsList.tsx`: AI tag feedback dialog, Cancel left and "Submit" right.
- `src/pages/Reports/FlaggedReportsList.tsx`: "Advanced Contextual Search" form, "Search!" centered below the input. Enter submits.

## Picker modals

These have no submit button; the user picks an incident by clicking it.

- `src/pages/Dashboard/components/DashboardAddToIncident.tsx`: **Cancel at the top left**.
- `src/pages/Reports/components/AddReportsToIncident.tsx`: **X close button at the top right**.

The two modals look the same but put their exit in opposite corners.

## Summary of differences from the convention

- Submit on the left: `SpecialTagForm`, `WebAuthnDeviceRow`.
- Cancel then Submit grouped on the right: `IncidentTagsDialog`, `FilterDateTime`.
- Cancel then Submit grouped on the left: `TeamDetails` edit, `Comment` edit.
- Text inputs where Enter doesn't submit: `SpecialTagForm`, `WebAuthnDeviceRow` rename, `IncidentTagsDialog`.
- Picker modals put Cancel and Close in opposite corners.
