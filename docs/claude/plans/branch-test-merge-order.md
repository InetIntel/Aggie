# Branch Test & Merge Order → Development → Staging → Production

## Context

Four feature branches were developed in parallel while the Aggie **development** and **production** environments were being stood up. They now need to be tested and merged toward production.

**Promotion path:** integrate and test everything on **`development`** first. `development` and `staging` are kept **1:1** (currently both at `8652d9d0`, 0/0 ahead/behind). Once everything works on `development`, merge `development → staging`, re-test in the staging environment, then promote staging → production (production is built from `staging`).

**Decisions:**
- **Integration style:** Sequential PRs to `development` — each branch is tested, refreshed off the latest `development`, PR'd, and merged one at a time. Matches the repo's PR-per-feature history; each ships independently. `development` ≡ `staging` (1:1), so a clean merge onto one is a clean merge onto the other.
- **Data migration:** Coordinated. `media-migration` (disk→Mongo) and the backfill scripts must run against the prod DB as part of the rollout: deploy code → run backfill → verify.
- **Fold `feat/backfill-scripts` into `media-migration`:** Merge `feat/backfill-scripts` into `media-migration` and keep **all 5** scripts. They ship as one unit, which collapses the plan to **3 PRs**. Rationale: `backfill-ioda-charts.js` has a hard runtime dependency on media-migration (`fetchSignals` in `iodaUtils`, absent on staging; writes `metadata.rawAPIResponse.chart` which only the new frontend reads), so the script belongs with the code it needs. The other 4 scripts are independent Report/Group backfills and ride along harmlessly (inert until run).
- **Canonical IODA backfill = `scripts/backfill/backfill-ioda-charts.js`** (re-fetches signal series from the IODA API — higher fidelity). **Keep `scripts/backfill-ioda-svg-to-json.js`** (media-migration's SVG→JSON converter) in the tree **but do not use it** — it's an offline fallback only.

## Key findings from branch analysis

**No hard textual merge conflicts exist** — every branch auto-merges onto `development` (≡ `staging`), and every branch pair auto-merges cleanly (`git merge-tree` = 0 conflict hunks). The risk is **semantic overlap**, not textual conflicts. Two hot spots:

1. **IODA chart rendering** — `media-migration` *replaces* the SVG-scrape approach with a recharts/JSON component (`IodaChart.tsx`, `useReportChartSeries.ts`, rewrites `IodaEvent.tsx`/`reportParser.ts`). `feat/incident-alert-filtering` *adds* click-to-expand outage charts + ASN detail onto the **same** `IodaEvent.tsx`/`TrafficEvent.tsx`. Auto-merges textually but both rework the same components → must be validated together, with the additive feature reconciled onto the new foundation.
2. **`backend/fetching/utils/socialImageStorage.js`** — touched by all three of media-migration (heavily: disk→Mongo), api-redesign (minor), and incident-filtering (moves fetched media out of `public/`).

**Branch inventory:**

| Branch | Size | Behind development/staging | App-behavior risk | Overlap watch-items |
|---|---|---|---|---|
| `feat/backfill-scripts` | 1 commit, only new `scripts/backfill/*.js` + `.gitignore` | 2 | ~none (no running-app change) | none real (only `.gitignore`) |
| `feat/api-redesign` | large (Settings/Connections redesign, source/credentials backend, mastodon) | **0 (current)** | medium | `socialImageStorage.js` (small), `src/api/common.ts`, `models/source.js`, `package.json` |
| `media-migration` | large (media→Mongo + IODA recharts rewrite) | 2 | **high** (data model + storage + IODA render) | `socialImageStorage.js`, IODA frontend, `package.json` (recharts) |
| `feat/incident-alert-filtering` | largest (filters, dates, compare, display prefs) | **21 (stale)** | **high** | IODA frontend, `src/api/common.ts`, `socialImageStorage.js` |

## Recommended order

Three PRs. `feat/backfill-scripts` is folded into `media-migration` (see Decisions). Land the current/self-contained branch first, then the media+IODA foundation, then the additive filtering layer.

### 0. Fold `feat/backfill-scripts` → `media-migration` (prep, not a PR)
- `git checkout media-migration && git merge feat/backfill-scripts` — clean 3-way merge (different dirs; only `.gitignore` overlaps and auto-merges). This brings the 5 `scripts/backfill/*.js` files onto media-migration.
- Mark `scripts/backfill-ioda-svg-to-json.js` as the unused fallback (a header comment) and treat `scripts/backfill/backfill-ioda-charts.js` as the canonical IODA signal backfill.
- From here, "media-migration" in the steps below means the combined branch.

### 1. `feat/api-redesign` — land first (currently on development tip)
- **Why first:** Already at the current `development`/`staging` tip (0 behind) — land it while it's fresh instead of letting it go stale. Self-contained to Settings/Connections + `sourceController`/`credentialsController`/`source.js` + mastodon channel; its only app overlaps with the IODA/media work are a tiny `socialImageStorage.js` edit and `src/api/common.ts`.
- **Test:** Settings → "Providers and Feeds" (renamed nav), the consolidated Connections page (one connection per provider), create/edit/toggle sources & credentials, warnings dialog/toasts, and a live mastodon fetch. Confirm `.env.example` additions are reflected in the dev `.env`.
- **Watch:** `models/source.js` + `sourceController.js` change the source data shape (one-connection-per-provider) — check whether existing source docs need a migration/normalization, and that existing sources still load and fetch.
- **Refresh:** merge `development` in. PR → merge to `development`.

### 2. `media-migration` (+ folded backfill scripts) — land second (the foundation + data migration)
- **Why second:** It is the foundation the last branch builds on: it rewrites IODA rendering (SVG→recharts JSON) and moves media storage disk→Mongo (`mediaAsset.js` model, `report.js`, `socialImageStorage.js`, `reportController.js`, `backfillMediaToMongo.js`). Landing it before incident-filtering means the new recharts IODA component is the base onto which the click-to-expand feature is reconciled. Now also carries all 5 `scripts/backfill/*.js`.
- **Test (code):** IODA reports render via the new recharts `IodaChart.tsx` (not the old SVG scrape); new media (social images) is written to Mongo via `mediaAsset` and served through `reportController`; existing reports with disk-referenced media still resolve. Confirm `recharts` (and any new deps) install cleanly (`npm ci`) and `package-lock.json` is committed.
- **Test (scripts):** Run each backfill against a **copy** of the dev/staging DB (never prod first); confirm idempotency (safe to re-run / no-op on already-populated docs). All backfill scripts now `require("../../backend/…")` and run from the **repo root** (cwd doesn't affect relative `require` — it resolves against the script file's own dir). The three `backfill-reports-*.js` now support `--dry-run` (report counts, no writes); they target whatever `.env` `DATABASE_URL`/`DATABASE_NAME` points at.
- **Data migration (coordinated):** After the code is on development, on the **development DB first**. Every step: **dry-run, eyeball the counts, then real run.**
  1. `node backend/scripts/backfillMediaToMongo.js --dry-run` → then `node backend/scripts/backfillMediaToMongo.js` — migrate existing disk media into Mongo (reference-aware; ignores the SVG backup dir). NB: on a laptop the `dangling` count is inflated because the shared Atlas DB references files written to another host's `public/media`; run where the fetch process's disk lives (dev server) for a representative count.
  2. `node scripts/backfill/backfill-ioda-charts.js --dry-run` → then `node scripts/backfill/backfill-ioda-charts.js` — **canonical** IODA backfill: re-fetch signal series into `metadata.rawAPIResponse.chart` for **legacy** reports (those with a scraped `ioda/charts/*.svg` image key and `chart` absent). (Do **not** run `scripts/backfill-ioda-svg-to-json.js` — offline fallback only.)
  3. `node scripts/backfill/backfill-ioda-null-charts.js --dry-run` → then `node scripts/backfill/backfill-ioda-null-charts.js` — **IODA blank-chart repair:** re-fetch signals for reports the live channel blanked (`chart` **null/empty** + **no** image) after a transient IODA signals-API error at fetch time (`ioda.js` catches the throw, stores `chart=null`, never retries). Covers a **disjoint** set from step 2 (new-code reports, not legacy-SVG ones), so run it after. Idempotent; a re-fetch that still fails logs `retry-later` and is skipped for a future run. (On dev this was 15/677 reports; all 15 re-fetched cleanly.)
  4. Verify counts, spot-check migrated reports (incl. previously-blank IODA alerts now rendering), confirm `persistSvgChart` legacy path still works for un-backfilled data.
- **Refresh:** merge `development` in. PR → merge to `development`.

### 3. `feat/incident-alert-filtering` — land last (stale, largest, layers on IODA)
- **Why last:** (a) It's 21 commits behind with an old merge-base — do the big `development` refresh **once**, after everything else has landed. (b) It adds click-to-expand outage charts + ASN detail onto `IodaEvent.tsx`/`TrafficEvent.tsx` that media-migration just rewrote — reconcile the additive feature onto the new recharts foundation here and re-test IODA end-to-end. (c) Largest frontend surface (filters, date/time display prefs, compare-from-list, lifecycle-stage filtering) — validate against the final combined state.
- **Critical refresh step:** `git merge development` (or rebase) into the branch **before** final testing. Even though `merge-tree` shows no textual conflict today, manually verify the IODA components after the merge: the click-to-expand/ExpandableChart must work with the new recharts `IodaChart`, and `reportParser.ts` / `src/api/reports/types.ts` must reconcile both branches' additions.
- **Test:** Alerts/incidents filtering (lifecycle stage, date-range calendar UX), compare checkboxes from list & table views, user display-preferences (date/time formats via `UserProfile`), ASN/network/geo-scope in the source column, and — most importantly — IODA/outage charts rendering + expanding correctly on top of media-migration. Also confirm the dev-reload-loop fix (media out of `public/`) still holds alongside media-migration's Mongo storage (both touch `socialImageStorage.js` — ensure the final merged behavior stores to Mongo, not `public/`).
- **Data migration (coordinated):** After the code is on development, run the independent Report/Group backfills against the **development DB** (each `--dry-run` first, eyeball counts, then real run), all from the **repo root**:
  - `node scripts/backfill/backfill-reports-outage-fields.js --dry-run` → then without `--dry-run`
  - `node scripts/backfill/backfill-reports-entity-level.js --dry-run` → then without `--dry-run`
  - `node scripts/backfill/backfill-reports-eventIdentifier-eventAggKeyBase.js --dry-run` → then without `--dry-run`
  - `backfill-incidents.js` is different: it *imports* incidents from a JSON export, so it needs `--file <export.json>` (`node scripts/backfill/backfill-incidents.js --file <path> --dry-run`) — only run it if you actually have an incident export to load.

  These populate the report/incident fields this branch's filtering/display features read (entity level, outage fields, event identifiers). All scripts `require("../../backend/…")` and read the DB from `.env` (`DATABASE_URL`/`DATABASE_NAME`) — point it at the development DB first.
- **Refresh:** merge updated `development` in (resolve IODA reconciliation). PR → merge to `development`.

## Promotion: development → staging → production

**Stage 1 — development → staging.** After all three PRs are on `development` and the development environment is green (code + the coordinated backfills run against the development DB):
1. Merge `development → staging` (they were 1:1, so this is a fast-forward / clean merge of the landed work).
2. Re-test in the **staging** environment — the same smoke tests, plus run the coordinated backfills against the **staging DB** (each `--dry-run` first): `backfillMediaToMongo.js` → `backfill/backfill-ioda-charts.js` → `backfill/backfill-ioda-null-charts.js` → independent `backfill-reports-*`/`backfill-incidents.js`.

**Stage 2 — staging → production.** Once staging is green:
1. **Backup prod DB** before any migration.
2. Deploy the staging build to production (PM2 per `SCRIPTS.md`); run `npm ci` so `recharts`/new deps and the source-schema code are present.
3. Run the coordinated backfills on **prod**, in the media-migration order above (each `--dry-run` first): `backfillMediaToMongo.js` → `backfill/backfill-ioda-charts.js` (canonical API re-fetch; **not** `backfill-ioda-svg-to-json.js`) → `backfill/backfill-ioda-null-charts.js` (blank-chart repair) → the independent `backfill-reports-*` / `backfill-incidents.js` as needed. Each is designed to be idempotent — verify that before running.
4. If `api-redesign`'s source-schema change needs a normalization pass on prod source docs, run/verify that too.
5. Smoke-test prod: IODA charts render, media loads from Mongo, sources fetch, filters/compare work.

## Verification (per branch, before each PR)

- `npm run dev` (frontend `:8000` + backend `:3000`); exercise the specific UI/flows listed per branch above.
- For data/script branches: run the script against a development DB copy, confirm idempotency and correct results, re-run to confirm no-op.
- Re-run `git merge-tree $(git merge-base development <branch>) development <branch>` after refreshing to reconfirm a clean merge; then do the merge and manually inspect the two hot-spot areas (IODA components, `socialImageStorage.js`).
- No automated test runner is configured (`npm test` is not wired up), so validation is manual/app-driven.

## Notes
- These are sequential PRs into `development`; do not push directly to `development`/`staging`. Promote to `staging` only once everything is green on `development` (see Promotion section).
