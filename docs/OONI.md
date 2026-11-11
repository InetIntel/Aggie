# OONI integration

Aggie polls OONI's public aggregation API for Iran `web_connectivity`
measurement volume on AS44244 (IranCell) and AS58224 (MCCI). Alerts enter the
normal Aggie report pipeline and use deterministic daily GUIDs, so repeated
polling creates at most one report per ASN and domain mode for each UTC window
end-date.

## Alert rule

Every hourly poll evaluates the exact interval from the poll time minus 24
hours up to the poll time. In the default selected-domain mode, Aggie creates a
`zero_domain_measurements` trigger for each configured domain with no result in
that interval. In all-domain mode, it creates one `zero_measurements` trigger
when the ASN has no result in the interval.

The production channel uses OONI's measurement-list endpoint with exact ISO
timestamps and `limit=1`; it does not approximate the rolling interval with
calendar-day aggregates. Before querying an ASN, it checks for the daily GUID.
Once an alert exists for that ASN and mode on a UTC end-date, later hourly polls
skip it, including the OONI requests.

Domain behavior is controlled by `backend/fetching/config/ooni.json`. By
default, Aggie checks the 50 selected frequent domains in that file. Every
configured domain with no result in the rolling window is treated as zero
measurements. All zero-domain triggers for one ASN and end-date are grouped
into one report. Set `useAllDomains` to `true` and restart fetching to return
to the ASN-wide zero-volume rule.

To change the watchlist, keep `useAllDomains` set to `false`, edit the
lowercase hostnames in `domains`, and restart the backend fetching process.
The list and mode stored in each report are immutable snapshots from alert
time. Selected-domain and all-domain reports use separate GUID namespaces, so
switching modes cannot suppress an alert produced by the other mode.

## Configuration

OONI's API is public, but Aggie's source model requires a credential. In
Settings, create an `ooni` credential with a name and no API secrets. Then
create an `ooni` source with one or more positive ASNs separated by spaces or
commas. The normal values are `44244, 58224`.

The corresponding stored source fields are:

- `media`: `ooni`
- `lists`: space- or comma-separated ASNs, normally `44244 58224`
- `credentials`: the OONI credential ID
- `enabled`: `true`

Global fetching must also be enabled.

OONI reports are ASN-scoped outage events and appear in the Alerts view with
media type `ooni` and entity level `AS`. List, detail, table, and comparison
views show the network, ASN, rolling window, and zero-domain details. The
report URL opens the matching OONI Explorer query.

## When OONI fails or answers oddly

- Every OONI request has a 30 second timeout (90 seconds for the chart query) and is
  retried up to three times on a timeout, 429 or 5xx, waiting 1, 2 and 4 seconds,
  or as long as `Retry-After` says. A 404 or similar is not retried.
- An answer that does not contain the expected `results` list is an error. It is
  never read as "no measurements".
- A domain that still cannot be checked is unknown, not zero: it does not trigger
  the alert, and the alert stores it in `raw.unverifiedDomains`. If five domain
  checks fail in a row the network is skipped until the next hourly run.
- Each network is checked on its own, so a failing network does not stop the
  others. Anything that could not be checked is reported once per run as an error
  event on the source, which shows on the Sources page.
- A report that fails to save is also recorded as an error event on its source, not
  only in the server log.

## Alert ids and source settings

- Iran web connectivity alerts use `ooni:<asn>:<domains|volume>:<UTC date>`. A
  source for another country or test adds them: `ooni:<asn>:<mode>:<CC>:<test>:<date>`,
  so two sources on one network do not suppress each other.
- ASNs can be written `44244` or `AS44244`. The country is a two-letter code and
  anything else falls back to `IR`.
- Tests other than `web_connectivity` have no domains, so they are checked per
  network and the alert text names the test.
- Domains saved on a source are lowercased, lose a trailing dot and are converted to
  punycode. A source with an invalid domain is refused with the entry named. An
  empty list on a source uses the default in `backend/fetching/config/ooni.json`.
- A successful check updates the source's last report date.

## 14-day chart on the alert

The alert detail view shows a bar chart of measurements in rolling 24-hour blocks:
14 blocks counted back from where the alert's window ends, so the last bar is the
alert's own window, the one before it is the 24 hours before that, and so on. A
domain picker starts on the domains that had zero measurements. The numbers are
stored on the alert itself, at `metadata.rawAPIResponse.chart`, and the chart
reads them from there. Viewing an alert never calls OONI, so browsing alerts
cannot use up OONI's per-IP quota.

- The channel fetches the series once, when it creates an alert. It uses the
  aggregation endpoint at hourly grain (`axis_y=domain`, `time_grain=hour`) and
  adds 24 hourly buckets into each block, keeping the watched domains. If OONI
  refuses the requests, the alert is still created, without a chart.
- OONI only takes whole dates in `since`/`until`, and refuses hourly grain for
  ranges longer than 7 days, so a fortnight is fetched in windows of at most 7
  days (three requests per network for a live alert).
- Hourly buckets start on the hour, so the blocks end on the hour at or before
  the window end. A live alert whose window ends at 14:30 has blocks ending at
  14:00 UTC, up to 59 minutes short of its exact window. A window ending at
  midnight (historical alerts) gives whole UTC days.
- The shape is `{ source, granularity: "hour", blockHours: 24, from, until, starts: [14 ISO times], domains: [{ domain, counts: [14 counts] }], fetchedAt }`,
  about 3 KB per alert. `domains` is a list rather than an object keyed by domain
  name, because MongoDB refuses field names that contain a `.`. If saving an alert
  with its chart fails for any reason, the alert is saved again without the chart
  instead of being lost. Like IODA's chart, it is left out of list responses and
  returned by the single-report endpoint (`GET /api/report/:id`). A chart stored
  in the earlier calendar-day shape (a `days` list) still draws, as midnight blocks.
- Alerts created before this shipped, and alerts loaded from a generated backfill
  file, have no series and are not backfilled - only new alerts get a chart. One
  shows "The last 14 days were not stored for this alert." instead.
- Only selected-domain mode stores a series. In all-domains mode there is no
  watchlist to chart.

## Historical backtest

Run the same evaluator used by the production channel:

```powershell
npm run backtest:ooni -- 2026-07-30 "44244,58224"
```

The first optional argument is the last UTC midnight window end-date to
evaluate; the second is a comma- or space-separated ASN list; the third is an
optional UTC start date, defaulting to 14 days before the end-date. The
backtest uses daily aggregation as an efficient equivalent for these
midnight-ended 24-hour windows. Results are written to the ignored
`data/ooni-alert-backtest.json` and `data/ooni-alert-backtest.csv` files.

OONI's public API enforces a per-IP quota (measured in seconds of server
processing time per day/week/month, not a fixed requests-per-second cap), so
widening the date range multiplies API calls and risks exhausting it for the
rest of the day. The script waits 500ms between requests and retries once on
a 429 with backoff (honoring `Retry-After` when present), but that cannot
help once the daily quota itself is spent - if every request 429s
immediately, wait and retry later rather than widening the range.

The integration emits only zero-measurement alerts. There is no incident-level
cooldown beyond one deterministic report per ASN, mode, and UTC window
end-date. Full
application containerization, measurement-decline detection, and offline
domain-leading-indicator research are outside this integration. The Windows
setup script uses Docker only to provide local MongoDB 7.