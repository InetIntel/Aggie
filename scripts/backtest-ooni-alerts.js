const fs = require('fs');
const path = require('path');
const { fetchDailyMeasurements } = require('../backend/fetching/ooniApi');
const { normalizeDailyCounts, evaluateAlert } = require('../backend/fetching/ooniAlerts');

const ASNS = [44244, 58224];
const ALERT_SINCE = '2025-12-01';
const NETWORK_NAMES = { 44244: 'IranCell', 58224: 'MCCI' };

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

async function main() {
  const alertUntil = process.argv[2] || new Date().toISOString().slice(0, 10);
  const dataSince = shiftDay(ALERT_SINCE, -16);
  const dataUntil = alertUntil;
  const output = [];

  for (const asn of ASNS) {
    const rows = await fetchDailyMeasurements({ asn, since: dataSince, until: dataUntil });
    const dailyCounts = normalizeDailyCounts(rows, dataSince, dataUntil);
    for (let alertDate = ALERT_SINCE; alertDate <= alertUntil; alertDate = shiftDay(alertDate, 1)) {
      const triggers = evaluateAlert(dailyCounts, alertDate);
      if (triggers.length > 0) {
        output.push({
          asn,
          networkName: NETWORK_NAMES[asn],
          alertDate,
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
    'asn', 'networkName', 'alertDate', 'triggerTypes', 'measurementDay',
    'measurementCount', 'recentStart', 'recentEnd', 'recentCounts',
    'recentAverage', 'baselineStart', 'baselineEnd', 'baselineNonZeroDays',
    'baselineAverage', 'declineFraction',
  ];
  const csvRows = output.map((alert) => {
    const zero = alert.triggers.find((trigger) => trigger.type === 'zero_measurements') || {};
    const decline = alert.triggers.find((trigger) => trigger.type === 'measurement_decline') || {};
    const row = {
      ...alert,
      triggerTypes: alert.triggers.map((trigger) => trigger.type),
      ...zero,
      ...decline,
    };
    return csvFields.map((field) => csvValue(row[field])).join(',');
  });
  const csvPath = path.join(outputDirectory, 'ooni-alert-backtest.csv');
  fs.writeFileSync(csvPath, `${csvFields.join(',')}\n${csvRows.join('\n')}\n`);
  const triggerCsvFields = [
    'asn', 'networkName', 'alertDate', 'triggerType', 'zeroMeasurementDay',
    'zeroMeasurementCount', 'recentStart', 'recentEnd', 'recentCounts',
    'recentAverage', 'baselineStart', 'baselineEnd', 'baselineNonZeroDays',
    'baselineAverage', 'declineFraction', 'declinePercent',
  ];
  const triggerCsvRows = output.flatMap((alert) => {
    // When both triggers fire on the same day, keep only the zero-measurement alert.
    const hasZero = alert.triggers.some((trigger) => trigger.type === 'zero_measurements');
    const triggers = hasZero
      ? alert.triggers.filter((trigger) => trigger.type === 'zero_measurements')
      : alert.triggers;
    return triggers.map((trigger) => {
    const row = {
      asn: alert.asn,
      networkName: alert.networkName,
      alertDate: alert.alertDate,
      triggerType: trigger.type,
      ...trigger,
      zeroMeasurementDay: trigger.type === 'zero_measurements'
        ? trigger.measurementDay
        : null,
      zeroMeasurementCount: trigger.type === 'zero_measurements'
        ? trigger.measurementCount
        : null,
      declinePercent: trigger.declineFraction == null
        ? null
        : trigger.declineFraction * 100,
    };
    return triggerCsvFields.map((field) => csvValue(row[field])).join(',');
  });
  });
  const triggerCsvPath = path.join(outputDirectory, 'ooni-alert-triggers.csv');
  fs.writeFileSync(
    triggerCsvPath,
    `${triggerCsvFields.join(',')}\n${triggerCsvRows.join('\n')}\n`,
  );
  console.log(`Wrote ${output.length} alerts to ${outputPath}`);
  console.log(`Wrote CSV output to ${csvPath}`);
  console.log(`Wrote ${triggerCsvRows.length} individual triggers to ${triggerCsvPath}`);
  ASNS.forEach((asn) => {
    const alerts = output.filter((alert) => alert.asn === asn);
    const zeros = alerts.filter((alert) => alert.triggers.some((trigger) => trigger.type === 'zero_measurements')).length;
    const declines = alerts.filter((alert) => alert.triggers.some((trigger) => trigger.type === 'measurement_decline')).length;
    console.log(`AS${asn}: ${alerts.length} reports (${zeros} zero-measurement triggers, ${declines} decline triggers)`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});