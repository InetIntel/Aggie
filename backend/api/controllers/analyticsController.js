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
} = require('../utils/analyticsTime');
const {
  attachReportsToGroup,
  removeReportsFromGroup,
} = require('../utils/reportGroupActions');

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
