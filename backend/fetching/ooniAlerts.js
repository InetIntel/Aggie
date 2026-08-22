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

function normalizeDomainConfig(config) {
  const useAllDomains = config?.useAllDomains === true;
  const domains = [...new Set(
    (config?.domains || []).map((domain) => String(domain).trim().toLowerCase()),
  )];
  const validDomain = /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]+\.)+[a-z0-9-]+$/;

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

  return normalizedConfig.domains
    .filter((domain) => !measuredDomains.has(domain))
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
  normalizeDomainConfig,
  evaluateRollingAlert,
  evaluateRollingDomainAlerts,
};