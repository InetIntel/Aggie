const fs = require('fs');
const path = require('path');
const { fetchDailyMeasurements } = require('../backend/fetching/ooniApi');
const {
  normalizeDailyCounts,
  normalizeDomainConfig,
  evaluateRollingAlert,
  evaluateRollingDomainAlerts,
} = require('../backend/fetching/ooniAlerts');
const configuredDomainMode = require('../backend/fetching/config/ooni.json');

const DEFAULT_ASNS = [44244, 58224];
// How far back to evaluate by default. OONI's public API enforces a per-IP
// quota (seconds of processing time per day/week/month, not a simple
// requests-per-second cap), so keep this small - a wide range here is what
// exhausts the quota and makes every request fail with 429 for the rest of
// the day. Override with a 4th CLI arg (a UTC date) to look back further.
const DEFAULT_LOOKBACK_DAYS = 14;
const REQUEST_DELAY_MS = 500;
const RETRY_DELAYS_MS = [2000, 5000, 15000];
const NETWORK_NAMES = { 44244: 'IranCell', 58224: 'MCCI' };

function shiftDay(day, offset) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDailyMeasurementsWithRetry(options) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await fetchDailyMeasurements(options);
      await sleep(REQUEST_DELAY_MS);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === RETRY_DELAYS_MS.length;
      if (error.status !== 429 || isLastAttempt) throw error;
      const waitMs = error.retryAfterSeconds
        ? error.retryAfterSeconds * 1000
        : RETRY_DELAYS_MS[attempt];
      console.error(`Rate limited by OONI, waiting ${Math.round(waitMs / 1000)}s before retrying...`);
      await sleep(waitMs);
    }
  }
}

function csvValue(value) {
  if (value == null) return '';
  const text = Array.isArray(value) ? value.join('|') : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function main() {
  const alertUntil = process.argv[2] || new Date().toISOString().slice(0, 10);
  const asns = String(process.argv[3] || DEFAULT_ASNS.join(','))
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (asns.length === 0 || asns.some((asn) => !Number.isInteger(asn) || asn <= 0)) {
    throw new Error('Backtest ASNs must be positive integers separated by spaces or commas.');
  }
  const alertSince = process.argv[4] || shiftDay(alertUntil, -DEFAULT_LOOKBACK_DAYS);
  const dataSince = shiftDay(alertSince, -1);
  const dataUntil = alertUntil;
  const output = [];
  const domainConfig = normalizeDomainConfig(configuredDomainMode);

  for (const asn of asns) {
    let dailyCounts;
    if (domainConfig.useAllDomains) {
      const rows = await fetchDailyMeasurementsWithRetry({ asn, since: dataSince, until: dataUntil });
      dailyCounts = normalizeDailyCounts(rows, dataSince, dataUntil);
    }

    for (let alertDate = alertSince; alertDate <= alertUntil; alertDate = shiftDay(alertDate, 1)) {
      const windowStartDay = shiftDay(alertDate, -1);
      const windowStart = `${windowStartDay}T00:00:00.000Z`;
      const windowEnd = `${alertDate}T00:00:00.000Z`;
      let triggers;
      if (domainConfig.useAllDomains) {
        const dailyCount = dailyCounts.find(({ day }) => day === windowStartDay);
        triggers = evaluateRollingAlert(
          (dailyCount?.measurementCount || 0) > 0,
          windowStart,
          windowEnd,
        );
      } else {
        const rows = await fetchDailyMeasurementsWithRetry({
          asn,
          since: windowStartDay,
          until: alertDate,
          axisX: 'domain',
        });
        triggers = evaluateRollingDomainAlerts(
          rows.map((row) => ({
            domain: row.domain,
            hasMeasurements: Number(row.measurement_count) > 0,
          })),
          domainConfig.domains,
          windowStart,
          windowEnd,
        );
      }
      if (triggers.length > 0) {
        output.push({
          asn,
          networkName: NETWORK_NAMES[asn] || `AS${asn}`,
          alertDate,
          windowStart,
          windowEnd,
          domainMode: domainConfig.useAllDomains ? 'all' : 'selected',
          zeroDomains: triggers.map((trigger) => trigger.domain).filter(Boolean),
          triggers,
        });
      }
    }
  }

  const outputDirectory = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, 'ooni-alert-backtest.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  const csvFields = [
    'asn', 'networkName', 'alertDate', 'windowStart', 'windowEnd', 'triggerType',
    'measurementCount', 'domainMode', 'zeroDomains',
  ];
  const csvRows = output.map((alert) => {
    const trigger = alert.triggers[0];
    const row = {
      ...alert,
      triggerType: trigger.type,
      ...trigger,
    };
    return csvFields.map((field) => csvValue(row[field])).join(',');
  });
  const csvPath = path.join(outputDirectory, 'ooni-alert-backtest.csv');
  fs.writeFileSync(csvPath, `${csvFields.join(',')}\n${csvRows.join('\n')}\n`);
  console.log(`Wrote ${output.length} alerts to ${outputPath}`);
  console.log(`Wrote CSV output to ${csvPath}`);
  console.log(`Domain mode: ${domainConfig.useAllDomains ? 'all domains' : `${domainConfig.domains.length} selected domains`}`);
  asns.forEach((asn) => {
    const alerts = output.filter((alert) => alert.asn === asn);
    console.log(`AS${asn}: ${alerts.length} zero-measurement reports`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});