const { API_BASE_URLS, API_ROUTES } = require('../../config/fetching/externalApis');

// The signal datasources IODA's simplified dashboard overlays as lines. Order matches the
// dashboard legend: Telescope, BGP, Active Probing, Mozilla. (This is a superset of
// DATA_SOURCES.IODA, which only names the three outage-triggering sources for the report
// content string — the chart also plots Mozilla.)
const PLOTTED_DATASOURCES = ['merit-nt', 'bgp', 'ping-slash24', 'mozilla'];

// gtr feeds the "predicted normal" band: `-norm` is the modeled baseline, `-sarima` the
// seasonal forecast. IODA shades between/behind them; we carry both so the chart can too.
const PREDICTED_NORM = 'gtr-norm';
const PREDICTED_SARIMA = 'gtr-sarima';

/**
 * Turn a signals-API series (bare `values[]` on a fixed `step` from `from`) into compact
 * `[unixSeconds, value|null]` pairs. IODA does not send per-point timestamps.
 */
function seriesToPoints(series) {
    if (!series || !Array.isArray(series.values)) return [];
    const from = Number(series.from);
    const step = Number(series.step);
    return series.values.map((value, i) => [from + i * step, value]);
}

/**
 * Fetch IODA's raw signal series for an entity over a window and shape them into the compact
 * `chart` object stored on the report. Replaces the old headless-browser SVG scrape.
 *
 * @param {string} entity  entity path like "region/4442" (already geoasn-stripped by caller)
 * @returns the `chart` object, or `null` on failure (caller degrades gracefully)
 */
async function fetchSignals({ entity, from, until, maxPoints = 150 }) {
    if (!entity) return null;

    const url = new URL(`${API_ROUTES.IODA.SIGNALS_RAW}/${entity}`, API_BASE_URLS.IODA);
    url.searchParams.append('from', from);
    url.searchParams.append('until', until);
    url.searchParams.append('maxPoints', maxPoints);

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed fetching IODA signals: ${url} - ${res.status}.`);
    }

    const body = await res.json();

    // `data` arrives nested one level ([[series, series, ...]]) — flatten to the series list.
    const allSeries = Array.isArray(body.data) ? body.data.flat() : [];
    const byDatasource = new Map(allSeries.map((s) => [s.datasource, s]));

    const series = PLOTTED_DATASOURCES
        .map((datasource) => byDatasource.get(datasource))
        .filter(Boolean)
        .map((s) => ({
            datasource: s.datasource,
            step: Number(s.step),
            points: seriesToPoints(s),
        }));

    const normSeries = byDatasource.get(PREDICTED_NORM);
    const sarimaSeries = byDatasource.get(PREDICTED_SARIMA);
    const predicted = (normSeries || sarimaSeries)
        ? {
            step: Number((normSeries || sarimaSeries).step),
            norm: seriesToPoints(normSeries),
            sarima: seriesToPoints(sarimaSeries),
        }
        : null;

    return {
        from,
        until,
        entity,
        series,
        predicted,
    };
}

function normalizeScope(value) {
    if (!value) return 'na';
    return String(value).trim().toLowerCase();
}

function normalizeAsn(value) {
    if (!value) return 'na';
    return String(value).trim().toLowerCase();
}

function buildEventAggKeyBase({ asn, geoScope }) {
    const normalizedAsn = normalizeAsn(asn);
    const normalizedGeoScope = normalizeScope(geoScope);

    return `${normalizedAsn}|${normalizedGeoScope}`;
}

function buildEventIdentifier({ asn, geoScope, outageStartedAt }) {
    const eventAggKeyBase = buildEventAggKeyBase({ asn, geoScope });

    if (!outageStartedAt) {
        return `${eventAggKeyBase}|na`;
    }

    const startedAtIso =
        outageStartedAt instanceof Date
            ? outageStartedAt.toISOString()
            : new Date(outageStartedAt).toISOString();

    return `${eventAggKeyBase}|${startedAtIso}`;
}

module.exports = {
    fetchSignals,
    normalizeScope,
    normalizeAsn,
    buildEventAggKeyBase,
    buildEventIdentifier
};