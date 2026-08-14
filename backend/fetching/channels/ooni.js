const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { fetchDailyMeasurements } = require('../ooniApi');
const { normalizeDailyCounts, evaluateAlert } = require('../ooniAlerts');

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_DELAY_HOURS = 6;
const NETWORK_NAMES = {
  44244: 'IranCell',
  58224: 'MCCI',
};

function shiftDay(day, offset) {
  return new Date(day.getTime() + offset * DAY_MS);
}

function dayString(day) {
  return day.toISOString().slice(0, 10);
}

function alertDateFor(now) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  if (now.getUTCHours() < ALERT_DELAY_HOURS) return shiftDay(date, -1);
  return date;
}

function alertGuid(asn, alertDate) {
  return `ooni:${asn}:volume:${alertDate}`;
}

function alertContent(asn, alerts) {
  const network = NETWORK_NAMES[asn] || `AS${asn}`;
  return `OONI volume alert for ${network} (AS${asn}): no web connectivity measurements were recorded on ${alerts[0].measurementDay}.`;
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
    this.fetchDailyMeasurements = options.fetchDailyMeasurements || fetchDailyMeasurements;
    this.reportExists = options.reportExists
      || ((query) => require('../../models/report').exists(query));
    this.now = options.now || (() => new Date());
  }

  async fetch() {
    const alertDate = alertDateFor(this.now());
    const since = dayString(shiftDay(alertDate, -1));
    const until = dayString(alertDate);
    const posts = [];

    for (const asn of this.asns) {
      const rows = await this.fetchDailyMeasurements({ asn, since, until });
      const dailyCounts = normalizeDailyCounts(rows, since, until);
      const alerts = evaluateAlert(dailyCounts, dayString(alertDate));
      if (alerts.length === 0) continue;

      const guid = alertGuid(asn, dayString(alertDate));
      if (await this.reportExists({ guid })) continue;

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
      since: alerts[0].measurementDay,
      until: alertDate,
    });

    const post = new SocialMediaPost({
      authoredAt: new Date(`${alertDate}T00:00:00.000Z`),
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