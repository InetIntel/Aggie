const AGGREGATION_URL = 'https://api.ooni.org/api/v1/aggregation';
const MEASUREMENTS_URL = 'https://api.ooni.org/api/v1/measurements';

// OONI answers 429 when the per-IP quota is used up and 5xx when its backend is
// struggling. All of those are worth another try a little later.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30 * 1000;
// Hourly-grain aggregation over a week for every domain on a network is a big query.
const AGGREGATION_TIMEOUT_MS = 90 * 1000;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60 * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(error, attempt, baseDelayMs) {
  if (error.retryAfterSeconds) {
    return Math.min(error.retryAfterSeconds * 1000, MAX_DELAY_MS);
  }
  return Math.min(baseDelayMs * 2 ** attempt, MAX_DELAY_MS);
}

// GET a JSON document from OONI with a timeout and a few retries. `describe` names the
// endpoint in error messages and `validate` rejects a body that is not the shape the
// caller needs, so an unexpected answer is an error instead of being read as "no data".
async function requestJson(url, {
  describe,
  validate,
  fetchImpl = fetch,
  retries = DEFAULT_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseDelayMs = BASE_DELAY_MS,
  sleep = wait,
}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const error = new Error(`OONI ${describe} request failed (${response.status}): ${url}`);
        error.status = response.status;
        error.retryable = RETRYABLE_STATUSES.has(response.status);
        const retryAfter = response.headers?.get?.('retry-after');
        if (retryAfter) error.retryAfterSeconds = Number(retryAfter) || undefined;
        throw error;
      }

      const payload = await response.json();
      if (!validate(payload)) {
        const error = new Error(`OONI ${describe} response was not in the expected format: ${url}`);
        error.retryable = true;
        throw error;
      }
      return payload;
    } catch (error) {
      // No status means the request itself failed (timeout, connection reset, bad JSON).
      if (error.status === undefined && error.retryable === undefined) {
        error.message = `OONI ${describe} request failed (${error.name === 'TimeoutError' ? 'timeout' : error.message}): ${url}`;
        error.retryable = true;
      }
      lastError = error;
      if (!error.retryable || attempt === retries) break;
      await sleep(retryDelayMs(error, attempt, baseDelayMs));
    }
  }
  throw lastError;
}

async function hasMeasurements({
  asn,
  since,
  until,
  domain,
  probeCC = 'IR',
  testName = 'web_connectivity',
  ...requestOptions
}) {
  const params = new URLSearchParams({
    probe_cc: probeCC,
    probe_asn: `AS${asn}`,
    test_name: testName,
    since,
    until,
    limit: '1',
  });
  if (domain) params.set('domain', domain);

  const url = `${MEASUREMENTS_URL}?${params}`;
  const payload = await requestJson(url, {
    ...requestOptions,
    describe: 'measurements',
    validate: () => true,
  });
  return Array.isArray(payload.results) && payload.results.length > 0;
}

async function fetchDailyMeasurements({
  asn,
  since,
  until,
  axisX = 'measurement_start_day',
  axisY,
  timeGrain,
  probeCC = 'IR',
  testName = 'web_connectivity',
  ...requestOptions
}) {
  const params = new URLSearchParams({
    probe_cc: probeCC,
    probe_asn: String(asn),
    test_name: testName,
    axis_x: axisX,
    since,
    until,
  });
  if (axisY) params.set('axis_y', axisY);
  if (timeGrain) params.set('time_grain', timeGrain);
  const url = `${AGGREGATION_URL}?${params}`;
  const payload = await requestJson(url, {
    timeoutMs: AGGREGATION_TIMEOUT_MS,
    ...requestOptions,
    describe: 'aggregation',
    validate: () => true,
  });
  const result = payload.result || [];
  return Array.isArray(result) ? result : [result];
}

module.exports = {
  AGGREGATION_URL,
  MEASUREMENTS_URL,
  RETRYABLE_STATUSES,
  requestJson,
  hasMeasurements,
  fetchDailyMeasurements,
};
