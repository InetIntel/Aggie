'use strict';

const KpiEvent = require('../../models/kpiEvent');
const tracking = require('../utils/kpiTracking');
const { resolveRange, buildPipeline, formatReport } = require('../utils/kpiReport');
const { buildTeamPipeline, formatTeams } = require('../utils/kpiTeams');
const { canExportKpis } = require('../../access/kpiAccess');
const { reportCsv } = require('../utils/kpiCsv');

async function report(req, res, exporting = false) {
  const access = req.kpiAccess;
  if (!access?.canView) return res.sendStatus(403);
  let range;
  try { range = resolveRange(req.query); }
  catch (error) { return res.status(400).send(error.message); }
  const input = req.query.team;
  const requestedIds = input === undefined ? [] : typeof input === 'string' ? input.split(',') : input;
  if (!Array.isArray(requestedIds) || requestedIds.some((id) => typeof id !== 'string' || !/^(unknown|unassigned|[a-f0-9]{24})$/.test(id))) {
    return res.status(400).send('Choose valid teams.');
  }
  const selectedIds = [...new Set(requestedIds)];
  if (!access.global && selectedIds.some((id) => !access.teamIds.includes(id))) return res.sendStatus(403);
  const canExport = canExportKpis(access, selectedIds);
  if (exporting && !canExport) return res.sendStatus(403);
  const scope = access.global ? undefined : access.teamIds;
  try {
    await tracking.ready;
    const [aggregates, marker, teamAggregates, teamMarker] = await Promise.all([
      KpiEvent.aggregate(buildPipeline(range, selectedIds.length ? selectedIds : scope)).exec(),
      KpiEvent.findById('tracking-started').lean().exec(),
      KpiEvent.aggregate(buildTeamPipeline(range, scope)).exec(),
      KpiEvent.findById('team-tracking-started').lean().exec(),
    ]);
    const teamReports = formatTeams(range, teamAggregates, req.kpiTeams, marker?.at || null, teamMarker?.at || null)
      .filter((team) => access.global || access.teamIds.includes(team.id));
    if (selectedIds.some((id) => !teamReports.some((team) => team.id === id))) return res.status(400).send('A selected team is not available in this date range.');
    const includeHistory = selectedIds.length ? selectedIds.includes('unknown') : access.global;
    const overview = formatReport(range, aggregates, (includeHistory ? marker?.at : teamMarker?.at) || null);
    res.set('Cache-Control', 'no-store');
    const result = {
      ...overview,
      selectedTeams: selectedIds,
      globalAccess: access.global,
      canExport,
      teamTrackingStartedAt: teamMarker?.at || null,
      teamOptions: teamReports.map(({ id, name }) => ({ id, name })),
      teams: teamReports.filter((team) => !selectedIds.length || selectedIds.includes(team.id)).map(({ id, name, totals, shared, days, trackingStartedAt }) => ({
        id, name, totals, shared, trackingStartedAt,
        coverage: days.every((day) => day.coverage === 'unavailable') ? 'unavailable'
          : days.every((day) => day.coverage === 'complete') ? 'complete' : 'partial',
      })),
      writeWarning: tracking.hasWriteFailure(),
    };
    if (exporting) {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="aggie-kpis-${selectedIds.length ? 'selected-teams' : 'all-accessible-teams'}-${range.start.toISOString().slice(0, 10)}.csv"`);
      return res.send(reportCsv(result, range));
    }
    return res.json(result);
  } catch (error) {
    console.error('Unable to read KPI report', error);
    return res.status(500).send('Unable to load KPI report.');
  }
}

exports.overview = (req, res) => report(req, res);
exports.exportCsv = (req, res) => report(req, res, true);
