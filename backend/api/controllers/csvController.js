// Handles CRUD requests for reports.
"use strict";

const Report = require("../../models/report");
const Source = require("../../models/source");
const { buildReportSourceAccessFilter } = require("../../access/sourceAccess");

exports.csv_csv = async (req, res) => {
  try {
    let endDate = new Date();
    let startDate = new Date(endDate.getTime() - 2 * (24 * 60 * 60 * 1000));

    if (Object.keys(req.query).length > 0) {
      endDate = new Date(req.query.before);
      startDate = new Date(req.query.after);
      if (Number.isNaN(endDate.getTime()) || Number.isNaN(startDate.getTime())) {
        return res.status(400).send("Please provide valid before and after dates.");
      }
    }

    const accessUser = req.accessUser || req.user || null;
    const sources = await Source.find({}, "_id accessPolicy").lean();
    const sourceAccessFilter = buildReportSourceAccessFilter(accessUser, sources);
    const dateFilter = { storedAt: { $lte: endDate, $gte: startDate } };
    const filter = Object.keys(sourceAccessFilter).length > 0
      ? { $and: [dateFilter, sourceAccessFilter] }
      : dateFilter;
    const reports = await Report.find(filter);

    return res.status(200).send({ reports });
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || "Unable to export reports.");
  }
};

