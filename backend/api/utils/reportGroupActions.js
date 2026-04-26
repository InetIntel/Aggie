'use strict';

const Report = require('../../models/report');
const Group = require('../../models/group');
const NotableActivity = require('../../models/notableActivity');
const eventRouter = require('../sockets/event-router');
const { recomputeIncidentDurationForGroups } = require('./incidentDuration');

async function attachReportsToGroup(reportIds, groupId, options = {}) {
  const ids = normalizeIds(reportIds);
  const targetGroupId = normalizeId(groupId, 'groupId');
  const markRead = options.markRead !== false;

  if (!ids.length) return null;

  const reports = await Report.find({ _id: { $in: ids } });
  if (!reports.length) return null;

  const prevGroupIds = getPreviousGroupIds(reports, targetGroupId);

  if (prevGroupIds.length) {
    const prevGroups = await Group.find({ _id: { $in: prevGroupIds } });

    for (const prevGroup of prevGroups) {
      if (!Array.isArray(prevGroup._reports) || !prevGroup._reports.length) continue;

      prevGroup._reports = prevGroup._reports.filter(
        (id) => !ids.some((reportId) => id.equals(reportId))
      );
      await prevGroup.save();
    }
  }

  const group = await Group.findById(targetGroupId);
  if (!group) {
    throw withStatus(new Error('Group not found'), 404);
  }

  normalizeGroupReportState(group);

  const reportIdSet = new Set(group._reports.map((id) => id.toString()));

  for (const report of reports) {
    report._group = targetGroupId;
    if (markRead) report.read = true;
    await report.save();

    const reportId = report._id.toString();
    if (!reportIdSet.has(reportId)) {
      group._reports.push(report._id);
      reportIdSet.add(reportId);
    }

    addImpactedFromReportToGroup(group, report);
  }

  await group.save();

  const groupIdsToRecompute = new Set([...prevGroupIds, targetGroupId]);
  if (groupIdsToRecompute.size > 0) {
    await recomputeIncidentDurationForGroups([...groupIdsToRecompute]);
  }

  const updatedGroup = await publishUpdatedGroup(targetGroupId);

  await eventRouter.publish('reports:update', {
    ids,
    update: { _group: targetGroupId, ...(markRead ? { read: true } : {}) },
  });

  await syncNotableActivityIncidentContext(ids);

  return updatedGroup;
}

async function removeReportsFromGroup(reportIds, groupId) {
  const ids = normalizeIds(reportIds);
  const targetGroupId = normalizeId(groupId, 'groupId');

  if (!ids.length) return null;

  const reports = await Report.find({ _id: { $in: ids } });
  if (!reports.length) return null;

  for (const report of reports) {
    report._group = undefined;
    await report.save();
  }

  const group = await Group.findById(targetGroupId);
  if (!group) {
    throw withStatus(new Error('Group not found'), 404);
  }

  normalizeGroupReportState(group);

  const idsSet = new Set(ids.map((id) => id.toString()));
  group._reports = group._reports.filter((rid) => !idsSet.has(rid.toString()));

  await group.save();
  await recomputeIncidentDurationForGroups([targetGroupId]);

  const updatedGroup = await publishUpdatedGroup(targetGroupId);

  await eventRouter.publish('reports:update', {
    ids,
    update: { _group: null },
  });

  await syncNotableActivityIncidentContext(ids);

  return updatedGroup;
}

async function clearGroupFromReports(reportIds) {
  const ids = normalizeIds(reportIds);
  if (!ids.length) return [];

  const reports = await Report.find({ _id: { $in: ids } });
  if (!reports.length) return [];

  for (const report of reports) {
    report._group = undefined;
    await report.save();
  }

  await eventRouter.publish('reports:update', {
    ids,
    update: { _group: null },
  });

  await syncNotableActivityIncidentContext(ids);

  return ids;
}

function addImpactedFromReportToGroup(group, report) {
  if (!report.isOutageEvent) return;

  normalizeGroupReportState(group);

  if (report.isAsnScoped && typeof report.asn === 'string' && report.asn.length > 0) {
    if (!group.impactedAsns.includes(report.asn)) {
      group.impactedAsns.push(report.asn);
    }
  }

  if (typeof report.geoScope === 'string' && report.geoScope.length > 0) {
    if (!group.impactedGeoScopes.includes(report.geoScope)) {
      group.impactedGeoScopes.push(report.geoScope);
    }
  }
}

function normalizeIds(ids) {
  return Array.isArray(ids) ? ids.map((id) => id.toString()) : [];
}

function getPreviousGroupIds(reports, targetGroupId) {
  return [
    ...new Set(
      reports
        .filter(function (report) {
          return report._group && report._group.toString() !== targetGroupId;
        })
        .map(function (report) {
          return report._group.toString();
        })
    ),
  ];
}

function normalizeId(value, fieldName) {
  if (!value) {
    throw withStatus(new Error(`${fieldName} is required`), 400);
  }
  return value.toString();
}

function normalizeGroupReportState(group) {
  if (!Array.isArray(group._reports)) group._reports = [];
  if (!Array.isArray(group.impactedAsns)) group.impactedAsns = [];
  if (!Array.isArray(group.impactedGeoScopes)) group.impactedGeoScopes = [];
}

async function publishUpdatedGroup(groupId) {
  const updatedGroup = await Group.findById(groupId)
    .select(
      '_id _reports impactedAsns impactedGeoScopes incidentStartedAt incidentEndedAt incidentDurationSeconds'
    )
    .lean()
    .exec();

  if (!updatedGroup) return null;

  await eventRouter.publish('groups:update', {
    ids: [updatedGroup._id],
    update: {
      _reports: updatedGroup._reports,
      impactedAsns: updatedGroup.impactedAsns || [],
      impactedGeoScopes: updatedGroup.impactedGeoScopes || [],
      incidentStartedAt: updatedGroup.incidentStartedAt || null,
      incidentEndedAt: updatedGroup.incidentEndedAt || null,
      incidentDurationSeconds:
        typeof updatedGroup.incidentDurationSeconds === 'number'
          ? updatedGroup.incidentDurationSeconds
          : null,
    },
  });

  return updatedGroup;
}

async function syncNotableActivityIncidentContext(reportIds) {
  const ids = normalizeIds(reportIds);
  if (!ids.length) return;

  const notableActivities = await NotableActivity.find({
    reportIds: { $in: ids },
  }).exec();

  if (!notableActivities.length) return;

  for (const notableActivity of notableActivities) {
    const reports = await Report.find({ _id: { $in: notableActivity.reportIds } })
      .select('_group')
      .lean()
      .exec();

    const hasUnassigned = reports.some((report) => !report._group);
    const groupIds = [
      ...new Set(
        reports
          .map((report) => (report._group ? report._group.toString() : null))
          .filter(Boolean)
      ),
    ];

    const incidentId = !hasUnassigned && groupIds.length === 1 ? groupIds[0] : null;
    const currentIncidentId = notableActivity.incidentId
      ? notableActivity.incidentId.toString()
      : null;

    if (currentIncidentId !== incidentId) {
      notableActivity.incidentId = incidentId;
      await notableActivity.save();
    }
  }
}

function withStatus(err, status) {
  err.status = status;
  return err;
}

module.exports = {
  attachReportsToGroup,
  clearGroupFromReports,
  removeReportsFromGroup,
};
