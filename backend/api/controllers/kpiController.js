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
  const teamId = req.query.team;
  if (teamId !== undefined && (typeof teamId !== 'string' || !/^(unknown|unassigned|[a-f0-9]{24})$/.test(teamId))) {
    return res.status(400).send('Choose a valid team.');
  }
  if (teamId && !access.global && !access.teamIds.includes(teamId)) return res.sendStatus(403);
  const canExport = canExportKpis(access, teamId);
  if (exporting && !canExport) return res.sendStatus(403);
  const scope = access.global ? undefined : access.teamIds;
  try {
    await tracking.ready;
    const [aggregates, marker, teamAggregates, teamMarker] = await Promise.all([
      KpiEvent.aggregate(buildPipeline(range, scope)).exec(),
      KpiEvent.findById('tracking-started').lean().exec(),
      KpiEvent.aggregate(buildTeamPipeline(range, scope)).exec(),
      KpiEvent.findById('team-tracking-started').lean().exec(),
    ]);
    const teamReports = formatTeams(range, teamAggregates, req.kpiTeams, marker?.at || null, teamMarker?.at || null)
      .filter((team) => access.global || access.teamIds.includes(team.id));
    const selected = teamId && teamReports.find((team) => team.id === teamId);
    if (teamId && !selected) return res.status(400).send('Team is not available in this date range.');
    const overview = selected || formatReport(range, aggregates, (access.global ? marker?.at : teamMarker?.at) || null);
    res.set('Cache-Control', 'no-store');
    const result = {
      ...overview,
      selectedTeam: teamId || null,
      globalAccess: access.global,
      canExport,
      teamTrackingStartedAt: teamMarker?.at || null,
      teamOptions: teamReports.map(({ id, name }) => ({ id, name })),
      teams: (selected ? [selected] : teamReports).map(({ id, name, totals, shared, days, trackingStartedAt }) => ({
        id, name, totals, shared, trackingStartedAt,
        coverage: days.every((day) => day.coverage === 'unavailable') ? 'unavailable'
          : days.every((day) => day.coverage === 'complete') ? 'complete' : 'partial',
      })),
      writeWarning: tracking.hasWriteFailure(),
    };
    if (exporting) {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="aggie-kpis-${teamId || 'all-accessible-teams'}-${range.start.toISOString().slice(0, 10)}.csv"`);
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
