'use strict';

const { canViewIncident } = require('./incidentAccess');

const getReportList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.reports)) return payload.reports;
  return payload ? [payload] : [];
};

const stripIncidentReferences = (payload, accessibleIncidentIds) => {
  const accessible = new Set([...accessibleIncidentIds].map(String));
  const sanitize = (report) => {
    if (!report || !report._group || accessible.has(String(report._group))) {
      return report;
    }

    const plainReport = typeof report.toObject === 'function'
      ? report.toObject()
      : { ...report };
    delete plainReport._group;
    return plainReport;
  };

  if (Array.isArray(payload)) return payload.map(sanitize);
  if (payload && Array.isArray(payload.results)) {
    return { ...payload, results: payload.results.map(sanitize) };
  }
  if (payload && Array.isArray(payload.reports)) {
    return { ...payload, reports: payload.reports.map(sanitize) };
  }
  return sanitize(payload);
};

const hideRestrictedIncidentReferences = async (user, payload) => {
  if (!user || user.role === 'admin') return payload;

  // Load database-backed models only for the runtime path; the pure stripping
  // helper remains independently testable without opening a database connection.
  const Group = require('../models/group');
  const Team = require('../models/team');

  const incidentIds = [...new Set(
    getReportList(payload)
      .map((report) => report && report._group)
      .filter(Boolean)
      .map(String)
  )];
  if (incidentIds.length === 0) return payload;

  const userId = user._id || user.id;
  const [incidents, ledTeams] = await Promise.all([
    Group.find({ _id: { $in: incidentIds } })
      .select('_id accessPolicy')
      .lean(),
    userId
      ? Team.find({ leads: userId }).select('_id').lean()
      : Promise.resolve([]),
  ]);
  const ledTeamIds = ledTeams.map((team) => String(team._id));
  const accessibleIncidentIds = incidents
    .filter((incident) => canViewIncident(user, incident, ledTeamIds))
    .map((incident) => String(incident._id));

  return stripIncidentReferences(payload, accessibleIncidentIds);
};

module.exports = {
  hideRestrictedIncidentReferences,
  stripIncidentReferences,
};
