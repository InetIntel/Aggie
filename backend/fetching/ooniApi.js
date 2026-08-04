const AGGREGATION_URL = 'https://api.ooni.org/api/v1/aggregation';

async function fetchDailyMeasurements({ asn, since, until, fetchImpl = fetch }) {
  const params = new URLSearchParams({
    probe_cc: 'IR',
    probe_asn: String(asn),
    test_name: 'web_connectivity',
    axis_x: 'measurement_start_day',
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

async function fetchMeasurements({
  asn,
  since,
  until,
  confirmed,
  anomaly,
  limit = 20,
  fetchImpl = fetch,
}) {
  const params = new URLSearchParams({
    probe_cc: 'IR',
    probe_asn: `AS${asn}`,
    test_name: 'web_connectivity',
    since,
    until,
    limit: String(limit),
    order_by: 'measurement_start_time',
    order: 'desc',
  });
  if (confirmed != null) params.set('confirmed', String(confirmed));
  if (anomaly != null) params.set('anomaly', String(anomaly));

  const url = `https://api.ooni.org/api/v1/measurements?${params}`;
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`OONI measurements request failed (${response.status}): ${url}`);
  }

  const payload = await response.json();
  return payload.results || [];
}

module.exports = {
  AGGREGATION_URL,
  fetchDailyMeasurements,
  fetchMeasurements,
};