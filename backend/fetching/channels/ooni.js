const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { hasMeasurements } = require('../ooniApi');
const { fetchSeries, chartAnchor, domainsToStored } = require('../ooniSeries');
const {
  cleanDomainList,
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
const WEB_CONNECTIVITY = 'web_connectivity';
// OONI rejecting this many domain checks in a row means it is down or refusing us; more
// requests would only add load, so the network is left for the next hourly run.
const MAX_CONSECUTIVE_FAILURES = 5;
const REQUEST_DELAY_MS = 250;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NETWORK_NAMES = {
  44244: 'IranCell',
  58224: 'MCCI',
};

function dayString(day) {
  return day.toISOString().slice(0, 10);
}

// One alert per network, mode and UTC day. Sources watching something other than Iran
// web connectivity add the country and test, so two sources on the same ASN cannot
// suppress each other. Iran web connectivity keeps the original format so existing
// alerts still count as already raised.
function alertGuid(asn, alertDate, domainMode, probeCC = PROBE_CC, testName = WEB_CONNECTIVITY) {
  const mode = domainMode === 'selected' ? 'domains' : 'volume';
  const scope = probeCC === PROBE_CC && testName === WEB_CONNECTIVITY ? '' : `:${probeCC}:${testName}`;
  return `ooni:${asn}:${mode}${scope}:${alertDate}`;
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

  // The country comes from a free-text field on the source. Anything that is not a
  // two-letter code falls back to the default instead of querying OONI with junk,
  // which would read as "no measurements".
  static cleanProbeCC(value) {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return PROBE_CC;
    if (!/^[A-Z]{2}$/.test(code)) {
      console.warn(`OONI probe country "${value}" is not a two-letter code; using ${PROBE_CC}.`);
      return PROBE_CC;
    }
    return code;
  }

  // Domains saved on a source are cleaned (trailing dots, case, unicode) and invalid
  // entries are skipped with a warning, so one bad entry does not stop the source.
  static cleanDomainConfig(config) {
    if (!config || !Array.isArray(config.domains)) return config;
    const { domains, invalid } = cleanDomainList(config.domains);
    if (invalid.length > 0) {
      console.warn(`OONI source ignored invalid domain(s): ${invalid.join(', ')}.`);
    }
    return { ...config, domains };
  }

  constructor(options) {
    // "44244", "AS44244" and mixed lists are all accepted; repeats are dropped.
    const asns = [...new Set(
      String(options.asns || '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((asn) => Number(asn.replace(/^as/i, ''))),
    )];
    if (asns.length === 0 || asns.some((asn) => !Number.isInteger(asn) || asn <= 0)) {
      throw new Error('OONI sources require one or more valid ASNs.');
    }

    super({
      ...options,
      namespace: options.namespace || `ooni-${asns.join('-')}`,
    });
    this.options = options;
    this.asns = asns;
    // Probe country and test are configurable per-source; fall back to the
    // historical Iran / web_connectivity defaults so existing sources (which
    // store neither) keep their current behavior.
    this.probeCC = OONIChannel.cleanProbeCC(options.probeCC);
    this.testName = options.testName || 'web_connectivity';
    this.interval = options.interval || OONIChannel.INTERVAL;
    this.hasMeasurements = options.hasMeasurements || hasMeasurements;
    this.fetchSeries = options.fetchSeries || fetchSeries;
    this.domainConfig = normalizeDomainConfig(OONIChannel.cleanDomainConfig(options.domainConfig) || defaultDomainConfig);
    this.requestOptions = options.requestOptions || {};
    this.requestDelayMs = options.requestDelayMs ?? REQUEST_DELAY_MS;
    this.sleep = options.sleep || wait;
    this.reportExists = options.reportExists
      || ((query) => require('../../models/report').exists(query));
    this.now = options.now || (() => new Date());
  }

  async fetch() {
    const windowEndDate = this.now();
    const windowStartDate = new Date(windowEndDate.getTime() - DAY_MS);
    const window = {
      windowStart: windowStartDate.toISOString(),
      windowEnd: windowEndDate.toISOString(),
      alertDate: dayString(windowEndDate),
    };
    const posts = [];
    const problems = [];

    // Each network is checked on its own: one that cannot be checked must not stop the
    // others, and what went wrong is reported once the run is over.
    for (const asn of this.asns) {
      try {
        const { post, unverified } = await this.checkNetwork(asn, window);
        if (unverified.length > 0) {
          problems.push(`AS${asn}: could not check ${unverified.length} domain(s) (${unverified.join(', ')})`);
        }
        if (post) {
          posts.push(post);
          this.enqueue(post);
        }
      } catch (error) {
        problems.push(`AS${asn}: ${error.message}`);
      }
    }

    console.log(`[Fetching-channel-OONI] Checked ${this.asns.length} network(s): ${posts.length} new alert(s), ${problems.length} problem(s).`);
    if (problems.length > 0) throw new Error(`OONI check incomplete. ${problems.join('; ')}`);

    if (typeof this.options?.onFetch === 'function') {
      try {
        await this.options.onFetch(windowEndDate);
      } catch (error) {
        console.warn(`[Fetching-channel-OONI] Could not record the last check time: ${error.message}`);
      }
    }
    return posts;
  }

  // Returns the alert for one network (or null) and the domains that could not be checked.
  async checkNetwork(asn, { windowStart, windowEnd, alertDate }) {
    const domainMode = this.domainConfig.useAllDomains ? 'all' : 'selected';
    const guid = alertGuid(asn, alertDate, domainMode, this.probeCC, this.testName);
    if (await this.reportExists({ guid })) return { post: null, unverified: [] };

    const query = {
      asn,
      since: windowStart,
      until: windowEnd,
      probeCC: this.probeCC,
      testName: this.testName,
      ...this.requestOptions,
    };
    const unverified = [];

    let alerts;
    if (this.domainConfig.useAllDomains) {
      const found = await this.hasMeasurements(query);
      alerts = evaluateRollingAlert(found, windowStart, windowEnd);
    } else {
      const rows = [];
      let failuresInARow = 0;
      for (const domain of this.domainConfig.domains) {
        try {
          rows.push({ domain, hasMeasurements: await this.hasMeasurements({ ...query, domain }) });
          failuresInARow = 0;
        } catch (error) {
          // Not evidence of zero measurements, so it never becomes an alert trigger.
          rows.push({ domain, unknown: true });
          unverified.push(domain);
          failuresInARow += 1;
          if (failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
            throw new Error(`OONI kept failing, stopped after ${failuresInARow} failed checks in a row (last: ${error.message})`);
          }
        }
        if (this.requestDelayMs) await this.sleep(this.requestDelayMs);
      }
      alerts = evaluateRollingDomainAlerts(rows, this.domainConfig.domains, windowStart, windowEnd);
    }
    if (alerts.length === 0) return { post: null, unverified };

    const chart = await this.loadChart(asn, alerts[0].windowEnd);
    const post = this.parse({ asn, alerts, guid, fetchedAt: this.now(), chart, unverified });
    return { post, unverified };
  }

  // The 14 blocks of 24 hours of per-domain counts shown on the alert. Fetched once, here,
  // and stored with the alert so opening it never calls OONI (whose API is rate
  // limited per IP). A failure must not stop the alert from being created - the
  // alert is saved without a chart rather than retried; only new alerts get one,
  // there is no backfill for alerts created before this.
  async loadChart(asn, windowEnd) {
    if (this.domainConfig.useAllDomains) return null;
    try {
      return await this.fetchSeries({
        asn,
        anchor: chartAnchor(windowEnd),
        domains: this.domainConfig.domains,
        probeCC: this.probeCC,
        testName: this.testName,
      });
    } catch (error) {
      console.warn(`OONI chart series unavailable for AS${asn}: ${error.message}`);
      return null;
    }
  }

  parse(rawMessage) {
    const { asn, alerts, guid, fetchedAt, chart, unverified = [] } = rawMessage;
    const alertDate = alerts[0].alertDate;
    const searchParams = new URLSearchParams({
      probe_cc: this.probeCC,
      probe_asn: `AS${asn}`,
      test_name: this.testName,
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
        probeCC: this.probeCC,
        probeASN: asn,
        networkName: NETWORK_NAMES[asn] || null,
        testName: this.testName,
        dataSource: DATA_SOURCES.OONI,
        entityLevel: 'AS',
        alertDate,
        windowStart: alerts[0].windowStart,
        windowEnd: alerts[0].windowEnd,
        domainMode: this.domainConfig.useAllDomains ? 'all' : 'selected',
        domainConfigCapturedAt: fetchedAt,
        configuredDomains: this.domainConfig.useAllDomains ? [] : this.domainConfig.domains,
        unverifiedDomains: unverified,
        zeroDomains: alerts
          .filter((alert) => alert.type === 'zero_domain_measurements')
          .map((alert) => alert.domain),
        triggers: alerts,
        ...(chart
          ? { chart: { ...chart, domains: domainsToStored(chart.domains), fetchedAt: fetchedAt.toISOString() } }
          : {}),
      },
    });

    post.isOutageEvent = true;
    post.isAsnScoped = true;
    post.countryCode = this.probeCC.toUpperCase();
    Object.assign(post, outageFields({ asn, probeCC: this.probeCC, windowEnd: alerts[0].windowEnd }));
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