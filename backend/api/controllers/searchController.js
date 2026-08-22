// Handles CRUD requests for reports.
"use strict";

var Report = require("../../models/report");
var batch = require("../../models/batch");
var ReportQuery = require("../../models/query/report-query");
var _ = require("lodash");
var tags = require("../../shared/tags");
const Group = require("../../models/group");
const eventRouter = require("../sockets/event-router");
const axios = require("axios");
const Source = require('../../models/source');
const { buildReportSourceAccessFilter } = require('../../access/sourceAccess');
const {
  hideRestrictedIncidentReferences,
} = require('../../access/reportIncidentReferences');

const getSearchSourceAccessFilter = async (req) => {
  const accessUser = req.accessUser || req.user || null;
  if (accessUser && accessUser.role === 'admin') return {};

  const sources = await Source.find({}, '_id accessPolicy')
    .lean()
    .exec();

  return buildReportSourceAccessFilter(accessUser, sources);
};

// Determine the search keywords
const parseQueryData = (queryString) => {
  if (!queryString) return {};
  // Data passed through URL parameters
  var query = _.pick(queryString, [
    "keywords",
    "status",
    "after",
    "before",
    "media",
    "sourceId",
    "groupId",
    "author",
    "tags",
    "list",
    "escalated",
    "veracity",
    "isRelevantReports",
  ]);
  if (query.tags) query.tags = tags.toArray(query.tags);
  return query;
};

// Get a list of queried Reports
exports.search_reports = async (req, res) => {
  console.log("search_reports", JSON.stringify(req.query, null, 2));
  const query_text = req.query.keywords;
  try {
    const sourceAccessFilter = await getSearchSourceAccessFilter(req);
    const resp = await axios.get(`http://localhost:8080/search?query=${query_text}`);
    const tags = resp.data.tags;
    console.log("Semantic Tag Matches", tags);

    if (req.query) {
      let query = new ReportQuery();
      query.aitagnames = { $in: tags };
      // Query for reports using fti
      Report.queryReports(query, req.query.page, async (err, reports) => {
        if (res.headersSent) return;
        if (err) return res.status(err.status).send(err.message);
        else {
          try {
            const filteredReports = reports.results;
            console.log("filteredReports length", filteredReports.length);
            console.log("reports length", reports.results.length);
            const safeResponse = await hideRestrictedIncidentReferences(
              req.accessUser || req.user,
              { total: filteredReports.length, results: filteredReports }
            );
            return res.send(safeResponse);
          } catch (accessError) {
            return res
              .status(accessError.status || 500)
              .send(accessError.message || "Unable to protect incident references.");
          }
        }
      }, sourceAccessFilter);
    } else {
      // Return all reports using pagination
      Report.findSortedPage(sourceAccessFilter, req.query.page, async (err, reports) => {
        if (res.headersSent) return;
        if (err) return res.status(err.status).send(err.message);
        else {
          try {
            const safeReports = await hideRestrictedIncidentReferences(
              req.accessUser || req.user,
              reports
            );
            return res.status(200).send(safeReports);
          } catch (accessError) {
            return res
              .status(accessError.status || 500)
              .send(accessError.message || "Unable to protect incident references.");
          }
        }
      });
    }
  } catch (error) {
    console.error("Error fetching data from axios", error);
    return res.status(500).send("Error fetching data from external service");
  }
};
