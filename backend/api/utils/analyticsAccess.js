'use strict';
// Per-user access projection for analytics read results.
//
// The notable-activity aggregation is materialized into a cache keyed only by time
// window and shared by every user, so it must stay global. Everything user-specific
// therefore happens here, at read time: activities are re-derived from only the
// reports the caller may see, and incident references the caller may not view are
// stripped.

const Report = require('../../models/report');
const Group = require('../../models/group');
const { canViewIncident } = require('../../access/incidentAccess');
const { projectNotableActivityToReports } = require('./analyticsAggregation');
const { combineReportFilters } = require('./reportSourceAccess');

// Fields projectNotableActivityToReports needs to re-derive an activity.
const PROJECTION_FIELDS =
  '_id _media metadata.rawAPIResponse.dataSource asn geoScope _group';

const isAdmin = (user) => Boolean(user) && user.role === 'admin';

// Load the subset of reportIds this user may read, keyed by id.
const loadAccessibleReports = async (reportIds, accessFilter) => {
  if (reportIds.length === 0) return new Map();

  const reports = await Report.find(
    combineReportFilters({ _id: { $in: reportIds } }, accessFilter)
  )
    .select(PROJECTION_FIELDS)
    .lean()
    .exec();

  return new Map(reports.map((report) => [String(report._id), report]));
};

// Null out incidentId on activities whose incident this user cannot view. A user may
// legitimately see a report while being barred from the incident it belongs to.
const redactIncidentIds = async (activities, incidentAccess) => {
  const incidentIds = [...new Set(
    activities.map((activity) => activity.incidentId).filter(Boolean).map(String)
  )];
  if (incidentIds.length === 0) return activities;

  const incidents = await Group.find({ _id: { $in: incidentIds } })
    .select('_id accessPolicy')
    .lean()
    .exec();
  const viewable = new Set(
    incidents
      .filter((incident) =>
        canViewIncident(incidentAccess.user, incident, incidentAccess.ledTeamIds)
      )
      .map((incident) => String(incident._id))
  );

  return activities.map((activity) =>
    activity.incidentId && !viewable.has(String(activity.incidentId))
      ? { ...activity, incidentId: null }
      : activity
  );
};

// Project globally-computed notable activities down to what this user may see.
const filterNotableActivitiesForUser = async (
  activities,
  { user, accessFilter, incidentAccess }
) => {
  const list = Array.isArray(activities) ? activities : [];
  if (list.length === 0) return list;

  // Admins are unrestricted on both reports and incidents, so there is nothing to
  // project or redact.
  if (isAdmin(user)) return list;

  const allReportIds = [...new Set(
    list.flatMap((activity) => activity.reportIds || []).map(String)
  )];
  const accessibleById = await loadAccessibleReports(allReportIds, accessFilter);

  const projected = list
    .map((activity) => {
      const reports = (activity.reportIds || [])
        .map((reportId) => accessibleById.get(String(reportId)))
        .filter(Boolean);
      return projectNotableActivityToReports(activity, reports);
    })
    .filter(Boolean);

  if (!incidentAccess) return projected;
  return redactIncidentIds(projected, incidentAccess);
};

module.exports = {
  filterNotableActivitiesForUser,
};
