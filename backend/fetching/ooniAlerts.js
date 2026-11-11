const { domainToASCII } = require('node:url');

const DAY_MS = 24 * 60 * 60 * 1000;

function toDay(value) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dayString(value) {
  return value.toISOString().slice(0, 10);
}

function shiftDay(value, offset) {
  return new Date(value.getTime() + offset * DAY_MS);
}

function normalizeDailyCounts(rows, since, until) {
  const countsByDay = new Map();
  rows.forEach((row) => {
    const day = (row.measurement_start_day || '').slice(0, 10);
    if (day) countsByDay.set(day, Number(row.measurement_count) || 0);
  });

  const normalized = [];
  for (let day = toDay(since); day < toDay(until); day = shiftDay(day, 1)) {
    const key = dayString(day);
    normalized.push({
      day: key,
      measurementCount: countsByDay.get(key) || 0,
    });
  }
  return normalized;
}

const VALID_DOMAIN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]+\.)+[a-z0-9-]+$/;

// Lowercases, drops a trailing dot and converts non-ASCII names to punycode, which is
// what OONI stores. Returns '' for something that cannot be a hostname.
function cleanDomain(value) {
  const trimmed = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!trimmed) return '';
  const ascii = domainToASCII(trimmed);
  return VALID_DOMAIN.test(ascii) ? ascii : '';
}

// Splits a list typed by a person into usable domains (deduplicated) and the entries
// that are not valid hostnames, so the caller can reject or skip them by name.
function cleanDomainList(list) {
  const domains = [];
  const invalid = [];
  (list || []).forEach((entry) => {
    const original = String(entry || '').trim();
    if (!original) return;
    const domain = cleanDomain(original);
    if (!domain) invalid.push(original);
    else if (!domains.includes(domain)) domains.push(domain);
  });
  return { domains, invalid };
}

function normalizeDomainConfig(config) {
  const useAllDomains = config?.useAllDomains === true;
  const domains = [...new Set(
    (config?.domains || []).map((domain) => String(domain).trim().toLowerCase()),
  )];
  const validDomain = VALID_DOMAIN;

  if (!useAllDomains && domains.length === 0) {
    throw new Error('OONI domain configuration requires at least one domain.');
  }
  if (domains.some((domain) => !validDomain.test(domain))) {
    throw new Error('OONI domain configuration contains an invalid domain.');
  }

  return { useAllDomains, domains };
}

function evaluateRollingAlert(hasMeasurement, windowStart, windowEnd) {
  if (hasMeasurement) return [];

  return [{
    type: 'zero_measurements',
    alertDate: windowEnd.slice(0, 10),
    windowStart,
    windowEnd,
    measurementCount: 0,
  }];
}

function evaluateRollingDomainAlerts(rows, domains, windowStart, windowEnd) {
  const normalizedConfig = normalizeDomainConfig({ domains });
  const measuredDomains = new Set(
    rows
      .filter((row) => row.hasMeasurements)
      .map((row) => String(row.domain).trim().toLowerCase()),
  );
  // A domain whose check failed is unknown: it is not evidence of zero measurements.
  const unknownDomains = new Set(
    rows
      .filter((row) => row.unknown)
      .map((row) => String(row.domain).trim().toLowerCase()),
  );

  return normalizedConfig.domains
    .filter((domain) => !measuredDomains.has(domain) && !unknownDomains.has(domain))
    .map((domain) => ({
      type: 'zero_domain_measurements',
      domain,
      alertDate: windowEnd.slice(0, 10),
      windowStart,
      windowEnd,
      measurementCount: 0,
    }));
}

module.exports = {
  normalizeDailyCounts,
  cleanDomain,
  cleanDomainList,
  normalizeDomainConfig,
  evaluateRollingAlert,
  evaluateRollingDomainAlerts,
};