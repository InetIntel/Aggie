# OONI alerts stopped saving after Oct 7

## Symptom

No new OONI alerts appeared after 2026-10-07. The fetching process kept polling every hour and the OONI API answered normally, but the alert never reached the database. The only alerts since then (Oct 17 and Oct 19) were runs where the chart request failed.

## Root cause

PR #213 stores a 14-day chart on each alert at `metadata.rawAPIResponse.chart`. `domains` was an object keyed by domain name (`"www.wechat.com": [14 counts]`). The MongoDB driver in use (`mongodb` 3.7.4, through Mongoose 5.13) refuses to insert a document with a `.` in a field name, so `Report.create` threw `key www.wechat.com must not contain '.'` for every alert that had a chart.

`backend/fetching/hooks/saveToDatabase.js` caught the error, logged one line and carried on. Nothing reached the source's error events, so the OONI source page showed nothing wrong. The dev server logged 1,492 of these lines between Oct 8 and early November (two per hour, one per ASN).

Because the daily alert never existed, every hourly run repeated about 100 measurement requests plus the chart requests. That load is the likely cause of the 429, 500, 502 and 504 responses seen from OONI in the same period.

## Other weak points found while investigating

1. Save failures are only logged to the process output.
2. One failed measurements request aborts the whole hourly run, including the other ASN.
3. No retry, backoff or `Retry-After` handling, and no request timeout.
4. A response with no `results` list is treated as "no measurements", which raises a false alert.
5. The alert GUID does not include the probe country or test name, so two sources on the same ASN suppress each other.
6. Configuration edge cases: an `AS` prefix in the ASN list, invalid or unicode domains, a lowercase or malformed country code, non-web tests described as web connectivity, the error listener running for a deleted source, and `lastReportDate` never updating for OONI sources.

## Not changed on purpose

- Alerts fire almost every day because several watched domains are rarely measured. That is how the watchlist is built.
- Recent OONI data can arrive late, so a window can look empty when polled.
- Alerts are split at midnight UTC.
- The roughly 30 days of alerts that were lost have not been regenerated.
