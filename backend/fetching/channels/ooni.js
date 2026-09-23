const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { hasMeasurements } = require('../ooniApi');
const { fetchSeries, chartEndDay } = require('../ooniSeries');
const {
  normalizeDomainConfig,
  evaluateRollingAlert,
  evaluateRollingDomainAlerts,
} = require('../ooniAlerts');
const defaultDomainConfig = require('../config/ooni.json');
const { buildEventAggKeyBase } = require('../utils/iodaUtils');
const { DATA_SOURCES } = require('../../config/fetching/externalApis');
const countries = require('i18n-iso-countries');

countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

const DAY_MS = 24 * 60 * 60 * 1000;
const PROBE_CC = 'IR';
const NETWORK_NAMES = {
  44244: 'IranCell',
  58224: 'MCCI',
};

function dayString(day) {
  return day.toISOString().slice(0, 10);
}

function alertGuid(asn, alertDate, domainMode) {
  return `ooni:${asn}:${domainMode === 'selected' ? 'domains' : 'volume'}:${alertDate}`;
}

function alertContent(asn, alerts) {
  const network = NETWORK_NAMES[asn] || `AS${asn}`;
  // No timestamp embedded here deliberately: this raw string is stored once and
  // shown to every viewer, but "when" should render per-viewer display
  // preferences (12h/24h, date order, timezone), not a fixed server-side format.
  // Deliberately no trailing period either - the frontend (SocialMediaListItem,
  // OoniEvent) appends "measured at <formatDateTime(windowEnd)>." to finish the
  // sentence with a preference-aware timestamp.
  if (alerts[0].type === 'zero_domain_measurements') {
    const domains = alerts.map((alert) => alert.domain);
    // Domain names deliberately excluded here - this text is what shows in the
    // Alerts list preview. The full list is in raw.zeroDomains, shown only in
    // the report detail view (OoniEvent.tsx).
    return `OONI domain alert for ${network} (AS${asn}): no measurements were recorded for ${domains.length} watched domain(s) for the past 24 hours`;
  }
  return `OONI volume alert for ${network} (AS${asn}): no web connectivity measurements were recorded for the past 24 hours`;
}

// Outage fields that put an OONI alert into the notable-activity aggregation.
//
// outageStartedAt is the detection time (windowEnd). The aggregation
// matches against IODA/Cloudflare using windowStart instead (see analyticsAggregation).
//
// No eventIdentifier on purpose: the guid already dedupes one alert per ASN/mode/day,
// and a shared identifier would collapse distinct alerts in the deduped alerts list.
function outageFields({ asn, probeCC = PROBE_CC, windowEnd }) {
  const normalizedAsn = `as${asn}`;
  const geoScope = countries.getName(probeCC, 'en') || probeCC;
  return {
    asn: normalizedAsn,
    geoScope,
    outageStartedAt: new Date(windowEnd),
    eventAggKeyBase: buildEventAggKeyBase({ asn: normalizedAsn, geoScope }),
  };
}

class OONIChannel extends PollChannel {
  static INTERVAL = 60 * 60 * 1000;

  constructor(options) {
    const asns = String(options.asns || '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (asns.length === 0 || asns.some((asn) => !Number.isInteger(asn) || asn <= 0)) {
      throw new Error('OONI sources require one or more valid ASNs.');
    }

    super({
      ...options,
      namespace: options.namespace || `ooni-${asns.join('-')}`,
    });
    this.asns = asns;
    this.interval = options.interval || OONIChannel.INTERVAL;
    this.hasMeasurements = options.hasMeasurements || hasMeasurements;
    this.fetchSeries = options.fetchSeries || fetchSeries;
    this.domainConfig = normalizeDomainConfig(options.domainConfig || defaultDomainConfig);
    this.reportExists = options.reportExists
      || ((query) => require('../../models/report').exists(query));
    this.now = options.now || (() => new Date());
  }

  async fetch() {
    const windowEndDate = this.now();
    const windowStartDate = new Date(windowEndDate.getTime() - DAY_MS);
    const windowStart = windowStartDate.toISOString();
    const windowEnd = windowEndDate.toISOString();
    const alertDate = dayString(windowEndDate);
    const posts = [];

    for (const asn of this.asns) {
      const domainMode = this.domainConfig.useAllDomains ? 'all' : 'selected';
      const guid = alertGuid(asn, alertDate, domainMode);
      if (await this.reportExists({ guid })) continue;

      let alerts;
      if (this.domainConfig.useAllDomains) {
        const found = await this.hasMeasurements({ asn, since: windowStart, until: windowEnd });
        alerts = evaluateRollingAlert(found, windowStart, windowEnd);
      } else {
        const rows = [];
        for (const domain of this.domainConfig.domains) {
          const found = await this.hasMeasurements({
            asn,
            domain,
            since: windowStart,
            until: windowEnd,
          });
          rows.push({ domain, hasMeasurements: found });
        }
        alerts = evaluateRollingDomainAlerts(
          rows,
          this.domainConfig.domains,
          windowStart,
          windowEnd,
        );
      }
      if (alerts.length === 0) continue;

      const chart = await this.loadChart(asn, alerts[0].windowEnd);
      const post = this.parse({ asn, alerts, guid, fetchedAt: this.now(), chart });
      posts.push(post);
      this.enqueue(post);
    }

    return posts;
  }

  // The 14 days of per-domain counts shown on the alert. Fetched once, here,
  // and stored with the alert so opening it never calls OONI (whose API is rate
  // limited per IP). A failure must not stop the alert from being created; the
  // chart can be added later with scripts/backfill/backfill-ooni-chart-series.js.
  async loadChart(asn, windowEnd) {
    if (this.domainConfig.useAllDomains) return null;
    try {
      return await this.fetchSeries({
        asn,
        endDay: chartEndDay(windowEnd),
        domains: this.domainConfig.domains,
      });
    } catch (error) {
      console.warn(`OONI chart series unavailable for AS${asn}: ${error.message}`);
      return null;
    }
  }

  parse(rawMessage) {
    const { asn, alerts, guid, fetchedAt, chart } = rawMessage;
    const alertDate = alerts[0].alertDate;
    const searchParams = new URLSearchParams({
      probe_cc: PROBE_CC,
      probe_asn: `AS${asn}`,
      test_name: 'web_connectivity',
      since: alerts[0].windowStart,
      until: alerts[0].windowEnd,
    });

    const post = new SocialMediaPost({
      authoredAt: new Date(alerts[0].windowEnd),
      fetchedAt,
      author: `OONI AS${asn}`,
      content: alertContent(asn, alerts),
      url: `https://explorer.ooni.org/search?${searchParams}`,
      platform: 'ooni',
      platformID: guid,
      raw: {
        probeCC: PROBE_CC,
        probeASN: asn,
        networkName: NETWORK_NAMES[asn] || null,
        testName: 'web_connectivity',
        dataSource: DATA_SOURCES.OONI,
        entityLevel: 'AS',
        alertDate,
        windowStart: alerts[0].windowStart,
        windowEnd: alerts[0].windowEnd,
        domainMode: this.domainConfig.useAllDomains ? 'all' : 'selected',
        domainConfigCapturedAt: fetchedAt,
        configuredDomains: this.domainConfig.useAllDomains ? [] : this.domainConfig.domains,
        zeroDomains: alerts
          .filter((alert) => alert.type === 'zero_domain_measurements')
          .map((alert) => alert.domain),
        triggers: alerts,
        ...(chart ? { chart: { ...chart, fetchedAt: fetchedAt.toISOString() } } : {}),
      },
    });

    post.isOutageEvent = true;
    post.isAsnScoped = true;
    Object.assign(post, outageFields({ asn, windowEnd: alerts[0].windowEnd }));
    return post;
  }
}

module.exports = OONIChannel;
// Exposed so scripts/backfill/backfill-ooni-report-content.js can regenerate
// stored content for existing reports using the exact same text this channel
// generates for new ones, instead of a separately maintained copy.
module.exports.alertContent = alertContent;
module.exports.outageFields = outageFields;
module.exports.DATA_SOURCE = DATA_SOURCES.OONI;