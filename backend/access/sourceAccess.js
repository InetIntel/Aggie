'use strict';

const normalizeIds = (values) => {
  if (!Array.isArray(values)) return [];

  return values
    .filter(Boolean)
    .map((value) => {
      if (value._id) return String(value._id);
      return String(value);
    });
};

const getUserTeamIds = (user) => {
  if (!user || !Array.isArray(user.teams)) return [];
  return normalizeIds(user.teams);
};

const getSourcePolicy = (source) => {
  return source && source.accessPolicy
    ? source.accessPolicy
    : {
        mode: 'public',
        teams: [],
        cutoffDate: null,
      };
};

const hasTeamOverlap = (userTeamIds, allowedTeamIds) => {
  const userTeams = new Set(userTeamIds);
  return allowedTeamIds.some((teamId) => userTeams.has(teamId));
};

const isAdmin = (user) => {
  return user && user.role === 'admin';
};

const canAccessRestrictedPolicy = (user, policy) => {
  if (isAdmin(user)) return true;

  const userTeamIds = getUserTeamIds(user);
  const allowedTeamIds = normalizeIds(policy.teams);

  if (allowedTeamIds.length === 0) return false;

  return hasTeamOverlap(userTeamIds, allowedTeamIds);
};

const canViewSource = (user, source) => {
  if (isAdmin(user)) return true;

  const policy = getSourcePolicy(source);

  if (!policy.mode || policy.mode === 'public') {
    return true;
  }

  if (policy.mode === 'restricted') {
    return canAccessRestrictedPolicy(user, policy);
  }

  if (policy.mode === 'public_until') {
    return canAccessRestrictedPolicy(user, policy);
  }

  return false;
};

const canViewSourceDataForDate = (user, source, recordDate) => {
  if (isAdmin(user)) return true;

  const policy = getSourcePolicy(source);

  if (!policy.mode || policy.mode === 'public') {
    return true;
  }

  if (policy.mode === 'restricted') {
    return canAccessRestrictedPolicy(user, policy);
  }

  if (policy.mode === 'public_until') {
    if (!policy.cutoffDate) {
      return canAccessRestrictedPolicy(user, policy);
    }

    if (!recordDate) {
      return canAccessRestrictedPolicy(user, policy);
    }

    const cutoffDate = new Date(policy.cutoffDate);
    const itemDate = new Date(recordDate);

    if (itemDate < cutoffDate) {
      return true;
    }

    return canAccessRestrictedPolicy(user, policy);
  }

  return false;
};

const canManageSource = (user) => isAdmin(user);

const getSourceId = (source) => {
  if (!source) return null;
  if (source._id) return String(source._id);
  if (source.id) return String(source.id);
  return null;
};

const getVisibleSourceIds = (user, sources) => {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .filter((source) => canViewSource(user, source))
    .map(getSourceId)
    .filter(Boolean);
};

const getReportDateBeforeFilter = (cutoffDate) => ({
  $or: [
    { authoredAt: { $lt: cutoffDate } },
    {
      $and: [
        { authoredAt: null },
        { fetchedAt: { $lt: cutoffDate } },
      ],
    },
    {
      $and: [
        { authoredAt: null },
        { fetchedAt: null },
        { storedAt: { $lt: cutoffDate } },
      ],
    },
  ],
});

const buildReportSourceAccessFilter = (user, sources) => {
  if (isAdmin(user) || !Array.isArray(sources) || sources.length === 0) {
    return {};
  }

  const knownSourceIds = sources.map(getSourceId).filter(Boolean);
  const fullyVisibleSourceIds = getVisibleSourceIds(user, sources);
  const accessClauses = [];

  // Preserve historical behavior for reports with no source or whose source
  // record no longer exists. Access policies only restrict known sources.
  if (knownSourceIds.length > 0) {
    accessClauses.push({ _sources: { $nin: knownSourceIds } });
  }

  if (fullyVisibleSourceIds.length > 0) {
    accessClauses.push({ _sources: { $in: fullyVisibleSourceIds } });
  }

  sources.forEach((source) => {
    const sourceId = getSourceId(source);
    const policy = getSourcePolicy(source);

    if (
      !sourceId ||
      policy.mode !== 'public_until' ||
      canAccessRestrictedPolicy(user, policy) ||
      !policy.cutoffDate
    ) {
      return;
    }

    const cutoffDate = new Date(policy.cutoffDate);
    if (Number.isNaN(cutoffDate.getTime())) return;

    accessClauses.push({
      $and: [
        { _sources: sourceId },
        getReportDateBeforeFilter(cutoffDate),
      ],
    });
  });

  if (accessClauses.length === 0) {
    return { _id: { $in: [] } };
  }

  return { $or: accessClauses };
};

module.exports = {
  buildReportSourceAccessFilter,
  canManageSource,
  canViewSource,
  canViewSourceDataForDate,
  getSourcePolicy,
  getUserTeamIds,
  normalizeIds,
  getVisibleSourceIds,
};
