'use strict';

const Group = require('../../models/group');
const Report = require('../../models/report');

/**
 * Given a set of reports, compute:
 *   - earliest outageStartedAt/authoredAt (minStart)
 *   - latest outageEndedAt (maxEnd), or null if any member outage is still running
 *   - duration in seconds (or null if we don't have a closed interval)
 */
function computeIncidentTimeBoundsFromReports(reports) {
  let minStart = null;
  let maxEnd = null;
  let isOngoing = false;

  for (const r of reports) {

    if (!r.isOutageEvent) {continue};

    if (r.isOutageOngoing) {
      isOngoing = true;
    }

    const start = r.outageStartedAt || r.authoredAt || null;
    if (start instanceof Date && !Number.isNaN(start.getTime())) {
      if (!minStart || start < minStart) {
        minStart = start;
      }
    }

    const end = r.outageEndedAt;
    if (end instanceof Date && !Number.isNaN(end.getTime())) {
      if (!maxEnd || end > maxEnd) {
        maxEnd = end;
      }
    }
  }

  // The incident has not ended while any of its outages is still running, even if
  // its other reports have closed ends.
  if (isOngoing) {
    return { minStart, maxEnd: null, durationSeconds: null, isOngoing };
  }

  let durationSeconds = null;
  if (minStart && maxEnd) {
    durationSeconds = Math.floor((maxEnd.getTime() - minStart.getTime()) / 1000);
    if (durationSeconds < 0) {
      durationSeconds = null;
    }
  }

  return { minStart, maxEnd, durationSeconds, isOngoing };
}

/**
 * Recompute incidentStartedAt, incidentEndedAt, and incidentDurationSeconds
 * for a single group, based on its member reports.
 */
async function recomputeIncidentDurationForGroup(groupId) {
  if (!groupId) return;

  const group = await Group.findById(groupId);
  if (!group) return;

  if (!Array.isArray(group._reports) || group._reports.length === 0) {
    group.incidentStartedAt = null;
    group.incidentEndedAt = null;
    group.incidentDurationSeconds = null;
    await group.save();
    return;
  }

  const reports = await Report.find({ _id: { $in: group._reports } })
    .select('isOutageEvent isOutageOngoing outageStartedAt outageEndedAt authoredAt')
    .lean()
    .exec();

  const { minStart, maxEnd, durationSeconds } =
    computeIncidentTimeBoundsFromReports(reports);

  group.incidentStartedAt = minStart || null;
  group.incidentEndedAt = maxEnd || null;
  group.incidentDurationSeconds = durationSeconds;

  await group.save();
}

/**
 * Batch recompute fields for multiple groups 
 */
async function recomputeIncidentDurationForGroups(groupIds) {
  if (!groupIds || !groupIds.length) return;
  const uniqueIds = [...new Set(groupIds.map((id) => id.toString()))];

  for (const gid of uniqueIds) {
    try {
      await recomputeIncidentDurationForGroup(gid);
    } catch (err) {
      console.warn('[incidentDuration] Failed to recompute duration for group', gid, err);
    }
  }
}

module.exports = {
  computeIncidentTimeBoundsFromReports,
  recomputeIncidentDurationForGroup,
  recomputeIncidentDurationForGroups,
};