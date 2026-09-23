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

## 14-day chart on the alert

The alert detail view shows a bar chart of measurements per day for the 14 days
ending on the alert's day, with a domain picker that starts on the domains that
had zero measurements. The numbers are stored on the alert itself, at
`metadata.rawAPIResponse.chart`, and the chart reads them from there. Viewing an
alert never calls OONI, so browsing alerts cannot use up OONI's per-IP quota.

- The channel fetches the series once, when it creates an alert, with one
  aggregation request per ASN (`axis_y=domain`) and keeps the watched domains.
  If OONI refuses the request, the alert is still created, without a chart.
- The shape is `{ source, from, until, days: [...], domains: { <domain>: [14 counts] }, fetchedAt }`,
  about 3 KB per alert. Like IODA's chart, it is left out of list responses and
  returned by the single-report endpoint (`GET /api/report/:id`).
- The last day is the day the alert's window covers. A window that ends at
  midnight covers the day before; a live hourly window covers the current
  (still partial) day.
- Alerts created before this, and alerts loaded from a generated backfill file,
  have no series. Add it with `scripts/backfill/backfill-ooni-chart-series.js`,
  which asks OONI for a whole date range in a few large windows and cuts each
  alert's 14 days out of that (about 20 requests for 290 days and two networks).
  Alerts without one show "The last 14 days were not stored for this alert."
- Only selected-domain mode stores a series. In all-domains mode there is no
  watchlist to chart.

```
node scripts/backfill/backfill-ooni-chart-series.js --dry-run
node scripts/backfill/backfill-ooni-chart-series.js
```

Options: `--asn=44244` for one network, `--chunk-days=30` for the window size, and
`--max-requests=40` as a cap. It is safe to re-run: only alerts without a chart
are touched, each alert is written as soon as its 14 days have arrived, and a
stop (for example a rate limit) keeps its progress.

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