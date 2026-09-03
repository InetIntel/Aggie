// Maintains a list of queries to be monitored. Runs the queries periodically and emits results.
// Stops running queries if no new reports arriving. Resumes when report flow resumes.
// Watches for changes to report status and group. Streams them as they occur.
'use strict'
const _ = require('lodash');
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const Report = require('../models/report');
const { getMaterializedNotableActivities } = require('./utils/analyticsMaterialization');

const QUERY_INTERVAL = 1000; // 1s
const ANALYTICS_QUERY_INTERVAL = 60000; // 60s

let Streamer = function () {
  this.queries = [];
  this.analyticsQueries = {};
  this.status = 'idle';
  this.throttledQuery = _.throttle(this.query, QUERY_INTERVAL);
  this.throttledRefreshAnalytics = _.throttle(
    this.refreshDirtyAnalyticsQueries.bind(this),
    ANALYTICS_QUERY_INTERVAL
  );

  this.bindings = {
    report: this._addReportListeners,
    group: this._addGroupListeners
  };
};

util.inherits(Streamer, EventEmitter);

Streamer.prototype.addListeners = function (type, emitter) {
  this.bindings[type] && this.bindings[type].call(this, emitter);
};

// Track query, avoid duplicates
Streamer.prototype.addQuery = function (query) {
  const found = _.find(this.queries, query);
  if (!found) this.queries.push(query);
};

// Remove query from list
Streamer.prototype.removeQuery = function (query) {
  this.queries = _.without(this.queries, query);
};

Streamer.prototype.addAnalyticsQuery = function (query, clientId) {
  if (!query || !query.cacheKey) return;

  const existing = this.analyticsQueries[query.cacheKey];
  if (existing) {
    existing.clients = _.union(existing.clients, [clientId]);
    existing.query = normalizeAnalyticsQuery(query);
    return;
  }

  this.analyticsQueries[query.cacheKey] = {
    query: normalizeAnalyticsQuery(query),
    clients: [clientId],
    dirty: false,
    refreshing: false,
  };
};

Streamer.prototype.removeAnalyticsQuery = function (cacheKey, clientId) {
  if (!cacheKey || !this.analyticsQueries[cacheKey]) return;

  const analyticsQuery = this.analyticsQueries[cacheKey];
  analyticsQuery.clients = _.without(analyticsQuery.clients, clientId);

  if (!analyticsQuery.clients.length) {
    delete this.analyticsQueries[cacheKey];
  }
};

Streamer.prototype.markAnalyticsQueryDirty = function (cacheKey) {
  const analyticsQuery = this.analyticsQueries[cacheKey];
  if (!analyticsQuery) return;
  analyticsQuery.dirty = true;
  this.throttledRefreshAnalytics();
};

Streamer.prototype.markAllAnalyticsQueriesDirty = function () {
  _.forEach(this.analyticsQueries, function (analyticsQuery) {
    analyticsQuery.dirty = true;
  });
  this.throttledRefreshAnalytics();
};

Streamer.prototype.refreshDirtyAnalyticsQueries = function () {
  var self = this;
  _.forEach(this.analyticsQueries, function (entry, cacheKey) {
    if (!entry.dirty || entry.refreshing) return;

    entry.dirty = false;
    entry.refreshing = true;

    getMaterializedNotableActivities({
      ...entry.query,
      timeWindow: entry.query.timeWindow,
      cacheKey,
      forceRefresh: true,
    })
      .then((data) => {
        self.emit('analytics:update', {
          cacheKey,
          rangePreset: data.rangePreset,
          bucketPreset: data.bucketPreset,
          computedAt: data.computedAt,
        });
      })
      .catch((err) => self.emit('error', err))
      .finally(() => {
        const latest = self.analyticsQueries[cacheKey];
        if (!latest) return;
        latest.refreshing = false;
        if (latest.dirty) self.throttledRefreshAnalytics();
      });
  });
};

// Run all queries and emit the results
Streamer.prototype.query = function () {
  let remaining = this.queries.length;
  if (!remaining) {
    this.status = 'idle';
    return;
  }
  var allEmpty = true;
  this.status = 'querying';
  var self = this;
  this.queries.forEach(function (query) {
    // Query database
    query.run(function (err, results) {
      if (err) self.emit('error', err);
      if (results.total) {
        allEmpty = false;
        self.emit(query.event, query, results.results);
      }
      if (--remaining === 0) {
        // If no new reports were saved while querying, mark as idle
        if (allEmpty && self.status === 'querying') self.status = 'idle';
        // If not idle, queue next query batch
        if (self.status !== 'idle') {
          var throttledQuery = self.throttledQuery()

          // FIXME the throttledQuery variable is sometimes undefined
          // this if statement is a temporary fix so Aggie can run
          if (typeof throttledQuery !== 'undefined') {
            setTimeout(throttledQuery, QUERY_INTERVAL);
          }
        }
      }
    });
  });
};

// Resume query if receiving new data
Streamer.prototype.resumeQuery = function () {
  const wasIdle = this.status === 'idle';
  // Override current status to make sure queries get re-run
  this.status = 'pending';
  // Start querying if idle
  if (wasIdle) this.throttledQuery();
};

Streamer.prototype._addGroupListeners = function (emitter) {
  let self = this;

  // Listens to new groups being written to the database
  emitter.on('group:save', function (group) {
    self.resumeQuery();
    self.markAllAnalyticsQueriesDirty();
  });
};

Streamer.prototype._addReportListeners = function (emitter) {
  let self = this;

  // Clean-up old listeners
  emitter.removeAllListeners('report:new');

  // Listens to new reports being written to the database
  emitter.on('report:new', function (report) {
    self.resumeQuery();
    self.handleAnalyticsReportNew(report);
  });
};

Streamer.prototype.handleAnalyticsReportNew = function (reportRef) {
  const reportId = reportRef && reportRef._id;
  if (!reportId || !Object.keys(this.analyticsQueries).length) return;

  Report.findById(reportId)
    .select('isOutageEvent outageStartedAt eventAggKeyBase')
    .lean()
    .exec((err, report) => {
      if (err) {
        this.emit('error', err);
        return;
      }

      if (
        !report ||
        !report.isOutageEvent ||
        !report.outageStartedAt ||
        !report.eventAggKeyBase
      ) {
        return;
      }

      const outageTime = new Date(report.outageStartedAt).getTime();
      if (Number.isNaN(outageTime)) return;

      _.forEach(this.analyticsQueries, (entry, cacheKey) => {
        const rangeStart = new Date(entry.query.timeWindow.rangeStartUtc).getTime();
        const rangeEnd = new Date(entry.query.timeWindow.rangeEndUtc).getTime();

        if (outageTime >= rangeStart && outageTime < rangeEnd) {
          this.markAnalyticsQueryDirty(cacheKey);
        }
      });
    });
};

function normalizeAnalyticsQuery(query) {
  return {
    cacheKey: query.cacheKey,
    range: query.rangePreset || query.range,
    bucket: query.bucketPreset || query.bucket,
    timeWindow: {
      rangePreset: query.rangePreset || query.range,
      bucketPreset: query.bucketPreset || query.bucket,
      bucketSizeMinutes: query.bucketSizeMinutes,
      rangeStartUtc: new Date(query.rangeStartUtc),
      rangeEndUtc: new Date(query.rangeEndUtc),
    },
  };
}

module.exports = new Streamer();
