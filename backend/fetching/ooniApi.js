const AGGREGATION_URL = 'https://api.ooni.org/api/v1/aggregation';

async function fetchDailyMeasurements({
  asn,
  since,
  until,
  axisX = 'measurement_start_day',
  fetchImpl = fetch,
}) {
  const params = new URLSearchParams({
    probe_cc: 'IR',
    probe_asn: String(asn),
    test_name: 'web_connectivity',
    axis_x: axisX,
    since,
    until,
  });
  const url = `${AGGREGATION_URL}?${params}`;
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`OONI aggregation request failed (${response.status}): ${url}`);
  }

  const payload = await response.json();
  const result = payload.result || [];
  return Array.isArray(result) ? result : [result];
}

module.exports = {
  AGGREGATION_URL,
  fetchDailyMeasurements,
};