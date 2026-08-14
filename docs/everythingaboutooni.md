# OONI integration architecture

## Purpose

This integration monitors OONI `web_connectivity` measurement volume for two
Iranian mobile networks:

| Network | ASN |
| --- | --- |
| IranCell | AS44244 |
| MCCI | AS58224 |

It reuses Aggie's existing sources, polling channels, report hooks, and MongoDB
reports collection. It does not introduce another service or database.

## Data flow

```mermaid
flowchart LR
    A[OONI aggregation API] --> B[OONI poll channel]
    B --> C[Normalize omitted dates]
    C --> D[Check D-1 for zero]
    D --> E[Aggie post-to-report hook]
    E --> F[MongoDB reports]
```

The channel polls hourly. Before 06:00 UTC, it evaluates the day before the
previous UTC day. At and after 06:00 UTC, it evaluates the previous UTC day.

For each configured ASN it requests:

- `probe_cc=IR`
- `probe_asn=<asn>`
- `test_name=web_connectivity`
- `axis_x=measurement_start_day`

The API can omit dates with no measurements. `normalizeDailyCounts` creates
those missing dates with a count of zero before `evaluateAlert` checks `D-1`.
A nonzero count produces no alert.

## Report format

Each alert uses the GUID:

```text
ooni:<asn>:volume:<alert-date>
```

The channel checks for an existing report before enqueueing. The report model's
unique `guid` index provides the final database-level duplicate guard.

The channel emits platform `ooni`, an OONI Explorer URL, and raw metadata shaped
like this:

```json
{
  "probeCC": "IR",
  "probeASN": 44244,
  "networkName": "IranCell",
  "testName": "web_connectivity",
  "entityLevel": "AS",
  "alertDate": "2026-01-10",
  "triggers": [
    {
      "type": "zero_measurements",
      "alertDate": "2026-01-10",
      "measurementDay": "2026-01-09",
      "measurementCount": 0
    }
  ]
}
```

The post also sets `isOutageEvent`, `isAsnScoped`, and `asn`, allowing the
existing Alerts query to retrieve it. `postToReport` stores the raw object as
`metadata.rawAPIResponse`, assigns the source and tags, and saves the post
through the normal report pipeline.

## Implementation files

- `backend/fetching/ooniApi.js`: OONI aggregation API client.
- `backend/fetching/ooniAlerts.js`: date normalization and zero-only evaluator.
- `backend/fetching/channels/ooni.js`: hourly polling and report creation.
- `backend/fetching/sourceToChannel.js`: creates an OONI channel from a source.
- `backend/fetching/hooks/postToReport.js`: stores OONI metadata.
- `backend/config/models/sourceConfigs.js`: registers the `ooni` source type.
- `backend/config/models/credentialsConfigs.js`: registers the public credential type.
- `scripts/backtest-ooni-alerts.js`: historical evaluation and JSON/CSV export.
- `src/pages/Settings/Credentials/CreateCredentialForm.tsx`: creates no-secret OONI credentials.
- `src/pages/Settings/source/CreateEditSourceForm.tsx`: creates and edits ASN lists.
- `src/components/SocialMediaPost/OoniEvent.tsx`: renders OONI alert details.
- `src/pages/Reports/TableView/CompareCardBody.tsx`: compares OONI alerts without chart assumptions.

## Tests

Run focused tests with:

```powershell
npm run test:ooni
```

The tests cover missing-day normalization, zero and nonzero decisions, API
query construction and failures, ASN validation, deterministic 06:00 UTC date
selection, report content, and duplicate suppression.

## Limitations

- Country code and known network names are intentionally Iran-specific.
- Consecutive zero days create separate daily reports.
- API retries and an incident-level cooldown are not included.
- Measurement-decline alerts, domain analysis, and Docker deployment are not
  included.