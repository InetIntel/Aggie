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

> Read `CLAUDE.md`, `docs/handoff/PROJECT_HANDOFF_2026-08-22.md`, `docs/handoff/COPILOT_CONVERSATION_2026-08-22.md`, `docs/OONI.md`, and `docs/everythingaboutooni.md`. Verify the current branch and tests before changing anything. Continue the OONI rolling 24-hour integration using the documented exact-window and daily-deduplication contracts.
