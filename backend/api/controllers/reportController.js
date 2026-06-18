// Handles CRUD requests for reports.
'use strict';

const database = require('../../database');
const mongoose = database.mongoose;

var Report = require('../../models/report');
var batch = require('../../models/batch');
var ReportQuery = require('../../models/query/report-query');
var _ = require('lodash');
var tags = require('../../shared/tags');
const Group = require("../../models/group");
const eventRouter = require('../sockets/event-router');
const {  recomputeIncidentDurationForGroups } = require('../utils/incidentDuration');
const { buildMediaUrl } = require('../../fetching/utils/socialImageStorage');

// Determine the search keywords
const parseQueryData = (queryString) => {
  if (!queryString) return {};
  // Data passed through URL parameters
  var query = _.pick(queryString, ['alerts', 'keywords', 'status', 'after', 'before', 'media','dataSources', 'entityLevel',
    'sourceId', 'groupId', 'author', 'tags', 'list', 'escalated', 'veracity', 'isRelevantReports', "irrelevant"]);
  
  if (!query.media && query.alerts === 'true') {
    query.isOutageEvent = true;
  } else if (!query.media && query.alerts === 'false') {
    query.isOutageEvent = false;
  } 
  
  
  if (query.dataSources) query.dataSources = query.dataSources.split(",").filter(Boolean);
  if (query.entityLevel) query.entityLevel = query.entityLevel.split(',').map(s => s.trim()).filter(Boolean);
  if (query.tags) query.tags = tags.toArray(query.tags);
  return query;
}

// Detemine whether should dedup overlapping reports
const shouldDedupByEventIdentifier = (entityLevel, groupId) => {
  if (groupId) return false;
  if (!entityLevel || entityLevel.length === 0) return true;
  return entityLevel.includes('AS') && entityLevel.includes('AS - Country');
};

const serializeReport = (report) => {
  if (!report) return report;

  const plainReport = typeof report.toObject === 'function'
    ? report.toObject()
    : report;

  const attachments = Array.isArray(plainReport?.metadata?.attachments)
    ? plainReport.metadata.attachments.map((attachment) => ({
        ...attachment,
        // Thumbnail URLs are intended for list/feed cards and should be lazy-loaded by the frontend.
        thumbnailUrl: buildMediaUrl(attachment.thumbnailKey),
        // Full image URLs are intended for report detail/full-view rendering.
        imageUrl: buildMediaUrl(attachment.imageKey),
      }))
    : plainReport?.metadata?.attachments;

  // IODA charts are stored as a media key at metadata.rawAPIResponse.image; expose a
  // URL the frontend can <img src> against. Guard the legacy inline-SVG shape (starts
  // with '<') so pre-migration reports keep working.
  const rawAPIResponse = plainReport?.metadata?.rawAPIResponse;
  const chartKey = rawAPIResponse?.image;
  const rawAPIResponseWithUrl =
    chartKey && typeof chartKey === 'string' && !chartKey.trimStart().startsWith('<')
      ? { ...rawAPIResponse, imageUrl: buildMediaUrl(chartKey) }
      : rawAPIResponse;

  return {
    ...plainReport,
    metadata: plainReport?.metadata
      ? {
          ...plainReport.metadata,
          attachments,
          ...(rawAPIResponse ? { rawAPIResponse: rawAPIResponseWithUrl } : {}),
        }
      : plainReport?.metadata,
  };
};

const serializeReportResponse = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map(serializeReport);
  }

  if (payload && Array.isArray(payload.results)) {
    return {
      ...payload,
      results: payload.results.map(serializeReport),
    };
  }

  return serializeReport(payload);
};

// Get a list of queried Reports
exports.report_reports = (req, res) => {
  // Parse query string

  const queryData = parseQueryData(req.query);
  if (queryData) {
    let query = new ReportQuery(queryData);

    const entityLevel = queryData.entityLevel;
    const hideDuplicateASNsParam = req.query.hideDuplicateASNs;
    
    // Determine if we should deduplicate
    let useDedup = shouldDedupByEventIdentifier(entityLevel, queryData.groupId);
    
    // If user explicitly set the toggle, use that value
    if (hideDuplicateASNsParam === 'true' || hideDuplicateASNsParam === 'false') {
      useDedup = hideDuplicateASNsParam === 'true';
    }

    const handler = (err, reports) => {
      // The timeout middleware may have already responded; never write twice.
      if (res.headersSent) {
        if (err) console.error('report_reports: response already sent, dropping late error:', err.message);
        return;
      }
      if (err) return res.status(err.status || 500).send(err.message);
      return res.send(serializeReportResponse(reports));
    };

    if (useDedup) {
      Report.queryReportsDeduped(query, req.query.page, handler);
    } else {
      Report.queryReports(query, req.query.page, handler);
    }

  } else {
    // Return all reports using pagination
    Report.findSortedPage({}, page, (err, reports) => {
      if (err) return res.status(err.status).send(err.message);
      else return res.status(200).send(reports);
    });
  }
}

// Load batch
exports.report_batch = (req, res) => {
  batch.load(req.user._id, (err, reports) => {
    if (err) res.status(err.status).send(err.message);
    else {
      
      res.status(200).send({ results: reports, total: reports.length });
    }
  });
}

// Checkout new batch
exports.report_batch_new = (req, res) => {
  const query = new ReportQuery(req.body);
  batch.checkout(req.user._id, query, (err, reports) => {
    if (err) res.status(err.status).send(err.message);
    else {
      
      res.status(200).send({ results: reports, total: reports.length });
    }
  });
}

// Cancel batch
exports.report_batch_cancel = (req, res) => {
  batch.cancel(req.user._id, (err) => {
    if (err) res.status(err.status).send(err.message);
    else {
      
      res.sendStatus(200);
    }
  });
}

// Get Report by id
exports.report_details = (req, res) => {
  Report.findById(req.params._id, (err, report) => {
    if (err) res.status(err.status).send(err.message);
    else if (!report) res.sendStatus(404);
    else {
      
      res.status(200).send(serializeReport(report));
    }
  });
}

// Get Report Comments by id
exports.report_comments = (req, res) => {
  const page = req.query.page;
  const queryData = { commentTo: req.params._id };
  const query = new ReportQuery(queryData);
  Report.queryReports(query, page, (err, reports) => {
    if (err) res.status(err.status).send(err.message);
    else {
      
      res.status(200).send(reports);
    }
  });
}

// Update Report data
exports.report_update = (req, res) => {
  // Find report to update
  Report.findById(req.params._id, (err, report) => {
    if (err) return res.status(err.status).send(err.message);
    if (!report) return res.sendStatus(404);
    // Update the actual value
    _.forEach(_.pick(req.body, ['_group', 'read', 'smtcTags', 'notes', 'escalated', 'veracity', "aitags_feedback"]), (val, key) => {
      report[key] = val;
    });
    if (!report.read) {
      report.setReadStatus(true);
    }
    // Save report
    report.save((err, numberAffected) => {
      if (err) res.status(err.status).send(err.message);
      else if (!numberAffected) res.sendStatus(404);
      else {
        res.sendStatus(200);
      }
    });
  });
}
/* Delete all reports
router.delete('/api/report/_all', User.can('edit data'), (req, res) => {
  Report.remove((err) {
    if (err) res.status(err.status).send(err.message);
    else {
      
      res.sendStatus(200);
    }
  });
}); */

// Edit veracity selected reports
exports.reports_veracity_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    let remaining = reports.length;
    reports.forEach((report) => {
      // Edit veracity to catch it in model
      report.setVeracity(req.body.veracity);
      report.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        
        if (--remaining === 0) return res.sendStatus(200);
      });
    });
  });
}

// Mark selected reports as read
exports.reports_read_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    let remaining = reports.length;
    reports.forEach((report) => {
      // Mark each report as read only to catch it in model
      report.setReadStatus(req.body.read);
      report.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        
        if (--remaining === 0) {
          eventRouter.publish('reports:update', { ids: req.body.ids, update: { read: req.body.read } }).then(() => {
            return res.sendStatus(200)
          });

        };
      });
    });
  });
}

// Escalate selected reports
exports.reports_escalated_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    let remaining = reports.length;
    reports.forEach((report) => {
      // Mark each report as escalated to catch it in model
      report.setEscalated(req.body.escalated);
      report.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        
        if (--remaining === 0) return res.sendStatus(200);
      });
    });
  });
}
// mark selected reports as irrelevent
exports.reports_irrelevant_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    let remaining = reports.length;
    reports.forEach((report) => {
      // Mark each report as escalated to catch it in model
      report.setIrrelevant(req.body.irrelevance);
      report.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        
        if (--remaining === 0) {
          eventRouter.publish('reports:update', { ids: req.body.ids, update: { irrelevant: req.body.irrelevance } }).then(() => {
            return res.sendStatus(200)
          });

        };
      });
    });
  });
}

// Link selected reports to one group
exports.reports_group_update = async (req, res) => {
  try {
    const ids = req.body.ids;
    const groupPayload = req.body.group;

    if (!ids || !ids.length) return res.sendStatus(200);
    if (!groupPayload || !groupPayload._id) {
      return res.status(400).send('Target group is required');
    }

    const targetGroupId = groupPayload._id.toString();

    const reports = await Report.find({ _id: { $in: ids } });
    if (!reports.length) return res.sendStatus(200);

    const prevGroupIds = [
      ...new Set(
        reports
          .filter(
            (r) =>
              r._group &&
              r._group.toString() !== targetGroupId
          )
          .map((r) => r._group.toString())
      ),
    ];

    if (prevGroupIds.length) {
      const prevGroups = await Group.find({ _id: { $in: prevGroupIds } });

      for (const prevGroup of prevGroups) {
        if (!Array.isArray(prevGroup._reports) || !prevGroup._reports.length) continue;

        prevGroup._reports = prevGroup._reports.filter(
          (id) => !ids.some((rid) => id.equals(rid))
        );
        
        //TODO: currently we use a conservative deletion design 
        //  i.e. without removing ASN/geoScope from origianl incident, only manual delete
        await prevGroup.save();
      }
    }

    const group = await Group.findById(targetGroupId);
    if (!group) {
      return res.status(404).send('Group not found');
    }

    if (!Array.isArray(group._reports)) group._reports = [];
    const reportIdSet = new Set(group._reports.map((id) => id.toString()));

    if (!Array.isArray(group.impactedAsns)) group.impactedAsns = [];
    if (!Array.isArray(group.impactedGeoScopes)) group.impactedGeoScopes = [];

    for (const report of reports) {
      report._group = targetGroupId;
      report.read = true;
      await report.save(); 

      const rid = report._id.toString();
      if (!reportIdSet.has(rid)) {
        group._reports.push(report._id);
        reportIdSet.add(rid);
      }

      addImpactedFromReportToGroup(group, report);
    }

    await group.save();

    // recomputate and update incident duration fields (startedAt / endedAt / duration)
    const groupIdsToRecompute = new Set([
      ...prevGroupIds,
      targetGroupId,
    ]);
    if (groupIdsToRecompute.size > 0) {
      await recomputeIncidentDurationForGroups([...groupIdsToRecompute]);
    }

    const updatedTargetGroup = await Group.findById(targetGroupId)
      .select(
        '_id _reports impactedAsns impactedGeoScopes incidentStartedAt incidentEndedAt incidentDurationSeconds'
      )
      .lean()
      .exec();

    if (!updatedTargetGroup) {
      return res.sendStatus(200);
    }

    await eventRouter.publish('groups:update', {
      ids: [group._id],
      update: {
        _reports: group._reports,
        impactedAsns: group.impactedAsns || [],
        impactedGeoScopes: group.impactedGeoScopes || [],
        incidentStartedAt: updatedTargetGroup.incidentStartedAt || null,
        incidentEndedAt: updatedTargetGroup.incidentEndedAt || null,
        incidentDurationSeconds: updatedTargetGroup.incidentDurationSeconds ?? null,
      },
    });

    await eventRouter.publish('reports:update', {
      ids: req.body.ids,
      update: { _group: group._id, read: true },
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error('Error in reports_group_update', err);
    if (!res.headersSent) {
      res
        .status(err.status || 500)
        .send(err.message || 'Error updating report groups');
    }
  }
};

// remove selected reports from one group
exports.reports_group_remove = async (req, res) => {
  try {
    const ids = req.body.ids;
    const groupPayload = req.body.group;

    if (!ids || !ids.length) return res.sendStatus(200);
    if (!groupPayload || !groupPayload._id) {
      return res.status(400).send('Group is required');
    }

    const groupId = groupPayload._id.toString();

    const reports = await Report.find({ _id: { $in: ids } });
    if (!reports.length) return res.sendStatus(200);

    for (const report of reports) {
      report._group = undefined;
      await report.save();
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).send('Group not found');
    }

    if (!Array.isArray(group._reports)) group._reports = [];

    const idsSet = new Set(ids.map((id) => id.toString()));

    group._reports = group._reports.filter(
      (rid) => !idsSet.has(rid.toString())
    );

    await group.save();

    await recomputeIncidentDurationForGroups([groupId]);

    const updatedGroup = await Group.findById(groupId)
      .select(
        '_id _reports impactedAsns impactedGeoScopes incidentStartedAt incidentEndedAt incidentDurationSeconds'
      )
      .lean()
      .exec();

    if (!updatedGroup) {
      return res.sendStatus(200);
    }

    await eventRouter.publish('groups:update', {
      ids: [updatedGroup._id],
      update: {
        _reports: updatedGroup._reports,
        impactedAsns: updatedGroup.impactedAsns || [],
        impactedGeoScopes: updatedGroup.impactedGeoScopes || [],
        incidentStartedAt: updatedGroup.incidentStartedAt || null,
        incidentEndedAt: updatedGroup.incidentEndedAt || null,
        incidentDurationSeconds: updatedGroup.incidentDurationSeconds ?? null,
      },
    });

    await eventRouter.publish('reports:update', {
      ids,
      update: { _group: null },
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error('Error in reports_group_remove', err);
    if (!res.headersSent) {
      res
        .status(err.status || 500)
        .send(err.message || 'Error removing reports from group');
    }
  }
};


// exports.reports_group_remove = (req, res) => {
//   if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
//   Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
//     if (err) return res.status(err.status).send(err.message);
//     if (reports.length === 0) return res.sendStatus(200);
//     let remaining = reports.length;


//     reports.forEach((report) => {
//       report._group = undefined;
//       report.save((err) => {
//         if (err) {
//           if (!res.headersSent) return res.status(err.status).send(err.message)
//           return;
//         }
//         Group.findById(req.body.group._id, (err, group) => {
//           if (err) {
//             if (!res.headersSent) {
//               return res.status(err.status).send(err.message);
//             }
//             return;
//           }
//           group._reports = group._reports.filter(i => i.equals(report._id));

//           group.save((err) => {
//             if (err) {
//               if (!res.headersSent) return res.status(err.status).send(err.message)
//               return;

//             }
//             if (--remaining === 0) {
//               eventRouter.publish('groups:update', { 
//                   ids: [req.body.group._id], 
//                   update: { 
//                     _reports: group._reports,
//                     impactedAsns: group.impactedAsns || [],
//                     impactedGeoScopes: group.impactedGeoScopes || [],
//                   } 
//                 }).then(() => {
//                 return res.sendStatus(200)
//               });
//             }

//           })
//         })
        
//         if (--remaining === 0) {
//           eventRouter.publish('reports:update', { ids: req.body.ids, update: { _group: req.body.group._id } }).then(() => {
//             return res.sendStatus(200)
//           });

//         };
//       });
//     });
//   });
// }

// Update Notes
exports.reports_notes_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    var remaining = reports.length;
    reports.forEach((report) => {
      report.notes = req.body.notes;
      report.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        
        if (--remaining === 0) return res.sendStatus(200);
      });
    });
  });
}

// Update Tags
exports.reports_tags_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    var remaining = reports.length;
    reports.forEach((report) => {
      report.smtcTags = req.body.tags;
      report.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        
        if (--remaining === 0) {
          eventRouter.publish('reports:update', { ids: req.body.ids, update: { smtcTags: req.body.tags } }).then(() => {
            return res.sendStatus(200)
          });

        };
      });
    });
  });
}
// dont think we are using these....
exports.reports_tags_add = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    var remaining = reports.length;
    reports.forEach((report) => {
      report.read = true;
      report.addSMTCTag(req.body.smtcTag, (err) => {
        if (err && !res.headersSent) {
          res.send(500, err.message);
          return;
        }
        report.save((err) => {
          if (err) return res.status(err.status).send(err.message);
          
          if (--remaining === 0) return res.sendStatus(200);
        });
      });
    });
  });
}
// dont think we are using these....

exports.reports_tags_remove = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    var remaining = reports.length;
    reports.forEach((report) => {
      report.removeSMTCTag(req.body.smtcTag, (err) => {
        if (err && !res.headersSent) {
          res.send(500, err.message);
          return;
        }
        report.save((err) => {
          if (err) return res.status(err.status).send(err.message);
          
          if (--remaining === 0) return res.sendStatus(200);
        });
      });
    });
  });
}
// dont think we are using these....

exports.reports_tags_clear = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Report.find({ _id: { $in: req.body.ids } }, (err, reports) => {
    if (err) return res.status(err.status).send(err.message);
    if (reports.length === 0) return res.sendStatus(200);
    var remaining = reports.length;
    reports.forEach((report) => {
      report.clearSMTCTags(() => {
        report.save((err) => {
          if (err) {
            if (!res.headersSent) res.status(err.status).send(err.message)
            return;
          }
          
          if (--remaining === 0) return res.sendStatus(200);
        });
      });
    });
  });
}



//Helper: calculate and add impacted ASN/GeoScope to corresponding incident
function addImpactedFromReportToGroup(group, report) {
  if (!report.isOutageEvent) return;

  if (!Array.isArray(group.impactedAsns)) group.impactedAsns = [];
  if (!Array.isArray(group.impactedGeoScopes)) group.impactedGeoScopes = [];

  if (report.isAsnScoped && typeof report.asn === 'string' && report.asn.length > 0) {
    if (!group.impactedAsns.includes(report.asn)) {
      group.impactedAsns.push(report.asn);
    }
  }

  if (typeof report.geoScope === 'string' && report.geoScope.length > 0) {
    if (!group.impactedGeoScopes.includes(report.geoScope)) {
      group.impactedGeoScopes.push(report.geoScope);
    }
  }
}
