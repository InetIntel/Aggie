'use strict';

const database = require('../../database');
const Group = require('../../models/group');
const Report = require('../../models/report');
const Team = require('../../models/team');
const {
  buildIncidentAccessFilter,
  canSetIncidentPolicy,
  canViewIncident,
  getAccessibleTeamIds,
  normalizeIds,
} = require('../../access/incidentAccess');
const {
  getMembershipTeamIds,
  getTeamIdsWithPermission,
} = require('../../access/teamMemberships');

const mongoose = database.mongoose;

const getRequestedIds = (value) => {
  if (!value) return [];
  return [...new Set(normalizeIds(Array.isArray(value) ? value : [value]))];
};

const hasScopedIncidentPermission = (req, incident) => {
  if (!req.permissionScope) return true;

  const scopedTeamIds = new Set(normalizeIds(req.permissionScope.teamIds));
  const policyTeams = normalizeIds(
    incident && incident.accessPolicy && incident.accessPolicy.teams
  );

  if (!incident || !incident.accessPolicy || incident.accessPolicy.mode === 'public') {
    return req.permissionScope.allowUnscoped === true;
  }

  return incident &&
    incident.accessPolicy &&
    incident.accessPolicy.mode === 'restricted' &&
    policyTeams.some((teamId) => scopedTeamIds.has(teamId));
};

const loadIncidentAccessContext = async (req, res, next) => {
  if (req.incidentAccess) return next();

  const user = req.accessUser || req.user;
  if (!user) return res.status(401).send('Authentication required.');

  try {
    let ledTeamIds = [];
    let policyTeamIds = [];
    if (user.role !== 'admin' && (user._id || user.id)) {
      const ledTeams = await Team.find({ leads: user._id || user.id })
        .select('_id permissionLimits')
        .lean()
        .exec();
      ledTeamIds = ledTeams.map((team) => String(team._id));
      const candidateTeamIds = [...new Set([
        ...getMembershipTeamIds(user),
        ...ledTeamIds,
      ])];
      const teams = await Team.find({ _id: { $in: candidateTeamIds } })
        .select('_id permissionLimits')
        .lean();
      const teamSettings = new Map(
        teams.map((team) => [String(team._id), team])
      );
      policyTeamIds = getTeamIdsWithPermission(
        user,
        'manage incident access',
        ledTeamIds,
        teamSettings
      );
    }

    req.incidentAccess = {
      user,
      ledTeamIds,
      policyTeamIds,
      accessibleTeamIds: getAccessibleTeamIds(user, ledTeamIds),
      filter: buildIncidentAccessFilter(user, ledTeamIds),
    };
    return next();
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to determine incident access.');
  }
};

const requireIncidentParamAccess = async (req, res, next) => {
  if (req.params._id === '_all') return next();

  try {
    const incident = await Group.findById(req.params._id);
    if (!incident) return res.sendStatus(404);

    if (!canViewIncident(
      req.incidentAccess.user,
      incident,
      req.incidentAccess.ledTeamIds
    )) {
      return res.sendStatus(404);
    }

    if (!hasScopedIncidentPermission(req, incident)) {
      return res.status(403).send('Your team role cannot modify this incident.');
    }

    req.incident = incident;
    return next();
  } catch (err) {
    if (err && err.name === 'CastError') return res.sendStatus(404);
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to check incident access.');
  }
};

const requireIncidentBodyAccess = async (req, res, next) => {
  const ids = getRequestedIds(req.body && req.body.ids);
  if (ids.length === 0) return next();
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).send('Invalid incident identifier.');
  }

  try {
    const incidents = await Group.find({ _id: { $in: ids } });
    const allAccessible = incidents.length === ids.length && incidents.every((incident) =>
      canViewIncident(
        req.incidentAccess.user,
        incident,
        req.incidentAccess.ledTeamIds
      )
    );

    if (!allAccessible) {
      return res.status(403).send('Unauthorized to access one or more incidents.');
    }

    if (incidents.some((incident) => !hasScopedIncidentPermission(req, incident))) {
      return res.status(403).send('Your team role cannot modify one or more incidents.');
    }

    req.body.ids = ids;
    req.incidents = incidents;
    return next();
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to check incident access.');
  }
};

const requireIncidentQueryAccess = async (req, res, next) => {
  const incidentId = req.query && req.query.groupId;
  if (!incidentId) return next();
  if (!mongoose.Types.ObjectId.isValid(incidentId)) {
    return res.status(400).send('Invalid incident identifier.');
  }

  const checkAccess = async () => {
    try {
      const incident = await Group.findById(incidentId);
      if (!incident) return res.sendStatus(404);
      if (!canViewIncident(
        req.incidentAccess.user,
        incident,
        req.incidentAccess.ledTeamIds
      )) {
        return res.sendStatus(404);
      }

      req.incident = incident;
      return next();
    } catch (err) {
      return res
        .status(err.status || 500)
        .send(err.message || 'Unable to check incident access.');
    }
  };

  if (req.incidentAccess) return checkAccess();
  return loadIncidentAccessContext(req, res, checkAccess);
};

const normalizeRequestedPolicy = (policy) => {
  if (!policy || typeof policy !== 'object') return null;
  if (!['public', 'restricted'].includes(policy.mode)) return null;

  const teams = policy.mode === 'restricted'
    ? getRequestedIds(policy.teams)
    : [];

  if (policy.mode === 'restricted' && teams.length === 0) return null;
  if (teams.some((id) => !mongoose.Types.ObjectId.isValid(id))) return null;

  return { mode: policy.mode, teams };
};

const requireIncidentPolicyAccess = async (req, res, next) => {
  if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, 'accessPolicy')) {
    if (
      req.permissionScope &&
      !req.permissionScope.allowUnscoped &&
      !req.incident
    ) {
      return res.status(403).send(
        'A team-scoped incident must be restricted to a team you can monitor.'
      );
    }
    return next();
  }

  const policy = normalizeRequestedPolicy(req.body.accessPolicy);
  if (!policy) {
    return res.status(400).send(
      'Incident access must be public or restricted to at least one valid team.'
    );
  }

  const { user, policyTeamIds } = req.incidentAccess;
  if (!canSetIncidentPolicy(user, policy, policyTeamIds, req.incident || null)) {
    return res.status(403).send('Unauthorized to set this incident access policy.');
  }

  if (req.permissionScope) {
    const scopedTeamIds = new Set(normalizeIds(req.permissionScope.teamIds));
    if (
      (policy.mode === 'public' && !req.permissionScope.allowUnscoped) ||
      (
        policy.mode === 'restricted' &&
        !policy.teams.every((teamId) => scopedTeamIds.has(teamId))
      )
    ) {
      return res.status(403).send(
        'A team-scoped incident must remain within teams you can monitor.'
      );
    }
  }

  try {
    if (policy.mode === 'restricted') {
      const activeTeamCount = await Team.countDocuments({
        _id: { $in: policy.teams },
        active: true,
      }).exec();

      if (activeTeamCount !== policy.teams.length) {
        return res.status(400).send('Incident access contains an unavailable team.');
      }
    }

    req.body.accessPolicy = policy;
    return next();
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to validate incident access policy.');
  }
};

const requireReportIncidentAccess = async (req, res, next) => {
  const reportIds = getRequestedIds(req.body && req.body.ids);
  const targetId = req.body && req.body.group && req.body.group._id
    ? String(req.body.group._id)
    : null;

  if (reportIds.length === 0 || !targetId) return next();
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    return res.status(400).send('Invalid incident identifier.');
  }

  try {
    const reports = await Report.find({ _id: { $in: reportIds } })
      .select('_group')
      .lean()
      .exec();
    const previousIds = reports
      .map((report) => report._group && String(report._group))
      .filter(Boolean);
    const incidentIds = [...new Set([targetId, ...previousIds])];
    const incidents = await Group.find({ _id: { $in: incidentIds } });
    const targetExists = incidents.some((incident) => String(incident._id) === targetId);

    if (!targetExists) return res.status(404).send('Group not found.');

    const allAccessible = incidents.every((incident) =>
      canViewIncident(
        req.incidentAccess.user,
        incident,
        req.incidentAccess.ledTeamIds
      )
    );

    if (!allAccessible) {
      return res.status(403).send('Unauthorized to modify one or more incidents.');
    }

    if (incidents.some((incident) => !hasScopedIncidentPermission(req, incident))) {
      return res.status(403).send(
        'Your team role cannot modify one or more incidents.'
      );
    }

    req.reportIncidents = incidents;
    return next();
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to check incident access.');
  }
};

module.exports = {
  loadIncidentAccessContext,
  requireIncidentBodyAccess,
  requireIncidentParamAccess,
  requireIncidentPolicyAccess,
  requireIncidentQueryAccess,
  requireReportIncidentAccess,
};
