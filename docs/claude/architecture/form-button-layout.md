# Form button layout

Where the Submit and Cancel buttons sit on each form and modal in the frontend, and whether pressing Enter submits. Use this before adding a new form or changing an existing one, so new work follows the main convention instead of one of the outliers.

Audited 2026-11-05 from source (button order and class names), and rechecked against `development` at `579aeb36`. To see every entry in the running app, run `node scripts/form-button-screens.js` (instructions at the top of the file). It writes a screenshot gallery that labels each shot with its component.

"Enter submits" means the fields are inside a real `<form>` or Formik `<Form>` with a `type="submit"` button, so Enter in a text input submits the form. Enter never submits from a textarea, and it does nothing while the submit button is disabled.

## The convention

**Cancel on the left, Submit on the right, pushed to opposite edges** (`flex justify-between`). Cancel is `variant='secondary'` with `type='button'`; Submit is `variant='primary'` with `type='submit'`.

The easiest way to get this is `src/components/FormikWithSchema.tsx`. It renders the button row for you, takes `onSubmitText` (defaults to "Confirm") and `onClose` for Cancel, and keeps Submit disabled until the form is valid and has changed (`allowPristineSubmit` lifts the "has changed" rule for create forms whose initial values are already valid). With a `permission` prop, it also greys out the fields and blocks submitting, Enter included, when the user lacks that permission.

Every table below uses the same columns: the component, where it shows up, its button copy, where Submit (or its equivalent) sits, where Cancel (or its equivalent) sits, and whether Enter submits. Bold marks the part that breaks the convention.

## Modal building blocks

| Component | Where | Button copy | Submit (or equivalent) | Cancel (or equivalent) | Enter submits? |
|---|---|---|---|---|---|
| `src/components/AggieDialog.tsx` | Modal wrapper | None; the form inside supplies them | n/a | Esc closes | Depends on the form inside |
| `src/components/ConfirmationDialog.tsx` | Modal | "Confirm" (or `confirmText`), "Cancel" | Right half of a full-width pair | Left half of the pair; Esc also closes | No (not a form) |

## Forms that follow the convention

| Component | Where | Button copy | Submit (or equivalent) | Cancel (or equivalent) | Enter submits? |
|---|---|---|---|---|---|
| `src/pages/incidents/CreateEditIncidentForm.tsx` (FormikWithSchema) | New Incident page; edit modals in `src/pages/incidents/Incident/index.tsx`, `src/pages/incidents/IncidentListItem.tsx` and `src/pages/incidents/TableView/IncidentsTable.tsx`; Dashboard "Create Incident" modal (`src/pages/Dashboard/index.tsx`) | "Create Incident" / "Update Incident", "Cancel" | Right edge | Left edge | Yes |
| `src/pages/Settings/source/CreateEditSourceForm.tsx` (FormikWithSchema, one form per provider) | Modals from `SourcesSection.tsx`, `src/pages/Settings/Connections/ApiTypeSection.tsx` and `SourceDetailsView.tsx` | "Confirm", "Cancel" | Right edge | Left edge | Yes |
| `src/pages/Settings/Credentials/CreateCredentialForm.tsx` (FormikWithSchema) | Modal | "Send Code" / "Verify Code" / "Verify Password" / "Authorize Mastodon" (varies by step), "Cancel" | Right edge | Left edge | Yes |
| `RenameConnectionForm` in `src/pages/Settings/Connections/ApiTypeSection.tsx` (FormikWithSchema) | Modal | "Save", "Cancel"; a separate "Delete connection" button sits below the row on the left | Right edge | Left edge | Yes |
| `src/pages/Settings/user/CreateEditUserForm.tsx` | Modal | "Confirm", "Cancel" | Right edge | Left edge | Yes |
| `src/pages/Settings/user/SetPassword.tsx` | Modal | "Confirm", "Cancel" | Right edge | Left edge | Yes |
| `src/pages/Settings/tag/CreateEditTagForm.tsx` | Modal | "Create tag" / "Save changes", "Cancel" | Right edge | Left edge | Yes |

## Outliers

| Component | Where | Button copy | Submit (or equivalent) | Cancel (or equivalent) | Enter submits? |
|---|---|---|---|---|---|
| `src/components/Tags/SpecialTagForm.tsx` (custom tag) | Inline on the Tags page and inside `IncidentTagsDialog` | "Create custom tag", "Cancel" | **Left**; both grouped on the left | Right of Submit | **No** (not a form) |
| `src/pages/Settings/user/components/WebAuthnDeviceRow.tsx` (rename device) | Inline row | "Save", "Cancel", then "Remove" | **Left** | Right of Save, then "Remove" | **No** (not a form) |
| `src/pages/incidents/Incident/IncidentTagsDialog.tsx` | Modal | "Save tags", "Cancel" | Right, **grouped with Cancel**; selected count on the left | Just left of Save | **No** (not a form) |
| `src/components/filters/FilterDateTime.tsx` (date range) | Popover | "Apply", "Cancel" | Right, **grouped with Cancel** | Just left of Apply | No (not a form) |
| `src/pages/Settings/team/TeamDetails.tsx` (edit team details) | Inline | "Save", "Cancel" | Right of Cancel, **both grouped on the left** | Left | Yes |
| `src/pages/incidents/Incident/Comment.tsx` (edit comment) | Inline | "Update", "Cancel" | Right of Cancel, **both grouped on the left** | Left | No (textarea) |
| Mastodon "authorizing" step in `CreateCredentialForm.tsx` | Modal | "Open Authorization Window", "Start Over" | **Left** | "Start Over" on the right | n/a |
| Telegram code and password steps in `CreateCredentialForm.tsx` | Modal | "Verify Code" / "Verify Password", "Cancel", plus "Start Over" | Right edge (standard row) | Left edge (standard row), **plus an extra "Start Over" right-aligned below it** | Yes |

## Submit with no Cancel

| Component | Where | Button copy | Submit (or equivalent) | Cancel (or equivalent) | Enter submits? |
|---|---|---|---|---|---|
| `src/pages/Login.tsx` | Page | "Sign in" | Full width | None | Yes |
| `src/pages/Settings/team/TeamsIndex.tsx` (Create team panel) | Inline panel | "Create Team" | Full width at the bottom | None | Yes |
| `src/pages/incidents/Incident/CommentTimeline.tsx` | Inline | "Post" | Bottom left | None | No (textarea) |
| `src/pages/Settings/user/components/DisplayPreferencesSection.tsx` | Inline | "Save Preferences" | Bottom left | None | No (not a form) |
| `src/pages/Settings/user/components/PermissionEditor.tsx` | Inline | "Save Permissions" | Bottom left | None | No (not a form) |
| Keyword search in `src/pages/Reports/components/ReportsFilters.tsx` | Filter bar | Search icon (no text) | Icon button next to the input | None | Yes |
| Search in `src/pages/incidents/IncidentsFilters.tsx` | Filter bar | Search icon (no text), plus "Clear All" | Icon button next to the input | None ("Clear All" resets the filters) | Yes |
| Jump to page in `src/components/Pagination.tsx` | Pagination | Icon button (no text) | Icon button next to the input | None | Yes |

## Not rendered

These have forms but nothing imports them, so they never show up in the app.

| Component | Where | Button copy | Submit (or equivalent) | Cancel (or equivalent) | Enter submits? |
|---|---|---|---|---|---|
| `src/components/GeneratedTagsList.tsx` (AI tag feedback) | Dialog | "Submit", "Cancel" | Right edge | Left edge | n/a (rating scales only, no text inputs) |
| `src/pages/Reports/FlaggedReportsList.tsx` ("Advanced Contextual Search") | Inline | "Search!" | Centered below the input | None | Yes |

## Picker modals

These have no submit button; the user picks an incident by clicking it. The two modals look the same but put their exit in opposite corners.

| Component | Where | Button copy | Submit (or equivalent) | Cancel (or equivalent) | Enter submits? |
|---|---|---|---|---|---|
| `src/pages/Dashboard/components/DashboardAddToIncident.tsx` | Modal | "Cancel" | n/a (click an incident) | **Top left** | n/a |
| `src/pages/Reports/components/AddReportsToIncident.tsx` | Modal | X icon (labelled "Close") | n/a (click an incident) | **Top right** | n/a |

## Summary of differences from the convention

- Submit on the left: `SpecialTagForm`, `WebAuthnDeviceRow`.
- Cancel then Submit grouped on the right: `IncidentTagsDialog`, `FilterDateTime`.
- Cancel then Submit grouped on the left: `TeamDetails` edit, `Comment` edit.
- Text inputs where Enter doesn't submit: `SpecialTagForm`, `WebAuthnDeviceRow` rename, `IncidentTagsDialog`.
- Picker modals put Cancel and Close in opposite corners.
