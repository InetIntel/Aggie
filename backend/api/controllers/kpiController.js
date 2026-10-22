'use strict';

const KpiEvent = require('../../models/kpiEvent');
const tracking = require('../utils/kpiTracking');
const { resolveRange, buildPipeline, formatReport } = require('../utils/kpiReport');

exports.overview = async (req, res) => {
  let range;
  try { range = resolveRange(req.query); }
  catch (error) { return res.status(400).send(error.message); }
  try {
    await tracking.ready;
    const [aggregates, marker] = await Promise.all([
      KpiEvent.aggregate(buildPipeline(range)).exec(),
      KpiEvent.findById('tracking-started').lean().exec(),
    ]);
    res.set('Cache-Control', 'no-store');
    return res.json({
      ...formatReport(range, aggregates, marker?.at || null),
      writeWarning: tracking.hasWriteFailure(),
    });
  } catch (error) {
    console.error('Unable to read KPI report', error);
    return res.status(500).send('Unable to load KPI report.');
  }
};
