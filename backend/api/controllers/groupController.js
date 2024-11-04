// Handles CRUD requests for groups.
'use strict';

var Group = require('../../models/group');
const _ = require('lodash');
var writelog = require('../../writeLog');
var tags = require('../../shared/tags');
const Report = require('../../models/report');
const eventRouter = require('../sockets/event-router');

exports.group_create = (req, res) => {
  req.body.creator = req.user;
  Group.create(req.body, (err, group) => {
    if (err) {
      res.status(err.status).send(err.message);
    } else {
      writelog.writeGroup(req, group, 'createGroup');

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
  // Use paginated find
  Group.queryGroups(
    groupData,
    req.query.page,
    {
      sort: '-storedAt',
      populate: [
        { path: 'creator', select: 'username' },
        { path: 'assignedTo', select: 'username' },
      ],
    },
    (err, groups) => {
      if (err) res.status(err.status).send(err.message);
      else res.status(200).send(groups);
    }
  );
};

exports.group_details = (req, res) => {
  var referer = req.headers.referer || '';
  Group.findById(req.params._id)
    .populate({ path: 'creator', select: 'username' })
    .populate({ path: 'assignedTo', select: 'username' })
    .exec((err, group) => {
      if (err) res.status(err.status).send(err.message);
      else if (!group) res.sendStatus(404);
      else {
        if (
          !(referer.split('/')[referer.split('/').length - 1] === 'reports')
        ) {
          writelog.writeGroup(req, group, 'viewGroup');
        }
        res.status(200).send(group);
      }
    });
};

// Update a Group
exports.group_update = (req, res, next) => {
  // Find group to update
  Group.findById(req.params._id, (err, group) => {
    if (err) return res.status(err.status).send(err.message);
    if (!group) return res.sendStatus(404);
    // Update the actual values

    group = _.extend(group, _.omit(req.body, 'creator'));
    // Save group
    group.save(function (err, numberAffected) {
      if (err) {
        res.status(err.status).send(err.message);
      } else if (!numberAffected) {
        res.sendStatus(404);
      } else {
        writelog.writeGroup(req, group, 'editGroup');
        eventRouter.publish('groups:update', { ids: group._id, update: group }).then(() => {
          res.status(200).send(group);
        });
      }
    });
  });
};

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
        writelog.writeGroup(req, group, 'deleteGroup');
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
            writelog.writeGroup(req, group, 'addTagToGroup');
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
            writelog.writeGroup(req, group, 'removeTagFromGroup');
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
        writelog.writeReport(req, group, 'escalatedGroup');
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
        writelog.writeReport(req, group, 'assignedGroup');
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
        writelog.writeReport(req, group, 'titleGroup');
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
        writelog.writeReport(req, group, 'locationNameGroup');
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
        writelog.writeReport(req, group, 'notesGroup');
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { closed: group.closed } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};

// Update group veracity
exports.group_veracity_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      // Mark each report as escalated to catch it in model
      group.setVeracity(req.body.veracity);
      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        writelog.writeReport(req, group, 'veracityGroup');
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { veracity: group.veracity } }).then(() => {
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
        writelog.writeReport(req, group, 'publicGroup');
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
        writelog.writeReport(req, group, 'notesGroup');
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
exports.group_comment_add = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach(async (group) => {
      group.comments.push(req.body.comment)

      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        writelog.writeReport(req, group, 'commentAddGroup');

        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { comments: group.comments } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};

// Update group comment
exports.group_comment_update = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {
      const newData = req.body.comment
      const commentToUpdate = group.comments.id(req.body.comment._id)
      commentToUpdate.data = req.body.comment.data

      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        writelog.writeReport(req, group, 'commentEditGroup');
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { comments: group.comments } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};
// remove group comment
exports.group_comment_remove = (req, res) => {
  if (!req.body.ids || !req.body.ids.length) return res.sendStatus(200);
  Group.find({ _id: { $in: req.body.ids } }, (err, groups) => {
    if (err) return res.status(err.status).send(err.message);
    if (groups.length === 0) return res.sendStatus(200);
    let remaining = groups.length;
    groups.forEach((group) => {

      const commentToDelete = group.comments.id(req.body.comment._id).remove()


      group.save((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message);
          return;
        }
        writelog.writeReport(req, group, 'commentRemoveGroup');
        if (--remaining === 0) {
          eventRouter.publish('groups:update', { ids: req.body.ids, update: { comments: group.comments } }).then(() => {
            return res.sendStatus(200)
          });
        }
      });
    });
  });
};

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
            writelog.writeGroup(req, group, 'ClearTagsFromGroup');
            res.sendStatus(200);
          }
        });
      });
    });
  });
};

// Delete an Group
exports.group_delete = (req, res, next) => {
  if (req.params._id === '_all') return next();
  Group.findById(req.params._id, (err, group) => {
    if (err) return res.status(err.status).send(err.message);
    if (!group) return res.sendStatus(404);
    group.remove((err) => {
      if (err) {
        return res.status(err.status).send(err.message);
      }
      writelog.writeGroup(req, group, 'deleteGroup');

      eventRouter.publish('groups:delete', group).then(() => {
        res.sendStatus(200);
      });
    });
  });
};

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
        writelog.writeGroup(req, group, 'deleteGroup');
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
