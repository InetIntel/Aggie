'use strict';

const Group = require('../../models/group');
const Report = require('../../models/report');

/**
 * Given a set of reports, compute:
 *   - earliest outageStartedAt/authoredAt (minStart)
 *   - latest outageEndedAt (maxEnd)
 *   - duration in seconds (or null if we don't have a closed interval)
 */
function computeIncidentTimeBoundsFromReports(reports) {
  let minStart = null;
  let maxEnd = null;

  for (const r of reports) {

    if (!r.isOutageEvent) {continue};

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

  let durationSeconds = null;
  if (minStart && maxEnd) {
    durationSeconds = Math.floor((maxEnd.getTime() - minStart.getTime()) / 1000);
    if (durationSeconds < 0) {
      durationSeconds = null;
    }
  }

  return { minStart, maxEnd, durationSeconds };
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
    .select('isOutageEvent outageStartedAt outageEndedAt authoredAt')
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