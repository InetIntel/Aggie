'use strict';

const database = require('../../database');
const Group = require('../../models/group');
const Report = require('../../models/report');
const Team = require('../../models/team');
const { getSourceAccessUser } = require('../utils/sourceAccessUser');
const { normalizeCountries, matchesIncidentCountries } = require('../../access/incidentAccess');
const {
  buildIncidentAccessFilter,
  canModifyIncidentWithScope,
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

const loadIncidentAccessContext = async (req, res, next) => {
  if (req.incidentAccess) return next();

  let user = req.accessUser || req.user;
  if (!user) return res.status(401).send('Authentication required.');

  try {
    user = await getSourceAccessUser(req);
    if (req.permissionScope && req.permissionScope.global !== true) {
      const scopedTeams = await Team.find({
        _id: { $in: req.permissionScope.teamIds || [] }, active: { $ne: false },
      }).select('countryCodes').lean();
      req.permissionScope.countryCodes = normalizeCountries(scopedTeams.flatMap((team) => team.countryCodes || []));
    }
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

    if (
      !['GET', 'HEAD'].includes(req.method) &&
      !canModifyIncidentWithScope(req.permissionScope, incident)
    ) {
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

    if (incidents.some((incident) => !canModifyIncidentWithScope(req.permissionScope, incident))) {
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
  try {
    if (!req.permissionScope || req.permissionScope.permission !== 'edit data') {
      return res.status(403).send('Incident permissions have not been checked.');
    }
    if (!req.incident && req.body && req.body.reportIds) {
      const ids = getRequestedIds(req.body.reportIds);
      if (!Array.isArray(req.body.reportIds) || ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
        return res.status(400).send('Invalid report identifiers.');
      }
      const { getReportSourceAccessFilter, combineReportFilters } = require('../utils/reportSourceAccess');
      const accessFilter = await getReportSourceAccessFilter(req);
      const reports = await Report.find(combineReportFilters({ _id: { $in: ids } }, accessFilter)).select('_sources').lean();
      if (reports.length !== ids.length) return res.status(403).send('Unauthorized to access one or more reports.');
      const { getReportCountries } = require('../utils/incidentCountries');
      // Derive before creation so there is no public interval while reports attach.
      req.body.countryCodes = normalizeCountries([
        ...(Array.isArray(req.body.countryCodes) ? req.body.countryCodes : []),
        ...await getReportCountries(reports),
      ]);
      delete req.body.reportIds;
    }
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'countryCodes')) {
      if (!Array.isArray(req.body.countryCodes) || req.body.countryCodes.some(
        (code) => typeof code !== 'string' || !/^[a-z]{2}$/i.test(code.trim())
      )) return res.status(400).send('Incident countries must be two-letter country codes.');
      const countries = normalizeCountries(req.body.countryCodes);
      const current = normalizeCountries(req.incident && req.incident.countryCodes);
      const changed = countries.length !== current.length || countries.some((code) => !current.includes(code));
      if (changed) {
        const { hasPermission } = require('../../access/permissions');
        const user = req.incidentAccess.user;
        if (user.role !== 'admin' && !hasPermission(user, 'manage incident access')) {
          const teams = await Team.find({
            _id: { $in: req.incidentAccess.policyTeamIds }, active: { $ne: false },
          }).select('countryCodes').lean();
          const manageable = new Set(normalizeCountries(teams.flatMap((team) => team.countryCodes || [])));
          if ([...countries, ...current].some((code) => !manageable.has(code))) {
            return res.status(403).send('Unauthorized to change incident countries.');
          }
        }
        const candidate = { countryCodes: countries };
        if (req.permissionScope.global !== true && !matchesIncidentCountries(req.permissionScope.countryCodes, candidate)) {
          return res.status(403).send('Incident countries must match a team you can monitor.');
        }
      }
      req.body.countryCodes = countries;
    }
    if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, 'accessPolicy')) {
      if (
        !req.permissionScope.allowUnscoped &&
        !(req.body && req.body.countryCodes && req.body.countryCodes.length) &&
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

    if (req.permissionScope.global !== true) {
      const scopedTeamIds = new Set(normalizeIds(req.permissionScope.teamIds));
      if (
        (policy.mode === 'public' && !req.permissionScope.allowUnscoped && !(req.body.countryCodes || req.incident?.countryCodes || []).length) ||
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

    if (incidents.some((incident) => !canModifyIncidentWithScope(req.permissionScope, incident))) {
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
