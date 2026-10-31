'use strict';

const { hasPermission } = require('./permissions');
const { getMembershipRole, getTeamPermissions } = require('./teamMemberships');

function getKpiAccess(user, teams, ledTeamIds = []) {
  if (!user || user.active === false) return { global: false, canView: false, globalExport: false, teamIds: [], exportTeamIds: [] };
  const global = hasPermission(user, 'view all kpis');
  const isAdmin = user.role === 'admin';
  const denied = new Set(user.permissionOverrides?.deny || []);
  const settings = new Map(teams.map((team) => [String(team._id), team]));
  const allowed = (team, permission) => {
    if (denied.has(permission)) return false;
    const id = String(team._id);
    if (!getMembershipRole(user, id, ledTeamIds)) return false;
    const member = (user.teamMemberships || []).find((item) => String(item.team?._id || item.team) === id);
    if (member?.permissionOverrides?.deny?.includes(permission) || team.permissionLimits?.deny?.includes(permission)) return false;
    return hasPermission(user, permission) || getTeamPermissions(user, id, ledTeamIds, settings).includes(permission);
  };
  const active = teams.filter((team) => team.active !== false);
  const teamIds = active.filter((team) => allowed(team, 'view team kpis')).map((team) => String(team._id));
  const exportTeamIds = active.filter((team) => teamIds.includes(String(team._id)) && allowed(team, 'export kpis')).map((team) => String(team._id));
  return {
    global, canView: global || teamIds.length > 0,
    globalExport: isAdmin || (global && hasPermission(user, 'export kpis')),
    teamIds, exportTeamIds,
  };
}

function canExportKpis(access, teamId) {
  if (!access.canView) return false;
  if (access.globalExport) return true;
  if (!teamId && access.global) return false;
  const ids = teamId ? [teamId] : access.teamIds;
  return ids.length > 0 && ids.every((id) => access.exportTeamIds.includes(id));
}

module.exports = { getKpiAccess, canExportKpis };
