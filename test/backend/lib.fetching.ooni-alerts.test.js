const expect = require('chai').expect;
const { normalizeDailyCounts, evaluateAlert } = require('../../backend/fetching/ooniAlerts');

describe('OONI alerts', function() {
  it('fills omitted aggregation days with zero measurements', function() {
    const rows = [
      { measurement_start_day: '2025-12-01', measurement_count: 70 },
      { measurement_start_day: '2025-12-03', measurement_count: 20 },
    ];

    const daily = normalizeDailyCounts(rows, '2025-12-01', '2025-12-04');

    expect(daily).to.deep.equal([
      { day: '2025-12-01', measurementCount: 70 },
      { day: '2025-12-02', measurementCount: 0 },
      { day: '2025-12-03', measurementCount: 20 },
    ]);
  });

  it('alerts when the completed day has zero measurements', function() {
    const daily = [
      { day: '2025-12-15', measurementCount: 50 },
      { day: '2025-12-16', measurementCount: 0 },
    ];

    const alerts = evaluateAlert(daily, '2025-12-17');

    expect(alerts[0]).to.include({
      type: 'zero_measurements',
      measurementDay: '2025-12-16',
      measurementCount: 0,
    });
  });

  it('does not alert when the completed day has measurements', function() {
    const daily = [];
    for (let day = 1; day <= 16; day++) {
      daily.push({
        day: `2025-12-${String(day).padStart(2, '0')}`,
        measurementCount: day <= 14 ? 100 : 60,
      });
    }

    const alerts = evaluateAlert(daily, '2025-12-17');

    expect(alerts).to.deep.equal([]);
  });
});