# Aggie OONI project handoff

## Repository state

- Repository: `https://github.com/InetIntel/Aggie.git`
- Branch: `user/skadukuntla3/ooni_staging`
- Base/staging branch: `origin/staging`
- Runtime: Node `22.14.0`, npm `10.9.2`, MongoDB 7+
- Frontend: React 17, CRA 5, TypeScript 4.5, Tailwind 3
- Backend: Express, Mongoose 5.9.16, multi-process API/fetching architecture
- Conversation export: `docs/handoff/COPILOT_CONVERSATION_2026-08-22.md`
- Raw VS Code session backup (not committed): `C:\Users\kadukuntlas\Downloads\Aggie-OONI-full-copilot-session-2026-08-22.jsonl`

The raw JSONL contains VS Code tool protocol records and local paths. The committed Markdown contains every visible user and assistant message and is the preferred context for another model.

## Agent entry point

This document is written to be used directly as context for a coding agent. The agent should treat the checked-out repository as the source of truth and use this file as a map of the work, not as a substitute for reading the implementation.

Read in this order:

1. `CLAUDE.md` for repository architecture, supported versions, commands, and local conventions.
2. This handoff for the feature contract, decisions, affected files, and known limitations.
3. `docs/OONI.md` and `docs/everythingaboutooni.md` for operator behavior and detailed architecture.
4. The four commits listed below, oldest to newest, to understand how the feature evolved.
5. The current implementation and focused tests listed under **Files and responsibilities**.
6. `docs/handoff/COPILOT_CONVERSATION_2026-08-22.md` only when the reason for a decision or an earlier rejected approach is still unclear.

Evidence priority for resolving conflicts:

1. Current code and tests.
2. Current Git diff and commit contents.
3. This project handoff and the OONI documentation.
4. The conversation export, which contains historical exploration and may mention approaches that were later replaced.

Before answering questions or editing code, the agent should confirm that the expected branch and commits are present:

```powershell
git fetch origin
git status --short --branch
git log --reverse --oneline origin/staging..HEAD
git diff --stat origin/staging...HEAD
```

The expected feature commit sequence is `fef7e7b8`, `4d6bb603`, `2ea89db2`, and `930ca5bc`. If the branch or range differs, inspect the available history instead of assuming this document still describes `HEAD` exactly.

## Understand the PR and commits

The branch is the complete PR implementation. Review it as one feature against `origin/staging`, then inspect individual commits to understand intent and progression:

```powershell
git log --format=fuller --reverse origin/staging..HEAD
git diff origin/staging...HEAD
git show --stat --summary fef7e7b8
git show --stat --summary 4d6bb603
git show --stat --summary 2ea89db2
git show --stat --summary 930ca5bc
```

Use `git show <commit> -- <path>` when a question concerns one file. Use `git blame <path>` only after reading the relevant commit because the commit message explains more of the design intent than an isolated blamed line.

If GitHub CLI is installed and authenticated, retrieve the live PR metadata and review discussion with:

```powershell
gh pr view user/skadukuntla3/ooni_staging --json number,title,body,url,baseRefName,headRefName,commits,files,reviews,comments
gh pr checks user/skadukuntla3/ooni_staging
```

If no PR exists yet, compare the branch on GitHub or create a PR from `user/skadukuntla3/ooni_staging` into `staging`. Do not infer unresolved reviewer feedback from the conversation export; check the live PR first.

The commits divide the work as follows:

- `fef7e7b8`: introduces the backend OONI source, polling channel, API integration, models/report flow, and initial tests.
- `4d6bb603`: adds source configuration and OONI report rendering to the React frontend.
- `2ea89db2`: adds selected-domain monitoring, the 50-domain repository watchlist, grouped zero-domain alerts, backtesting, documentation, and Windows setup.
- `930ca5bc`: replaces completed-day production checks with exact rolling 24-hour existence checks, adds date-level deduplication, updates tests/UI/docs, and adds the handoff artifacts.

## Answer future questions

When asked how the feature works, trace the concrete path from source creation through polling, API requests, alert evaluation, report persistence, and frontend rendering. Cite the relevant file and function rather than relying only on this summary.

When asked why a decision was made, inspect the commit that introduced it and then search the conversation export for terms such as `rolling 24`, `aggregation`, `measurements`, `dedupe`, `zero_domain_measurements`, or the affected filename. Explain both the chosen design and the rejected alternative when that distinction matters.

When asked whether behavior is implemented, separate these categories explicitly:

- **Implemented:** present in current code and covered by tests or direct inspection.
- **Documented intent:** described here or in the conversation but not found in current code.
- **Operational assumption:** depends on OONI, MongoDB, environment configuration, or deployment state.
- **Unknown:** cannot be verified from the repository or live PR; state what evidence is needed.

Do not claim that zero measurements prove blocking. The implemented signal means only that OONI returned no matching measurement for the requested ASN/domain/window.

## Continue coding safely

Before modifying the feature, read the owning implementation and its nearest focused test. Preserve the established contracts unless the user explicitly changes them: hourly polling, exact rolling 24-hour timestamps, selected/all-domain modes, grouped missing domains, and one report per ASN/mode/UTC end-date.

After each focused change:

1. Update or add the nearest OONI test.
2. Run the focused backend tests shown under **Validation commands** below.
3. Typecheck changed React files when frontend metadata or rendering changes.
4. Update both OONI docs when runtime behavior, configuration, metadata, or limitations change.
5. Run `git diff --check` and inspect `git diff` before committing.

Never commit `.env`, `backend/config/secrets.json`, credentials, generated backtest data, or the raw VS Code JSONL transcript. Do not replace React 17, TypeScript 4.5, or Mongoose 5 patterns with newer-version APIs without first upgrading the repository deliberately.

## Commit history for this work

1. `fef7e7b8` - initial backend OONI port.
2. `4d6bb603` - OONI frontend integration.
3. `2ea89db2` - selected-domain alerts, repository watchlist, backtest updates, documentation, and Windows bootstrap.
4. The latest commit adds exact rolling 24-hour evaluation and this handoff. Use `git log --oneline` to obtain its hash after cloning.

## Goal and decisions

Aggie must monitor OONI `web_connectivity` measurements for configured Iranian ASNs and create normal Aggie reports when no measurements exist.

Final decisions made during the session:

- OONI polling runs hourly.
- Production evaluates an exact rolling interval `[poll time - 24 hours, poll time)`.
- Default mode monitors a repository-backed list of 50 domains.
- Every watched domain with no result in the interval creates a `zero_domain_measurements` trigger.
- All zero-domain triggers for one ASN/window are grouped into one report.
- `useAllDomains: true` switches to one ASN-wide existence check.
- Configuration is global in `backend/fetching/config/ooni.json`; it is intentionally not per-source.
- Duplicate policy is at most one report per ASN/domain mode/UTC window end-date.
- Selected and all-domain modes have separate GUID namespaces.
- Existing reports retain immutable alert-time domain configuration and exact window metadata.

## Production data flow

1. `backend/fetching/sourceToChannel.js` creates `OONIChannel` from an enabled OONI source and its ASN list.
2. `OONIChannel` extends downstream's `PollChannel` and runs every hour.
3. At each poll it computes exact ISO timestamps:
   - `windowEnd = now`
   - `windowStart = now - 24 hours`
4. Before querying OONI, it computes the date-scoped GUID and checks MongoDB for an existing report. Existing reports skip all OONI requests for that ASN/mode/date.
5. `backend/fetching/ooniApi.js` queries `https://api.ooni.org/api/v1/measurements` with:
   - `probe_cc=IR`
   - `probe_asn=AS<asn>`
   - `test_name=web_connectivity`
   - exact `since` and `until` timestamps
   - optional `domain=<watched domain>`
   - `limit=1`
6. The API helper returns a Boolean presence result. The selected-domain mode makes one request per watched domain; all-domain mode makes one request per ASN.
7. `backend/fetching/ooniAlerts.js` creates zero-only rolling triggers.
8. `OONIChannel` creates one `SocialMediaPost`, marks it as an ASN-scoped outage event, and enqueues it through Aggie's existing report hooks.
9. `postToReport` stores the event as a normal report. Existing Alerts queries and frontend views display it.

## Duplicate behavior

GUIDs are deterministic by UTC window end-date:

- Selected domains: `ooni:<asn>:domains:<YYYY-MM-DD>`
- All domains: `ooni:<asn>:volume:<YYYY-MM-DD>`

This deliberately permits only one alert per ASN/mode/date even though the exact rolling window changes hourly. If early polls contain measurements, no alert is created and later polls continue. Once a poll finds a zero window and creates a report, later polls on that UTC date are skipped. A new UTC date may create another report.

The MongoDB unique GUID index is the final race-condition guard after the pre-query existence check.

## Files and responsibilities

- `backend/fetching/channels/ooni.js`: hourly scheduling, exact rolling window, per-date deduplication, report content and metadata.
- `backend/fetching/ooniApi.js`: exact measurement-existence API plus daily aggregation helper used by historical backtests.
- `backend/fetching/ooniAlerts.js`: domain configuration validation, rolling trigger evaluators, and historical daily normalization.
- `backend/fetching/config/ooni.json`: `useAllDomains` and the default 50-domain watchlist.
- `backend/fetching/channels/ooni.test.js`: channel behavior, exact timestamps, grouping, ASN validation, and skip-before-query duplicate behavior.
- `backend/fetching/ooniApi.test.js`: request shapes, exact timestamps, ASN format, domain filter, `limit=1`, and failures.
- `backend/fetching/ooniAlerts.test.js`: config normalization and rolling zero/nonzero decisions.
- `scripts/backtest-ooni-alerts.js`: historical JSON/CSV export. It uses daily aggregation as an efficient equivalent only for midnight-ended 24-hour windows.
- `src/components/SocialMediaPost/OoniEvent.tsx`: detail view with network, ASN, window endpoints, count, and zero domains.
- `src/pages/Reports/TableView/CompareCardBody.tsx`: comparison view with rolling-window metadata and no chart assumption.
- `docs/OONI.md`: operator behavior and setup.
- `docs/everythingaboutooni.md`: architecture and report schema.
- `setup-windows.ps1`: idempotent Windows bootstrap for Git, fnm, Node, Docker Desktop, MongoDB 7, `.env`, dependencies, tests, build, and optional development startup.

## Historical backtest distinction

The OONI aggregation endpoint rejects non-midnight timestamps and offers no hourly axis. Production therefore uses `/api/v1/measurements` for exact rolling windows. The backtest keeps `/api/v1/aggregation` for efficient historical scans and evaluates windows ending at UTC midnight.

Example:

```powershell
npm run backtest:ooni -- 2026-07-30 "44244,58224"
```

Outputs are ignored under `data/`:

- `data/ooni-alert-backtest.json`
- `data/ooni-alert-backtest.csv`

## Frontend and source setup

1. In Settings, create an `ooni` credential. The OONI API is public, so no API secret is required.
2. Create an `ooni` source with positive ASNs separated by spaces or commas, normally `44244, 58224`.
3. Enable the source and global fetching.
4. OONI reports appear in Alerts with media type `ooni` and entity level `AS`.

## Windows machine bootstrap

From an elevated PowerShell window in the cloned repository:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1 -StartDevelopment
```

If WSL2 or Docker requires a reboot, reboot and run the same command again. The script is idempotent and preserves existing `.env` and MongoDB data.

Local application URL: `http://localhost:8000` unless certificates/configuration select HTTPS.

## Validation completed

The rolling implementation was validated with:

- 12 focused Node tests passing.
- Focused TypeScript compilation for both modified OONI React components.
- A live exact-timestamp OONI lookup returning a measurement in the requested interval.
- A live historical selected-domain backtest producing expected output.
- VS Code diagnostics clean for all touched implementation files.
- `git diff --check` clean.

The complete CRA build was previously blocked by the repository's existing missing `@simplewebauthn/browser` dependency state. This was not caused by the OONI changes. Recheck after a clean dependency install on the new machine.

## Validation commands

Use Node `22.14.0` for authoritative validation:

```powershell
node --test backend/fetching/ooniAlerts.test.js backend/fetching/ooniApi.test.js backend/fetching/channels/ooni.test.js
node node_modules/typescript/bin/tsc --noEmit --pretty false --jsx react-jsx --target es5 --lib dom,dom.iterable,esnext --allowJs --skipLibCheck --esModuleInterop --allowSyntheticDefaultImports --strict --forceConsistentCasingInFileNames --noFallthroughCasesInSwitch --module esnext --moduleResolution node --resolveJsonModule --isolatedModules src/components/SocialMediaPost/OoniEvent.tsx src/pages/Reports/TableView/CompareCardBody.tsx
git diff --check
```

For changes that affect broader application wiring, also run `npm run build`. Live OONI checks require network access and should supplement, not replace, deterministic tests.

## Operational considerations

- Selected mode currently performs one request per watched domain per ASN each hour. With 50 domains and two ASNs, that is 100 OONI requests per hour. Requests are sequential within each ASN to avoid a burst.
- A zero result means no matching OONI measurement was returned, not necessarily confirmed blocking or an outage.
- Exact rolling queries intentionally do not use the old 06:00 UTC daily publication delay.
- Country code and known friendly network names are Iran-specific.
- Changing the repository domain configuration requires restarting the fetching process.
- `backend/config/secrets.json` and `.env` are local-only and must never be committed.

## Continue on another laptop

```powershell
git clone https://github.com/InetIntel/Aggie.git
cd Aggie
git switch user/skadukuntla3/ooni_staging
```

Then give the future model this file and `docs/handoff/COPILOT_CONVERSATION_2026-08-22.md`. A useful first prompt is:

> Act as the continuing engineer for this Aggie OONI PR. Read `CLAUDE.md` and `docs/handoff/PROJECT_HANDOFF_2026-08-22.md` first, then follow the handoff's Agent entry point. Inspect `origin/staging...HEAD` and commits `fef7e7b8`, `4d6bb603`, `2ea89db2`, and `930ca5bc`; check the live GitHub PR for newer discussion. Use current code and tests as the source of truth, and consult `docs/handoff/COPILOT_CONVERSATION_2026-08-22.md` for historical rationale only. Answer my questions with file/commit evidence, clearly separate implemented behavior from assumptions, and continue coding with focused tests while preserving the rolling-window and daily-deduplication contracts unless I explicitly change them.
