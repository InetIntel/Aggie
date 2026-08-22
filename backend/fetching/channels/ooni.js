const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { hasMeasurements } = require('../ooniApi');
const {
  normalizeDomainConfig,
  evaluateRollingAlert,
  evaluateRollingDomainAlerts,
} = require('../ooniAlerts');
const defaultDomainConfig = require('../config/ooni.json');

const DAY_MS = 24 * 60 * 60 * 1000;
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
  const windowEnd = alerts[0].windowEnd;
  if (alerts[0].type === 'zero_domain_measurements') {
    const domains = alerts.map((alert) => alert.domain);
    const preview = domains.slice(0, 5).join(', ');
    const remainder = domains.length > 5 ? ` and ${domains.length - 5} more` : '';
    return `OONI domain alert for ${network} (AS${asn}): no measurements were recorded for ${domains.length} watched domain(s) in the 24 hours ending ${windowEnd}: ${preview}${remainder}.`;
  }
  return `OONI volume alert for ${network} (AS${asn}): no web connectivity measurements were recorded in the 24 hours ending ${windowEnd}.`;
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

      const post = this.parse({ asn, alerts, guid, fetchedAt: this.now() });
      posts.push(post);
      this.enqueue(post);
    }

    return posts;
  }

  parse(rawMessage) {
    const { asn, alerts, guid, fetchedAt } = rawMessage;
    const alertDate = alerts[0].alertDate;
    const searchParams = new URLSearchParams({
      probe_cc: 'IR',
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
        probeCC: 'IR',
        probeASN: asn,
        networkName: NETWORK_NAMES[asn] || null,
        testName: 'web_connectivity',
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
      },
    });

    post.isOutageEvent = true;
    post.isAsnScoped = true;
    post.asn = `as${asn}`;
    return post;
  }
}

module.exports = OONIChannel;