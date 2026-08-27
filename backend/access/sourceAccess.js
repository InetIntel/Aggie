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

module.exports = {
  canViewSource,
  canViewSourceDataForDate,
  getSourcePolicy,
  getUserTeamIds,
  normalizeIds,
};