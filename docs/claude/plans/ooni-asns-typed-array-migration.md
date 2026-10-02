# Make ASN storage consistent: migrate OONI onto the typed `asns` array

> Follow-up within the (now shipped) "make sources configurable" feature.
> As-built docs: [../architecture/sources-and-feeds.md](../architecture/sources-and-feeds.md) ("Outage feeds" section)
> (see the "ASN storage is still split" caveat — OONI still stores ASNs in the legacy
> `lists` string, which this plan unifies).

## Context / findings

ASN entry now looks identical in the UI (both IODA and OONI use the
`AsnChipInput` chip control), but the two still store ASNs differently:

- **IODA** → typed `asns: [Number]` on the Source schema
  ([source.js](backend/models/source.js)); `sourceToChannel` passes `source.asns`.
- **OONI** → the legacy overloaded `lists` **comma string**; `sourceToChannel`
  passes `asns: lists` ([sourceToChannel.js](backend/fetching/sourceToChannel.js) ooni case).

ASNs are the only field with this split (country is `keywords` for IODA /
Cloudflare / OONI alike; Cloudflare has no ASN input; Twitter/RSS are disabled).
The goal is one storage format everywhere: OONI adopts the same typed `asns`
array, so `keywords` = country and `asns` = ASN list across every source type.

Enabling facts found:
- The `asns` schema field already exists (added earlier) — no schema change.
- The OONI channel is already array-safe: its constructor does
  `String(options.asns || '').split(/[\s,]+/)`
  ([ooni.js:71](backend/fetching/channels/ooni.js#L71)), so an array `[44244,58224]`
  stringifies and splits correctly. No channel change needed.
- `normalizeStructuredConfig` in the controller already coerces `asns` to positive
  integers ([sourceController.js](backend/api/controllers/sourceController.js)) — it will now apply to OONI too.
- Script convention to mirror: standalone `backend/scripts/*.js`, `require('dotenv').config()`,
  `require('../database')` (connects on require), idempotent, `--dry-run`, a Usage line
  (e.g. [backfill-ooni-outage-fields.js](backend/scripts/backfill-ooni-outage-fields.js)).

Chosen approach: **one-time migration script + safety fallback** so existing OONI
configs are preserved no matter the deploy/run ordering.

## Approach

### 1. Frontend — OONI form uses `asns` ([CreateEditSourceForm.tsx](src/pages/Settings/source/CreateEditSourceForm.tsx))

- Swap the OONI ASN field to the array format:
  `<AsnChipInput name="asns" format="array" label="Network ASNs" … />` (IODA already uses this).
- Seed `initialValues.asns` from the typed field, **falling back to the legacy
  string** so un-migrated sources still show their ASNs:
  `asns: (source?.asns?.length ? source.asns.map(String) : parseAsns(source?.lists))`,
  and set `lists: ""` so saving clears the legacy field (completes migration on edit).
- Update `ooniSchema`: validate `asns` (a non-empty list of positive ints) instead
  of the `lists` string test; keep the "at least one ASN" requirement.
- Add a tiny `parseAsns(str)` helper (split `/[\s,]+/`, keep positive ints) — reuse
  the same parse rule already in `AsnChipInput`.

`AsnChipInput`'s `format="string"` branch becomes unused after this; keep the prop
(harmless, keeps the component general) — both call sites now pass `"array"`.

### 2. Backend safety fallback ([sourceToChannel.js](backend/fetching/sourceToChannel.js))

- OONI case: `asns: (source.asns && source.asns.length) ? source.asns : lists`.
  Prefer the typed array; fall back to the legacy string for any source not yet
  migrated. The channel handles either. No other backend change.

### 3. One-time migration script `backend/scripts/backfill-ooni-asns.js`

- Mirror the existing backfill scripts (dotenv, `../database`, `--dry-run`, idempotent).
- Select OONI sources where `asns` is missing/empty AND `lists` is non-empty.
- Parse `lists` → positive-int array; `updateOne($set: { asns }, $unset/$set: { lists: '' })`
  (plain `updateOne` to avoid firing the `source:save` rebuild hook during a bulk backfill;
  numeric array built in JS so casting is unambiguous).
- Print converted / skipped counts; `--dry-run` reports without writing.
- Usage line: `node backend/scripts/backfill-ooni-asns.js [--dry-run]`.

### 4. Read-only display ([sourceDisplay.tsx](src/pages/Settings/source/sourceDisplay.tsx))

- OONI "Network ASNs" row: read `source.asns` (render as `AS<n>, …`), falling back
  to `source.lists` when `asns` is empty (pre-migration).

## Critical files

- [src/pages/Settings/source/CreateEditSourceForm.tsx](src/pages/Settings/source/CreateEditSourceForm.tsx) — OONI form field + schema + initialValues.
- [backend/fetching/sourceToChannel.js](backend/fetching/sourceToChannel.js) — OONI `asns` fallback.
- `backend/scripts/backfill-ooni-asns.js` — new one-time migration.
- [src/pages/Settings/source/sourceDisplay.tsx](src/pages/Settings/source/sourceDisplay.tsx) — OONI display reads `asns` w/ fallback.

## Reuse

- `AsnChipInput` ([src/pages/Settings/source/AsnChipInput.tsx](src/pages/Settings/source/AsnChipInput.tsx)) — already supports the array format.
- Existing backfill script skeleton ([backfill-ooni-outage-fields.js](backend/scripts/backfill-ooni-outage-fields.js)).
- `normalizeStructuredConfig` — already validates/coerces `asns`.

## Verification

1. `npx tsc --noEmit` passes.
2. Migration dry run: `node backend/scripts/backfill-ooni-asns.js --dry-run` — lists
   the OONI sources it would convert and the parsed ASNs, writes nothing. Re-run
   without `--dry-run`; a second run reports 0 remaining (idempotent).
3. `npm run dev` → Settings → Feeds → edit a **migrated** OONI feed: ASNs show as
   chips from `asns`; add/remove; save; confirm `asns` persists as a number array
   and `lists` is empty; fetching log shows a channel rebuild.
4. **Fallback check:** temporarily point at an OONI source still holding ASNs only
   in `lists` (e.g. one created before the script) — it still fetches (via the
   sourceToChannel fallback) and its chips render (via the form/display fallback).
5. Confirm IODA is unchanged and both source types now store ASNs as `asns` arrays.
