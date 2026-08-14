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

function evaluateAlert(dailyCounts, alertDate) {
  const date = toDay(alertDate);
  const countsByDay = new Map(
    dailyCounts.map(({ day, measurementCount }) => [day, measurementCount]),
  );
  const latestDay = dayString(shiftDay(date, -1));
  const latestCount = countsByDay.get(latestDay) || 0;

  if (latestCount !== 0) return [];

  return [
    {
      type: 'zero_measurements',
      alertDate: dayString(date),
      measurementDay: latestDay,
      measurementCount: 0,
    },
  ];
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

function evaluateDomainAlerts(rows, domains, alertDate) {
  const normalizedConfig = normalizeDomainConfig({ domains });
  const counts = new Map();
  rows.forEach((row) => {
    const domain = String(row.domain || '').trim().toLowerCase();
    if (domain) counts.set(domain, Number(row.measurement_count) || 0);
  });

  const measurementDay = dayString(shiftDay(toDay(alertDate), -1));
  return normalizedConfig.domains
    .filter((domain) => (counts.get(domain) || 0) === 0)
    .map((domain) => ({
      type: 'zero_domain_measurements',
      domain,
      alertDate: dayString(toDay(alertDate)),
      measurementDay,
      measurementCount: 0,
    }));
}

module.exports = {
  normalizeDailyCounts,
  evaluateAlert,
  normalizeDomainConfig,
  evaluateDomainAlerts,
};