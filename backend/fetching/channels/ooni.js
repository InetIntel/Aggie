const { PollChannel } = require('downstream');
const Report = require('../../models/report');
const { fetchDailyMeasurements, fetchMeasurements } = require('../ooniApi');
const { normalizeDailyCounts, evaluateAlert } = require('../ooniAlerts');

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_DELAY_HOURS = 6;
const EVIDENCE_LIMIT = 5;
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
  const messages = alerts.map((alert) => {
    if (alert.type === 'zero_measurements') {
      return `no web connectivity measurements were recorded on ${alert.measurementDay}`;
    }
    return `the 2-day measurement average declined ${(alert.declineFraction * 100).toFixed(1)}%`;
  });
  return `OONI volume alert for ${network} (AS${asn}): ${messages.join('; ')}.`;
}

function measurementEvidence(measurement) {
  return {
    input: measurement.input,
    measurementStartTime: measurement.measurement_start_time,
    measurementUid: measurement.measurement_uid,
    measurementUrl: measurement.measurement_url,
    anomaly: measurement.anomaly,
    confirmed: measurement.confirmed,
    failure: measurement.failure,
    blockingType: measurement.scores && measurement.scores.analysis
      ? measurement.scores.analysis.blocking_type
      : null,
    verificationStatus: measurement.verification_status,
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
    this.fetchDailyMeasurements = options.fetchDailyMeasurements || fetchDailyMeasurements;
    this.fetchMeasurements = options.fetchMeasurements || fetchMeasurements;
  }

  async fetchEvidence(asn, alerts) {
    const decline = alerts.find((alert) => alert.type === 'measurement_decline');
    if (!decline) {
      return {
        available: false,
        reason: 'No measurements were available on the zero-measurement day.',
        confirmed: [],
        anomalous: [],
      };
    }

    const query = {
      asn,
      since: decline.recentStart,
      until: decline.alertDate,
    };
    try {
      const [confirmed, anomalous] = await Promise.all([
        this.fetchMeasurements({ ...query, confirmed: true, limit: EVIDENCE_LIMIT }),
        this.fetchMeasurements({
          ...query,
          anomaly: true,
          confirmed: false,
          limit: EVIDENCE_LIMIT,
        }),
      ]);

      return {
        available: true,
        windowStart: decline.recentStart,
        windowEnd: decline.recentEnd,
        confirmed: confirmed.slice(0, EVIDENCE_LIMIT).map(measurementEvidence),
        anomalous: anomalous
          .filter((measurement) => !measurement.confirmed)
          .slice(0, EVIDENCE_LIMIT)
          .map(measurementEvidence),
      };
    } catch (error) {
      return {
        available: false,
        reason: `Related measurements could not be loaded: ${error.message}`,
        confirmed: [],
        anomalous: [],
      };
    }
  }

  async fetch() {
    const alertDate = alertDateFor(new Date());
    const since = dayString(shiftDay(alertDate, -16));
    const until = dayString(alertDate);
    const posts = [];

    for (const asn of this.asns) {
      const rows = await this.fetchDailyMeasurements({ asn, since, until });
      const dailyCounts = normalizeDailyCounts(rows, since, until);
      const alerts = evaluateAlert(dailyCounts, dayString(alertDate));
      if (alerts.length === 0) continue;

      const guid = alertGuid(asn, dayString(alertDate));
      if (await Report.exists({ guid })) continue;

      const evidence = await this.fetchEvidence(asn, alerts);
      const post = this.parse({ asn, alerts, evidence, guid, fetchedAt: new Date() });
      posts.push(post);
      this.enqueue(post);
    }

    return posts;
  }

  parse(rawMessage) {
    const { asn, alerts, evidence, guid, fetchedAt } = rawMessage;
    const alertDate = alerts[0].alertDate;
    const searchParams = new URLSearchParams({
      probe_cc: 'IR',
      probe_asn: `AS${asn}`,
      test_name: 'web_connectivity',
      since: evidence.windowStart || alerts[0].measurementDay,
      until: alertDate,
    });

    return {
      authoredAt: new Date(`${alertDate}T00:00:00.000Z`),
      fetchedAt,
      author: `OONI AS${asn}`,
      content: alertContent(asn, alerts),
      url: `https://explorer.ooni.org/search?${searchParams}`,
      platform: 'OONI',
      platformID: guid,
      raw: {
        probeCC: 'IR',
        probeASN: asn,
        networkName: NETWORK_NAMES[asn] || null,
        testName: 'web_connectivity',
        alertDate,
        triggers: alerts,
        evidence,
      },
    };
  }
}

module.exports = OONIChannel;