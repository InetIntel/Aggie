// Investigates domain-level OONI web_connectivity signals leading up to shutdown
// dates to find domains whose anomalies or confirmed blocks rise beforehand.
//
// For each shutdown date the script compares a lead-up window (the 21 days
// immediately before the date) against a baseline window (the prior 21 days)
// per domain, then ranks domains by emerging confirmed blocks and by the rise
// in anomaly rate. Output is written per ASN/date as CSV plus a JSON summary.

const fs = require('fs');
const path = require('path');

const AGGREGATION_URL = 'https://api.ooni.org/api/v1/aggregation';
const ASNS = [44244, 58224];
const NETWORK_NAMES = { 44244: 'IranCell', 58224: 'MCCI' };
const SHUTDOWN_DATES = ['2025-06-18', '2026-01-08', '2026-02-28'];
const LEADUP_DAYS = 21;
const BASELINE_DAYS = 21;
const MIN_LEADUP_MEASUREMENTS = 5; // ignore domains with too little coverage
const TOP_N = 25;

function shiftDay(day, offset) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function csvValue(value) {
  if (value == null) return '';
  const text = Array.isArray(value) ? value.join('|') : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchDomainAggregation({ asn, since, until }) {
  const params = new URLSearchParams({
    probe_cc: 'IR',
    probe_asn: String(asn),
    test_name: 'web_connectivity',
    axis_x: 'input',
    since,
    until,
  });
  const url = `${AGGREGATION_URL}?${params}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`OONI aggregation failed (${response.status}): ${url}`);
  }
  const payload = await response.json();
  const result = payload.result || [];
  return Array.isArray(result) ? result : [result];
}

function indexByDomain(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row.input) return;
    map.set(row.input, {
      measurements: Number(row.measurement_count) || 0,
      anomalies: Number(row.anomaly_count) || 0,
      confirmed: Number(row.confirmed_count) || 0,
      failures: Number(row.failure_count) || 0,
    });
  });
  return map;
}

function rate(part, total) {
  return total > 0 ? part / total : 0;
}

async function analyzeDate(asn, shutdownDate) {
  const leadupSince = shiftDay(shutdownDate, -LEADUP_DAYS);
  const leadupUntil = shutdownDate; // days before the shutdown
  const baselineSince = shiftDay(shutdownDate, -(LEADUP_DAYS + BASELINE_DAYS));
  const baselineUntil = leadupSince;

  const [leadupRows, baselineRows] = await Promise.all([
    fetchDomainAggregation({ asn, since: leadupSince, until: leadupUntil }),
    fetchDomainAggregation({ asn, since: baselineSince, until: baselineUntil }),
  ]);

  const leadup = indexByDomain(leadupRows);
  const baseline = indexByDomain(baselineRows);

  const domains = [];
  for (const [domain, l] of leadup.entries()) {
    if (l.measurements < MIN_LEADUP_MEASUREMENTS) continue;
    const b = baseline.get(domain) || {
      measurements: 0, anomalies: 0, confirmed: 0, failures: 0,
    };
    const leadupAnomalyRate = rate(l.anomalies, l.measurements);
    const baselineAnomalyRate = rate(b.anomalies, b.measurements);
    domains.push({
      shutdownDate,
      asn,
      networkName: NETWORK_NAMES[asn],
      domain,
      leadupWindow: `${leadupSince} to ${leadupUntil}`,
      leadupMeasurements: l.measurements,
      leadupAnomalies: l.anomalies,
      leadupConfirmed: l.confirmed,
      leadupAnomalyRate,
      baselineWindow: `${baselineSince} to ${baselineUntil}`,
      baselineMeasurements: b.measurements,
      baselineAnomalies: b.anomalies,
      baselineConfirmed: b.confirmed,
      baselineAnomalyRate,
      anomalyRateDelta: leadupAnomalyRate - baselineAnomalyRate,
      confirmedDelta: l.confirmed - b.confirmed,
      newlyConfirmed: b.confirmed === 0 && l.confirmed > 0,
      newlyAnomalous: baselineAnomalyRate === 0 && leadupAnomalyRate > 0,
    });
  }

  // Leading indicators: confirmed blocks or a meaningful rise in anomaly rate.
  domains.sort((a, b) => {
    if (b.leadupConfirmed !== a.leadupConfirmed) return b.leadupConfirmed - a.leadupConfirmed;
    if (b.anomalyRateDelta !== a.anomalyRateDelta) return b.anomalyRateDelta - a.anomalyRateDelta;
    return b.leadupAnomalies - a.leadupAnomalies;
  });

  return domains;
}

async function main() {
  const outputDirectory = path.join(__dirname, '..', 'data', 'domain-leading-indicators');
  fs.mkdirSync(outputDirectory, { recursive: true });

  const csvFields = [
    'shutdownDate', 'asn', 'networkName', 'domain', 'leadupWindow',
    'leadupMeasurements', 'leadupAnomalies', 'leadupConfirmed', 'leadupAnomalyRate',
    'baselineWindow', 'baselineMeasurements', 'baselineAnomalies', 'baselineConfirmed',
    'baselineAnomalyRate', 'anomalyRateDelta', 'confirmedDelta', 'newlyConfirmed',
    'newlyAnomalous',
  ];

  const summary = [];
  for (const shutdownDate of SHUTDOWN_DATES) {
    for (const asn of ASNS) {
      const domains = await analyzeDate(asn, shutdownDate);
      const top = domains.slice(0, TOP_N);
      const csvRows = top.map((row) => csvFields.map((field) => {
        const value = row[field];
        if (typeof value === 'number' && field.endsWith('Rate')) return csvValue(value.toFixed(4));
        return csvValue(value);
      }).join(','));
      const csvPath = path.join(
        outputDirectory,
        `${shutdownDate}_AS${asn}_${NETWORK_NAMES[asn]}.csv`,
      );
      fs.writeFileSync(csvPath, `${csvFields.join(',')}\n${csvRows.join('\n')}\n`);

      const confirmedDomains = domains.filter((d) => d.leadupConfirmed > 0);
      const newAnomalyDomains = domains.filter((d) => d.newlyAnomalous && d.leadupAnomalies >= 5);
      summary.push({
        shutdownDate,
        asn,
        networkName: NETWORK_NAMES[asn],
        domainsConsidered: domains.length,
        domainsWithConfirmedBlocks: confirmedDomains.length,
        domainsNewlyAnomalous: newAnomalyDomains.length,
        topConfirmed: confirmedDomains.slice(0, 10).map((d) => ({
          domain: d.domain,
          confirmed: d.leadupConfirmed,
          anomalies: d.leadupAnomalies,
          measurements: d.leadupMeasurements,
        })),
        topEmergingAnomalies: newAnomalyDomains
          .sort((a, b) => b.leadupAnomalies - a.leadupAnomalies)
          .slice(0, 10)
          .map((d) => ({
            domain: d.domain,
            leadupAnomalies: d.leadupAnomalies,
            leadupMeasurements: d.leadupMeasurements,
            leadupAnomalyRate: Number(d.leadupAnomalyRate.toFixed(3)),
          })),
      });
      console.log(
        `${shutdownDate} AS${asn} ${NETWORK_NAMES[asn]}: `
        + `${domains.length} domains, `
        + `${confirmedDomains.length} with confirmed blocks, `
        + `${newAnomalyDomains.length} newly anomalous`,
      );
    }
  }

  const summaryPath = path.join(outputDirectory, 'summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nWrote per-date CSVs and summary to ${outputDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
