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

module.exports = {
  normalizeDailyCounts,
  evaluateAlert,
};