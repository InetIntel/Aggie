// Handles CRUD requests for reports.
"use strict";

var Report = require("../../models/report");
var batch = require("../../models/batch");
var ReportQuery = require("../../models/query/report-query");
var _ = require("lodash");
var writelog = require("../../writeLog");
var tags = require("../../shared/tags");
const Group = require("../../models/group");
const eventRouter = require("../sockets/event-router");
const axios = require("axios");

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
    const resp = await axios.get(`http://localhost:8080/search?query=${query_text}`);
    const tags = resp.data.tags;
    console.log("Semantic Tag Matches", tags);

    if (req.query) {
      let query = new ReportQuery();
      query.aitagnames = { $in: tags };
      // Query for reports using fti
      Report.queryReports(query, req.query.page, (err, reports) => {
        if (err) return res.status(err.status).send(err.message);
        else {
          writelog.writeReport(req, reports, "filter", query);
          //log reports length
          //console.log("reports length", reports.results.length);
          //console.log("reports[0].aitags", JSON.parse(JSON.stringify(reports.results[0].aitags))["misinformation"]);
          
          const filteredReports = reports.results.filter(report => 
            Object.keys(JSON.parse(JSON.stringify(report.aitags))).some(tag => tags.includes(tag) && JSON.parse(JSON.stringify(report.aitags))[tag] === true)
          );
          console.log("filteredReports length", filteredReports.length);
          console.log("reports length", reports.results.length);
          return res.send({ total: filteredReports.length, results: filteredReports });
        }
      });
    } else {
      // Return all reports using pagination
      Report.findSortedPage({}, page, (err, reports) => {
        if (err) return res.status(err.status).send(err.message);
        else return res.status(200).send(reports);
      });
    }
  } catch (error) {
    console.error("Error fetching data from axios", error);
    return res.status(500).send("Error fetching data from external service");
  }
};
