# Plan: Consolidate the Formik select components

## Context

Aggie's `src/components/` has three near-duplicate Formik-bound select components that share almost all of their markup, styling, label/error scaffolding, and headless-ui wiring:

- [FormikDropdown.tsx](../../../src/components/FormikDropdown.tsx) — single-select, headless-ui `Listbox`, **no search** (prefix-jump type-ahead only). The widely used one.
- [FormikCombobox.tsx](../../../src/components/FormikCombobox.tsx) — single-select, headless-ui `Combobox`, **real type-to-filter search**. Added specifically for the ~250-entry country picker (see its own header comment at lines 22-25). Used in only one file.
- [FormikMultiCombobox.tsx](../../../src/components/FormikMultiCombobox.tsx) — **multi-select** with search, rendered as a `Popover` + removable pills. Different list shape (`{ key, value }` vs `{ _id, label }`), stores an array. Carries a `// yeah.... i gotta refactor this one` note.

`FormikCombobox` exists only because no single component offered **single-select + real search** at the time. The result is three overlapping components. This refactor consolidates the two single-select variants into one searchable-capable component, removing the duplication and giving every single-select dropdown optional search for free, and evaluates folding in the multi-select variant as a lower-priority follow-up.

Why it matters: less duplicated markup/styling to keep in sync (dark-mode classes, the headless-ui label-wrapping onBlur bug noted at [FormikDropdown.tsx:25](../../../src/components/FormikDropdown.tsx#L25), error display, disabled handling), and a single place to improve a11y/behavior.

## Constraints

- Stack is locked: React 17, TypeScript 4.5, Tailwind 3, **headless-ui `^1.7.19`** (CRA / `react-scripts` 5). Use 1.7-era headless-ui idioms only; `Combobox` in 1.7 does support a `multiple` prop, but do not assume newer API shapes.
- Do not introduce horizontal overflow; keep existing dark-mode class pairs intact.
- Per CLAUDE.md, when refactoring legacy code keep the old file alongside (`*_old`) until a later cleanup rather than hard-deleting — apply judgement: a clean component swap with full call-site migration can delete, but preserve if any call site can't be fully migrated in this pass.

## Phase 1 — Investigation (confirm before editing)

Audit every call site and lock down behavioral parity requirements. Known call sites:

| Component | Call sites |
|---|---|
| `FormikDropdown` | [source/CreateEditSourceForm.tsx](../../../src/pages/Settings/source/CreateEditSourceForm.tsx) (multiple: source type, OONI test, others), [user/CreateEditUserForm.tsx](../../../src/pages/Settings/user/CreateEditUserForm.tsx) (Role), [tag/CreateEditTagForm.tsx](../../../src/pages/Settings/tag/CreateEditTagForm.tsx) (Category), [incidents/CreateEditIncidentForm.tsx](../../../src/pages/incidents/CreateEditIncidentForm.tsx) (Access Mode, verification/confirmation status) |
| `FormikCombobox` | [source/CreateEditSourceForm.tsx](../../../src/pages/Settings/source/CreateEditSourceForm.tsx) — 3× Country (`keywords`), lines ~756/813/873 |
| `FormikMultiCombobox` | [incidents/CreateEditIncidentForm.tsx](../../../src/pages/incidents/CreateEditIncidentForm.tsx) — 2× (e.g. `assignedTo`) |

Checklist to verify during investigation:
- [ ] All `FormikDropdown`/`FormikCombobox` call sites pass the `{ _id, label }` list shape and a scalar field value (country `keywords` confirmed `Yup.string`). Flag any that don't.
- [ ] Note prop differences to preserve: `label`, `name`, `list`, `disabled`, `placeholder`, `icon`. Keep the default-text behavior (`"Select " + label` for Listbox vs `"Search " + label` placeholder for Combobox).
- [ ] Preserve the onBlur behavior and the "don't wrap headless-ui in `<label>`" constraint ([FormikDropdown.tsx:25](../../../src/components/FormikDropdown.tsx#L25)).
- [ ] Confirm `value` coercion: `FormikDropdown` compares `String(value) === i._id` at [line 44](../../../src/components/FormikDropdown.tsx#L44); `FormikCombobox` compares `i._id === v`. Pick one consistent comparison in the merged component so numeric-valued lists (if any) still match.

## Phase 2 — Refactor (recommended approach)

**Merge the two single-select components into one `FormikSelect`** with an optional `searchable` prop.

1. Create `src/components/FormikSelect.tsx`:
   - Props: `{ label, name, list: { _id: string; label: string }[], disabled?, placeholder?, icon?, searchable?: boolean }`.
   - `searchable === true` → render the `Combobox` body from `FormikCombobox` (input + filter state + "No matches").
   - `searchable` falsy (default) → render the `Listbox` body from `FormikDropdown` (button + options).
   - Share one outer wrapper: the `<label>` row, disabled/opacity wrapper, options list container classes, and the touched/error block — all three currently duplicate these verbatim.
   - Use one consistent value comparison (prefer `String(value) === i._id` to keep Listbox's numeric safety).
2. Migrate call sites:
   - Replace `FormikCombobox` (3× Country in the source form) with `<FormikSelect ... searchable />`.
   - Replace `FormikDropdown` imports/usages with `FormikSelect` (no `searchable`) across the 4 page files.
3. Remove the old single-select files: delete [FormikCombobox.tsx](../../../src/components/FormikCombobox.tsx) and [FormikDropdown.tsx](../../../src/components/FormikDropdown.tsx) once all call sites compile against `FormikSelect`. (Component swap with full migration — safe to delete rather than `*_old`, since git history preserves them. If any call site resists migration, keep that old file as `*_old` and note it.)

**Secondary / optional (flag, don't force): `FormikMultiCombobox`.**
- It is multi-select with a distinct pill/Popover UX and a different list shape (`{ key, value }`). Folding it into `FormikSelect` via a `multiple` prop (headless-ui 1.7 `Combobox multiple`) is possible but **changes UX** (pills → checkable list) and requires normalizing the `{ key, value }` shape to `{ _id, label }` at its 2 incident-form call sites.
- Recommendation: leave `FormikMultiCombobox` as-is in this pass, or do a minimal cleanup (normalize list shape + extract shared scaffolding) only if time allows. Do not change its rendered UX without product sign-off. Capture as a follow-up issue.

## Files to modify

- New: `src/components/FormikSelect.tsx`
- Delete (after migration): `src/components/FormikCombobox.tsx`, `src/components/FormikDropdown.tsx`
- Migrate call sites: `src/pages/Settings/source/CreateEditSourceForm.tsx`, `src/pages/Settings/user/CreateEditUserForm.tsx`, `src/pages/Settings/tag/CreateEditTagForm.tsx`, `src/pages/incidents/CreateEditIncidentForm.tsx`
- Unchanged this pass: `src/components/FormikMultiCombobox.tsx` (follow-up)

## Verification

1. `npm run build` — must compile clean (TS 4.5, `CI=false`).
2. `npm run dev`, then at `https://localhost:8000` exercise each migrated form:
   - Source form (IODA / Cloudflare / OONI): Country picker filters by typing, selects, persists, and shows the required-field error when empty (`keywords` is `Yup.string().required`).
   - Source form other dropdowns (source type, OONI test), User Role, Tag Category, Incident Access Mode / verification / confirmation: open, select, submit; confirm selected label renders and value saves.
   - Dark mode: confirm the shared classes render correctly in both themes.
   - Confirm no horizontal overflow on any form.
3. Confirm `FormikMultiCombobox` (incident Assign User) still works unchanged.

## Out of scope

- Changing `FormikMultiCombobox`'s UX.
- Any backend / model changes (pure frontend component consolidation).
