'use strict';

const Group = require('../../models/group');
const NotableActivity = require('../../models/notableActivity');
const eventRouter = require('../sockets/event-router');
const {
  getMaterializedNotableActivities,
} = require('../utils/analyticsMaterialization');
const {
  getBucketEndUtc,
  getBucketStartUtc,
  resolveAnalyticsTimeWindow,
  VALID_BUCKETS_BY_RANGE,
  DEFAULT_RANGE_PRESET,
} = require('../utils/analyticsTime');
const {
  attachReportsToGroup,
  removeReportsFromGroup,
} = require('../utils/reportGroupActions');
const { countReports } = require('../utils/reportCounts');

// All entity levels — matches the frontend's ENTITY_LEVEL_OPTIONS (src/api/common.ts).
// Alert metric counts carry these so their filter/dedup matches the deduped alerts list.
const ENTITY_LEVEL_OPTIONS = ['Region', 'AS - Region', 'AS - Country', 'AS'];

// Single source of truth for the six triage rows, expressed as the deep-link URL params
// a monitor lands on. `status`/`groupId`/`irrelevant` mirror the reports list filters.
const METRIC_ROWS = [
  { key: 'read', label: 'Read', params: { status: 'Read', irrelevant: 'all' } },
  { key: 'unread', label: 'Unread', params: { status: 'Unread', irrelevant: 'all' } },
  { key: 'linked', label: 'Linked to incident', params: { groupId: 'any', irrelevant: 'all' } },
  { key: 'unlinked', label: 'Unlinked to incident', params: { groupId: 'none', irrelevant: 'all' } },
  { key: 'investigate-linked', label: 'Investigate — linked', params: { groupId: 'any', irrelevant: 'false' } },
  { key: 'investigate-unlinked', label: 'Investigate — unlinked', params: { groupId: 'none', irrelevant: 'false' } },
];

const METRIC_CATEGORIES = [
  { key: 'alerts', label: 'Alerts', isOutageEvent: true },
  { key: 'social', label: 'Social Media', isOutageEvent: false },
];

exports.analytics_notable_activities = async (req, res) => {
  try {
    const data = await getMaterializedNotableActivities(
      parseAnalyticsQuery(req.query, { allowLimit: true })
    );
    return res.status(200).send(data);
  } catch (err) {
    return handleAnalyticsError(res, err, 'Error fetching notable activities');
  }
};

exports.analytics_overview = async (req, res) => {
  try {
    const data = await getMaterializedNotableActivities(parseAnalyticsQuery(req.query));
    return res.status(200).send({
      cacheKey: data.cacheKey,
      cacheStatus: data.cacheStatus,
      computedAt: data.computedAt,
      expiresAt: data.expiresAt,
      rangePreset: data.rangePreset,
      bucketPreset: data.bucketPreset,
      bucketSizeMinutes: data.bucketSizeMinutes,
      rangeStartUtc: data.rangeStartUtc,
      rangeEndUtc: data.rangeEndUtc,
      metrics: {
        notableActivityCount: data.notableActivities.length,
        highConfidenceActivityCount: data.highConfidenceActivities.length,
        totalReports: sumReports(data.notableActivities),
      },
      timeSeries: buildActivityTimeSeries(data),
    });
  } catch (err) {
    return handleAnalyticsError(res, err, 'Error fetching analytics overview');
  }
};

exports.analytics_report_metrics = async (req, res) => {
  try {
    // Metrics only need the range bounds, not a bucket. Pick any bucket valid for the
    // range so resolveAnalyticsTimeWindow's range/bucket validation passes (its default
    // '1h' is invalid for last7d). An unknown range still throws a 400 below.
    const range = req.query.range || DEFAULT_RANGE_PRESET;
    const bucket = (VALID_BUCKETS_BY_RANGE[range] || [])[0];
    const timeWindow = resolveAnalyticsTimeWindow({ range, bucket });
    const after = timeWindow.rangeStartUtc.toISOString();
    const before = timeWindow.rangeEndUtc.toISOString();

    const categories = await Promise.all(
      METRIC_CATEGORIES.map(async (category) => {
        const metrics = await Promise.all(
          METRIC_ROWS.map(async (row) => {
            // Alerts are outage events: range-filter by outageStartedAt (outageAfter/
            // outageBefore). Social posts filter by authoredAt (after/before). Both the
            // deep-link and the count use the same bounds so parity holds.
            const rangeParams =
              category.key === 'alerts'
                ? { outageAfter: after, outageBefore: before }
                : { after, before };

            // Deep-link params the frontend serializes into the destination list URL.
            const query = { ...row.params, ...rangeParams };

            // Query the count runs. Alerts mirror the list's forced entityLevel + dedup
            // so the metric equals the deduped alerts list's "Showing X of N".
            const queryData = {
              ...row.params,
              ...rangeParams,
              isOutageEvent: category.isOutageEvent,
            };
            let hideDuplicateASNs;
            if (category.key === 'alerts') {
              queryData.entityLevel = ENTITY_LEVEL_OPTIONS;
              hideDuplicateASNs = 'true';
            }

            const count = await countReports(queryData, { hideDuplicateASNs });
            return { key: row.key, label: row.label, count, query };
          })
        );
        return { key: category.key, label: category.label, metrics };
      })
    );

    return res.status(200).send({
      rangePreset: timeWindow.rangePreset,
      rangeStartUtc: timeWindow.rangeStartUtc,
      rangeEndUtc: timeWindow.rangeEndUtc,
      categories,
    });
  } catch (err) {
    return handleAnalyticsError(res, err, 'Error fetching report metrics');
  }
};

exports.analytics_create_incident = async (req, res) => {
  try {
    const notableActivity = await getNotableActivityFromBody(req.body);
    const groupPayload = req.body.group || req.body.incident;

    if (!groupPayload || typeof groupPayload !== 'object') {
      return res.status(400).send('group payload is required');
    }

    const group = await Group.create({
      ...groupPayload,
      creator: req.user,
    });

    await eventRouter.publish('groups:create', group);
    await attachReportsToGroup(notableActivity.reportIds, group._id, { markRead: true });
    await updateSnapshotIncident(notableActivity, group._id);

    return res.status(200).send(group);
  } catch (err) {
    return handleAnalyticsError(res, err, 'Error creating incident from notable activity');
  }
};

exports.analytics_update_incident = async (req, res) => {
  try {
    const notableActivity = await getNotableActivityFromBody(req.body);
    const mode = req.body.mode;
    const groupId = req.body.groupId || notableActivity.incidentId;

    if (mode !== 'add' && mode !== 'remove') {
      return res.status(400).send('mode must be "add" or "remove"');
    }

    if (!groupId) {
      return res.status(400).send('groupId is required');
    }

    if (mode === 'add') {
      const updatedGroup = await attachReportsToGroup(notableActivity.reportIds, groupId, {
        markRead: true,
      });
      await updateSnapshotIncident(notableActivity, groupId);
      return res.status(200).send(updatedGroup || { _id: groupId });
    }

    const updatedGroup = await removeReportsFromGroup(notableActivity.reportIds, groupId);
    await updateSnapshotIncident(notableActivity, null);
    return res.status(200).send(updatedGroup || { _id: groupId });
  } catch (err) {
    return handleAnalyticsError(res, err, 'Error updating incident from notable activity');
  }
};

function parseAnalyticsQuery(query = {}, parseOptions = {}) {
  const analyticsOptions = {
    range: query.range,
    bucket: query.bucket,
  };

  if (parseOptions.allowLimit && query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 0) {
      throw Object.assign(new Error('limit must be a non-negative integer'), {
        status: 400,
      });
    }
    analyticsOptions.limit = limit;
  }

  return analyticsOptions;
}

async function getNotableActivityFromBody(body = {}) {
  if (!body.cacheKey || !body.eventAggKey) {
    throw Object.assign(new Error('cacheKey and eventAggKey are required'), {
      status: 400,
    });
  }

  const notableActivity = await NotableActivity.findOne({
    cacheKey: body.cacheKey,
    eventAggKey: body.eventAggKey,
  }).exec();

  if (!notableActivity) {
    throw Object.assign(new Error('Notable activity snapshot not found'), {
      status: 404,
    });
  }

  return notableActivity;
}

async function updateSnapshotIncident(notableActivity, incidentId) {
  notableActivity.incidentId = incidentId || null;
  await notableActivity.save();
}

function buildActivityTimeSeries(data) {
  const notableActivities = data.notableActivities || [];
  const buckets = new Map();
  let cursor = getBucketStartUtc(data.rangeStartUtc, data.bucketSizeMinutes);
  const rangeEnd = new Date(data.rangeEndUtc);

  while (cursor < rangeEnd) {
    const bucketStart = cursor;
    const bucketEnd = getBucketEndUtc(bucketStart, data.bucketSizeMinutes);
    buckets.set(bucketStart.toISOString(), {
      bucketStart,
      bucketEnd,
      totalReports: 0,
      notableActivityCount: 0,
      highConfidenceActivityCount: 0,
    });
    cursor = bucketEnd;
  }

  for (const activity of notableActivities) {
    const bucketKey = new Date(activity.bucketStart).toISOString();
    const current = buckets.get(bucketKey) || {
      bucketStart: activity.bucketStart,
      bucketEnd: activity.bucketEnd,
      totalReports: 0,
      notableActivityCount: 0,
      highConfidenceActivityCount: 0,
    };

    current.totalReports += activity.totalReports || 0;
    current.notableActivityCount += 1;
    if (activity.isHighConfidence) current.highConfidenceActivityCount += 1;
    buckets.set(bucketKey, current);
  }

  return [...buckets.values()].sort(
    (a, b) => new Date(a.bucketStart).getTime() - new Date(b.bucketStart).getTime()
  );
}

function sumReports(notableActivities) {
  return notableActivities.reduce(
    (total, activity) => total + (activity.totalReports || 0),
    0
  );
}

function handleAnalyticsError(res, err, fallbackMessage) {
  const status = err.status || (isValidationError(err) ? 400 : 500);
  if (status >= 500) {
    console.error(fallbackMessage, err);
  }
  return res.status(status).send(err.message || fallbackMessage);
}

function isValidationError(err) {
  return Boolean(
    err &&
    typeof err.message === 'string' &&
    err.message.startsWith('Unsupported analytics')
  );
}
