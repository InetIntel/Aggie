// Handles CRUD requests for groups.
'use strict';

var Group = require('../../models/group');
const AsnInfo = require('../../models/asnInfo');
const _ = require('lodash');
var tags = require('../../shared/tags');
const Report = require('../../models/report');
const eventRouter = require('../sockets/event-router');
const { saveFile, deleteFile } = require('../utils/fileStorage');
const { MAX_ATTACHMENT_COUNT, MAX_ATTACHMENT_SIZE } = require('../../config/models/groupConfigs');
const path = require('path');

exports.group_create = (req, res) => {
  req.body.creator = req.user;
  Group.create(req.body, (err, group) => {
    if (err) {
      res.status(err.status).send(err.message);
    } else {
      

      eventRouter.publish('groups:create', group).then(() => {
        res.status(200).send(group);
      });
    }
  });
};

// lean option means only return name and id
exports.group_all_groups = (req, res) => {
  const projection = req.query.lean === "true" ? 'title closed escalated idnum' : '';
  Group.find({ public: true }, projection, {}, (err, groups) => {
    if (err) res.status(err.status).send(err.message);
    else res.status(200).send(groups);
  });
};

exports.group_groups = (req, res) => {
  // Read query string parameters
  const groupData = parseQueryData(req.query);
  const defaultSort = '-storedAt'
  const sortByKey = req.query?.sortBy || ""

  const sortTable = {
    'mostReports': '-reportsLength',
    'leastReports': 'reportsLength',
    'mostComments': '-commentsLength',
    'leastComments': 'commentsLength',
    'descStartDate': '-incidentStartedAt',
    'ascStartDate': 'incidentStartedAt',
    'descEndDate': '-incidentEndedAt',
    'ascEndDate': 'incidentEndedAt',
  }
  const sortBy = sortByKey in sortTable ? sortTable[sortByKey] : defaultSort

  // Use paginated find
  Group.queryGroups(
    groupData,
    req.query.page,
    {
      sort: sortBy,
      populate: [
        { path: 'creator', select: 'username' },
        { path: 'assignedTo', select: 'username' },
      ],
    },
    async (err, groups) => {
      if (err) {
        res.status(err.status).send(err.message);
        return;
      }

      try {
        const enrichedResults = await addPopulationCoverageToGroups(groups.results || []);
        res.status(200).send({
          ...groups,
          results: enrichedResults,
        });
      } catch (coverageErr) {
        console.error('Error enriching groups with population coverage:', coverageErr);
        res.status(200).send(groups);
      }
    }
  );
};

exports.group_details = (req, res) => {
  var referer = req.headers.referer || '';
  Group.findById(req.params._id)
    .populate({ path: 'creator', select: 'username' })
    .populate({ path: 'assignedTo', select: 'username' })
    .exec(async (err, group) => {
      if (err) {
        res.status(err.status).send(err.message);
      } else if (!group) {
        res.sendStatus(404);
      } else {
        if (
          !(referer.split('/')[referer.split('/').length - 1] === 'reports')
        ) {
          
        }
        try {
          const [enrichedGroup] = await addPopulationCoverageToGroups([group]);
          res.status(200).send(enrichedGroup);
        } catch (coverageErr) {
          console.error('Error enriching group with population coverage:', coverageErr);
          res.status(200).send(group);
        }
      }
    });
};

// Update a Group
exports.group_update = async (req, res) => {
  try {
    const group = await Group.findById(req.params._id);
    if (!group) return res.sendStatus(404);

    const getTimeOrNull = (v) => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(v);
      const t = d.getTime();
      return Number.isNaN(t) ? null : t;
    };

    const prevStartTs = getTimeOrNull(group.incidentStartedAt);
    const prevEndTs   = getTimeOrNull(group.incidentEndedAt);

    const safeBody = _.omit(req.body, ['creator', 'incidentDurationMs']);
    _.extend(group, safeBody);

    const newStartTs = getTimeOrNull(group.incidentStartedAt);
    const newEndTs   = getTimeOrNull(group.incidentEndedAt);

    let durationSeconds = null;
    if (newStartTs !== null && newEndTs !== null && newEndTs >= newStartTs) {
      const durationMs = newEndTs - newStartTs;
      durationSeconds = Math.floor(durationMs / 1000); 
    }
    
    group.incidentDurationSeconds = durationSeconds;

    const saved = await group.save();
    if (!saved) {
      return res.sendStatus(404);
    }

    await eventRouter.publish('groups:update', {
      ids: group._id,
      update: group,   
    });

    return res.status(200).send(group);
  } catch (err) {
    console.error('Error in group_update:', err);
    return res
      .status(err.status || 500)
      .send(err.message || 'Error updating group');
  }
};

// exports.group_update = (req, res, next) => {
//   // Find group to update
//   Group.findById(req.params._id, (err, group) => {
//     if (err) return res.status(err.status).send(err.message);
//     if (!group) return res.sendStatus(404);
//     // Update the actual values

//     group = _.extend(group, _.omit(req.body, 'creator'));
//     // Save group
//     group.save(function (err, numberAffected) {
//       if (err) {
//         res.status(err.status).send(err.message);
//       } else if (!numberAffected) {
//         res.sendStatus(404);
//       } else {
        
//         eventRouter.publish('groups:update', { ids: group._id, update: group }).then(() => {
//           res.status(200).send(group);
//         });
//       }
//     });
//   });
// };

// Delete selected groups
exports.group_selected_delete = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, function (err, groups) {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    var remaining = groups.length;
    groups.forEach(function (group) {
      // Delete each group explicitly to catch it in model
      group.remove((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        
        if (--remaining === 0) {
          res.sendStatus(200);
        }
      });
    });
  });
};

exports.group_tags_add = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, function (err, groups) {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    var remaining = groups.length;
    groups.forEach(function (group) {
      group.addSMTCTag(req.body.smtcTag, (err) => {
        if (err && !res.headersSent) {
          res.status(500).send(err.message);
          return;
        }
        // Save group
        group.save(function (err, numberAffected) {
          if (err) {
            res.status(err.status).send(err.message);
          } else if (!numberAffected) {
            res.sendStatus(404);
          } else {
            
            res.sendStatus(200);
          }
        });
      });
    });
  });
};

exports.group_tags_remove = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, function (err, groups) {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    groups.forEach(function (group) {
      group.removeSMTCTag(req.body.smtcTag, (err) => {
        if (err && !res.headersSent) {
          res.send(500, err.message);
          return;
        }
        // Save group
        group.save(function (err, numberAffected) {
          if (err) {
            res.status(err.status).send(err.message);
          } else if (!numberAffected) {
            res.sendStatus(404);
          } else {
            
            res.sendStatus(200);
          }
        });
      });
    });
  });
};

// Escalate selected groups
exports.group_escalated_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.setEscalated(req.body.escalated);
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { escalated: group.escalated } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};
// assign users to selected groups
exports.group_assigned_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.setAssigned(req.body.assignedTo);
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: group._id, update: { assignedTo: group.assignedTo } }).then(() => {
            return res.status(200).send(group);
          });
        }
      });
    });
  });
};
// Change name of selected groups
exports.group_title_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.title = req.body.title;
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { title: group.title } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};

// change locationName for selected groups
exports.group_locationName_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.locationName = req.body.locationName;
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { locationName: group.locationName } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};

// Update group closed
exports.group_closed_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.closed = req.body.closed;
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { closed: group.closed } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};




// Update group closed
exports.group_public_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.public = req.body.public;
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { public: group.public } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};


// Update group notes
exports.group_notes_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.notes = req.body.notes;
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { note: group.notes } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};

// add group comment
exports.group_comment_add = async (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  
  // parse from multipart/form-data
  const groupIds = req.body.ids;
  const comment = req.body.comment;
  const attachments = req.files;
  const savedPaths = [];
  
  try {

    const groups = await Group.find({_id: {$in: groupIds}});
    if (!groups.length) { return res.status(404).send('Group not found.'); }

    // Upload attachments if any
    if (!validateAttachments(attachments)) {
      return res.status(400).send('Bad Request. Invalid Attachments.');

    } else if (attachments.length) {
      
      comment.attachments = [];

      for (const attachment of attachments) {
        const savedPath = await saveFile(attachment.buffer, attachment.originalname);

        if (savedPath) {
          savedPaths.push(savedPath);

          const publicRefPath = `/incidents/uploads/${path.basename(savedPath)}`;

          comment.attachments.push({
            fileName: attachment.originalname,
            path: publicRefPath, // relative path for frontend href
            serverPath: savedPath, // actual server storage path
            mimeType: attachment.mimetype,
            fileSize: attachment.size,
          });

        }
      }
    }

    // save comments
    let remaining = groups.length;
    let eventPublished = false;

    for (const group of groups) {
      group.comments.push(comment);
      group.save(async (err) => {
        if (err) {
          await Promise.all(savedPaths.map(deleteFile)); // if err, remove previous uploaded files;

          if (!res.headersSent) res.status(err.status).send(err.message);

          return;
        }
        if (--remaining === 0 && !eventPublished ) {
          eventPublished = true;
          eventRouter.publish('groups:update', {
             ids: req.body.ids, 
             update: { comments: group.comments } 
            }).then(() => { return res.sendStatus(200) });
        }
      })
    }

  } catch (err) {
    console.error('[Api-Controller-group_comment_add] Failed adding comment: ', err.message);
    res.status(err.status || 500).send('Failed adding comment', err.message);
  }

};

// Update group comment
exports.group_comment_update = async (req, res) => {
  if (!req.body.ids || !req.body.ids.length){
    return res.sendStatus(200);
  }

  let groupIds, commentPayload;

  // parse from multipart/form-data
  try {
    groupIds = req.body.ids;
    commentPayload = req.body.comment;
  } catch (error) {
    return res.status(400).send('Bad Request. Invalid JSON in group or comment.');
  }

  const commentId = commentPayload._id;
  const newData = commentPayload.data;
  const attachmentsToDelete = commentPayload.attachmentsToDelete || [];
  const deletedPaths = [];
  const attachmentsToUpload = req.files;
  const savedPaths = [];

  try {
    const group = await Group.findById(groupIds[0]);
    if (!group) { return res.status(404).send('Group not found.'); };

    const comment = group.comments.id(commentId);
    if (!comment) { return res.status(404).send('Comment not found.'); };

    // Update comment content
    comment.data = newData;

    // Delete attachments from document and file system
    comment.attachments = comment.attachments.filter((att) => {
      const toDelete = attachmentsToDelete.includes(att._id.toString());
      if (toDelete) {
        deletedPaths.push(att.serverPath);
      }
      return !toDelete;      
    })

    await Promise.all(deletedPaths.map(deleteFile));

    // Upload new attachments
    const totalAttachments = comment.attachments.length + attachmentsToUpload.length;

    if (totalAttachments > MAX_ATTACHMENT_COUNT) {
      return res.status(400).send(`Bad Request. Max ${MAX_ATTACHMENT_COUNT} attachments.`);
    } else if (!validateAttachments(attachmentsToUpload)) {
      return res.status(400).send(`Bad Request. Invalid Attachments. `);
    } 

    for (const attachment of attachmentsToUpload) {

      const savedPath = await saveFile(attachment.buffer, attachment.originalname);

      if (savedPath) {
        savedPaths.push(savedPath);

        const publicRefPath = `/incidents/uploads/${path.basename(savedPath)}`;

        comment.attachments.push({
          fileName: attachment.originalname,
          path: publicRefPath, // relative path for frontend href
          serverPath: savedPath, // actual server storage path
          mimeType: attachment.mimetype,
          fileSize: attachment.size,
        });

      }
    }

    await group.save();

    await eventRouter.publish('groups:update', {
       ids: req.body.ids, 
       update: { comments: group.comments } ,
    });

    res.sendStatus(200);

  } catch (err) {
    console.error('[Api-Controller-group_comment_update] Failed updating comment: ', err.message);
    res.status(err.status || 500).send('Failed updating comment', err.message);
  }

};

// remove group comment
exports.group_comment_remove = async (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);

  const {ids, commentId} = req.body;

  if (!ids || !ids.length || !commentId) {
    return res.status(400).send('Bad Request. Misgging group id or comment id.');
  }
  
  try {
    const group = await Group.findById(ids[0]);
    if (!group) { return res.status(404).send('Group not found.'); };

    const comment = group.comments.id(commentId);
    if (!comment) { return res.status(404).send('Comment not found.'); };

    let deletedPaths = [];
    deletedPaths = comment.attachments.map(att => att.serverPath);

    await Promise.all(deletedPaths.map(deleteFile));
    await comment.remove();
    await group.save();

    await eventRouter.publish('groups:update', {
       ids: req.body.ids, 
       update: { comments: group.comments } ,
    });

    res.sendStatus(200);

  } catch (err) {
    console.error('[Api-Controller-group_comment_remove] Failed removing comment: ', err.message);
    res.status(err.status || 500).send('Failed removing comment', err.message);
  }
}

exports.group_tags_clear = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, function (err, groups) {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    groups.forEach(function (group) {
      group.clearSMTCTags(req.body.smtcTag, (err) => {
        if (err && !res.headersSent) {
          res.send(500, err.message);
          return;
        }
        // Save group
        group.save(function (err, numberAffected) {
          if (err) {
            res.status(err.status).send(err.message);
          } else if (!numberAffected) {
            res.sendStatus(404);
          } else {
            
            res.sendStatus(200);
          }
        });
      });
    });
  });
};

// Delete an Group
exports.group_delete = async (req, res, next) => {
  if (req.params._id === '_all') return next();

  try {
    const group = await Group.findById(req.params._id);
    if (!group) { return res.status(404).send('Group not found.'); };

    const deletedPaths = group.comments.flatMap(comment => {
      comment.attachments.map(att => att.path);
    });

    await Promise.all(deletedPaths.map(deleteFile));
    await group.remove();
    await eventRouter.publish('groups:delete', group);
    
    res.sendStatus(200);

  } catch (err) {
    console.error('[Api-Controller-group_delete] Failed deleting group: ', err.message);
    res.status(err.status || 500).send('Failed deleting group', err.message);
  }
}
// exports.group_delete = (req, res, next) => {
//   if (req.params._id === '_all') return next();
//   Group.findById(req.params._id, (err, group) => {
//     if (err) return res.status(err.status).send(err.message);
//     if (!group) return res.sendStatus(404);
//     group.remove((err) => {
//       if (err) {
//         return res.status(err.status).send(err.message);
//       }
      

//       eventRouter.publish('groups:delete', group).then(() => {
//         res.sendStatus(200);
//       });
//     });
//   });
// };

// Delete all Groups
exports.group_all_delete = (req, res) => {
  Group.find(function (err, groups) {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    var remaining = groups.length;
    groups.forEach(function (group) {
      // Delete each group explicitly to catch it in model
      group.remove((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        
        if (--remaining === 0) return res.sendStatus(200);
      });
    });
  });
};

const parseQueryData = (queryString) => {
  if (!queryString) return {};
  if (queryString.before) queryString.storedAt = { $lte: queryString.before };
  if (queryString.after)
    queryString.storedAt = Object.assign({}, queryString.storedAt, {
      $gte: queryString.after,
    });
  let query = _.pick(queryString, Group.filterAttributes);
  if (query.tags) query.tags = tags.toArray(query.tags);
  return query;
};


const validateAttachments = (attachments) => {
    if (
      !Array.isArray(attachments) || 
      attachments.length > MAX_ATTACHMENT_COUNT ||
      attachments.some( file => typeof file.size !== 'number' || file.size > MAX_ATTACHMENT_SIZE)
    ) {
      return false;
    }

    return true;
}

async function addPopulationCoverageToGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return groups;
  const normalizeAsn = (asn) => (typeof asn === 'string' ? asn.trim().toLowerCase() : '');

  const allImpactedAsns = new Set();
  for (const group of groups) {
    const impactedAsns = Array.isArray(group.impactedAsns) ? group.impactedAsns : [];
    for (const asn of impactedAsns) {
      const normalizedAsn = normalizeAsn(asn);
      if (normalizedAsn.length > 0) {
        allImpactedAsns.add(normalizedAsn);
      }
    }
  }

  if (allImpactedAsns.size === 0) {
    return groups.map((group) => ({
      ...(typeof group.toObject === 'function' ? group.toObject() : group),
      directPopulationCoverageScore: null,
      indirectPopulationCoverageScore: null,
    }));
  }

  const asnDocs = await AsnInfo.find({ asn: { $in: Array.from(allImpactedAsns) } })
    .select('asn populationCoverageDirect populationCoverageIndirect')
    .lean()
    .exec();

  const asnCoverageByAsn = new Map();
  for (const doc of asnDocs) {
    asnCoverageByAsn.set(normalizeAsn(doc.asn), {
      direct: typeof doc.populationCoverageDirect === 'number' ? doc.populationCoverageDirect : null,
      indirect: typeof doc.populationCoverageIndirect === 'number' ? doc.populationCoverageIndirect : null,
    });
  }

  return groups.map((group) => {
    const normalizedGroup = typeof group.toObject === 'function' ? group.toObject() : group;
    const impactedAsns = Array.isArray(normalizedGroup.impactedAsns) ? normalizedGroup.impactedAsns : [];

    let directTotal = 0;
    let directCount = 0;
    let indirectTotal = 0;
    let indirectCount = 0;
    for (const asn of impactedAsns) {
      const coverage = asnCoverageByAsn.get(normalizeAsn(asn));
      if (typeof coverage?.direct === 'number') {
        directTotal += coverage.direct;
        directCount += 1;
      }
      if (typeof coverage?.indirect === 'number') {
        indirectTotal += coverage.indirect;
        indirectCount += 1;
      }
    }

    return {
      ...normalizedGroup,
      directPopulationCoverageScore: directCount > 0 ?
        (directTotal > 1 ? 1 : directTotal) :
        null,
      indirectPopulationCoverageScore: indirectCount > 0 ?
        (indirectTotal > 1 ? 1 : indirectTotal) :
        null,
    };
  });
}
