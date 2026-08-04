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
  const dataSince = shiftDay(ALERT_SINCE, -1);
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
    'asn', 'networkName', 'alertDate', 'triggerType', 'measurementDay',
    'measurementCount',
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
  ASNS.forEach((asn) => {
    const alerts = output.filter((alert) => alert.asn === asn);
    console.log(`AS${asn}: ${alerts.length} zero-measurement reports`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});