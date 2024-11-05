// An group is an occurrence that is being monitored by the team.
// It is generally associated with one or more reports.
// Other metadata is stored with the group to assist tracking.
// This class is responsible for executing GroupQuerys.
/* eslint-disable no-invalid-this */
'use strict';

const database = require('../database');
const mongoose = database.mongoose;
const SchemaTypes = mongoose.SchemaTypes;
const validator = require('validator');
const _ = require('lodash');
const AutoIncrement = require('mongoose-sequence')(mongoose);
const Report = require('./report');
require('./tag');

require('../error');

const lengthValidator = function (str) {
  return validator.isLength(str, { min: 0, max: 42 });
};

let schema = new mongoose.Schema({
  title: { type: String, required: true },
  locationName: String,
  latitude: Number,
  longitude: Number,
  updatedAt: Date,
  storedAt: { type: Date, index: true },
  tags: { type: [String], default: [] },
  assignedTo: { type: [mongoose.Schema.ObjectId], ref: 'User', index: 1 },
  smtcTags: {
    type: [{ type: SchemaTypes.ObjectId, ref: 'SMTCTag' }],
    default: [],
  },
  creator: { type: mongoose.Schema.ObjectId, ref: 'User', index: 1 },
  status: { type: String, default: 'new', required: true },
  veracity: {
    type: String,
    default: 'Unconfirmed',
    enum: ['Unconfirmed', 'Confirmed True', 'Confirmed False'],
  },
  escalated: { type: Boolean, default: false, required: true, index: 1 },
  closed: { type: Boolean, default: false, required: true, index: 1 },
  public: { type: Boolean, default: true, required: true, index: 1 },
  publicDescription: String,
  _reports: {
    type: [{ type: SchemaTypes.ObjectId, ref: 'Report' }],
    default: [],
  },
  notes: String,
  comments: [new mongoose.Schema({

    data: String,
    author: { type: mongoose.Schema.ObjectId, ref: 'User' },

  }, { timestamps: true })]
});

schema.plugin(AutoIncrement, { inc_field: 'idnum' });

// index for full text search
schema.index({ title: 'text', locationName: "text", notes: "text", idnum: "text" })

schema.pre('save', function (next) {
  if (this.isNew) this.storedAt = new Date();
  this.updatedAt = new Date();
  if (!_.includes(Group.statusOptions, this.status)) {
    return next(new Error.Validation('status_error'));
  }

  next();
});

schema.post('save', function () {
  schema.emit('group:save', { _id: this._id.toString() });
});

schema.post('remove', function () {
  // Unlink removed group from reports
  Report.find({ _group: this._id.toString() }, function (err, reports) {
    if (err) {
      console.error(err);
    }
    reports.forEach(function (report) {
      report._group = null;
      report.save();
    });
  });
});

schema.methods.setVeracity = function (veracity) {
  this.veracity = veracity;
};

schema.methods.setEscalated = function (escalated) {
  this.escalated = escalated;
};
schema.methods.setAssigned = function (assignedTo) {
  this.assignedTo = assignedTo;
};
schema.methods.setPublic = function (pub) {
  this.public = pub;
};
schema.methods.addSMTCTag = function (smtcTagId, callback) {
  // TODO: Use Functional Programming
  // ML This finds the smtcTag to add (if it doesn't exists) then add it.
  let isRepeat = false;
  this.smtcTags.forEach(function (tag) {
    if (smtcTagId === tag.toString()) {
      isRepeat = true;
    }
  });
  if (isRepeat === false) {
    this.smtcTags.push({ _id: smtcTagId });
  }
  callback();
};

schema.methods.removeSMTCTag = function (smtcTagId, callback) {
  // TODO: Use Functional Programming
  // ML This finds the smtcTag to remove (if it exists) then remove it.
  if (this.smtcTags) {
    let fndIndex = -1;
    this.smtcTags.forEach(function (tag, index) {
      let string = tag.toString();
      if (smtcTagId === tag.toString()) {
        fndIndex = index;
      }
    });
    if (fndIndex !== -1) {
      this.smtcTags.splice(fndIndex, 1);
    }
  }
  callback();
};

schema.methods.clearSMTCTags = function (callback) {
  const cb = () => {
    this.smtcTags = [];
    callback();
  };

  if (!this.commentTo) {
    var remaining = this.smtcTags.length;
    this.smtcTags.forEach((tag) => {
      const tagId = tag.toString();
      this.removeSMTCTag(tagId, (err) => {
        if (err) {
          console.error(err);
        }
        if (--remaining === 0) {
          cb();
        }
      });
    });
    return;
  }
  cb();
};

var Group = mongoose.model('Group', schema);

/* We need to be able to find Groups by smtcTag Id
SMTCTag.schema.on('tag:removed', function(id) {
  Group.find({smtcTags: id}, function(err, reports) {
    if (err) {
      console.error(err);
    }
    reports.forEach(function(report) {
      report.removeSMTCTag(id, () => {
        report.save();
      })
    });
  });
})*/

// Query groups based on passed query data
Group.queryGroups = function (query, page, options, callback) {
  if (typeof query === 'function') return Group.findPage(query);
  if (typeof page === 'function') {
    callback = page;
    page = 0;
    options = {};
  }

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (page < 0) page = 0;

  var filter = {};
  options.limit = 100;

  // Create filter object
  Group.filterAttributes.forEach(function (attr) {
    //todo: fix this bs
    if (attr === "assignedTo" && query[attr] === "none") return;
    if (!_.isUndefined(query[attr])) filter[attr] = query[attr];
  });

  // Return only newer results
  if (query.since) {
    filter.storedAt = filter.storedAt || {};
    filter.storedAt.$gte = query.since;
  }

  // hide not public
  filter.public = true;

  // find empty assignedTo objects
  if (query.assignedTo === 'none') {
    const prevOr = filter.$or || []
    filter.$or = [...prevOr, { assignedTo: { $eq: null } }, { assignedTo: { $size: 0 } }]
  }


  if (query.veracity === 'confirmed true') filter.veracity = 'Confirmed True';
  if (query.veracity === 'confirmed false') filter.veracity = 'Confirmed False';
  if (query.veracity === 'unconfirmed') filter.veracity = 'Unconfirmed';

  // default filter open
  filter.closed = false;
  if (query.closed === 'all') delete filter.closed
  if (query.closed === 'true') filter.closed = true;
  delete filter.status;


  if (query.escalated === 'escalated') filter.escalated = true;
  if (query.escalated === 'unescalated') filter.escalated = false;

  if (query.public === 'public') filter.public = true;
  if (query.public === 'private') filter.public = false;

  // Search for substrings
  // if query has hashtag number, search group id eg, "#10"
  if (query.title) {
    if (query.title.startsWith("#")) {
      const getFirst = query.title.split(" ").find(i => i)
      const numberString = getFirst.replace("#", "").trim()
      const number = _.toSafeInteger(numberString);
      if (number > 0) {
        delete filter.title;
        filter.idnum = number

      } else {
        filter.$text = { $search: query.title }
        delete filter.title;
      }
    } else {
      // filter.title = new RegExp(query.title, 'i');
      filter.$text = { $search: query.title }
      delete filter.title;
    }

  }
  else delete filter.title;
  if (query.locationName)
    filter.locationName = new RegExp(query.locationName, 'i');
  else delete filter.locationName;

  // Checking for multiple tags in group
  if (filter.tags) {
    filter.smtcTags = { $all: filter.tags };
    delete filter.tags;
  }
  // Re-set search timestamp
  query.since = new Date();
  console.log(JSON.stringify(filter))
  // Just use filters when no keywords are provided
  Group.findPage(filter, page, options, callback);
};

// Mixin shared group methods
var Shared = require('../shared/group');
for (var staticVar in Shared) Group[staticVar] = Shared[staticVar];
for (var proto in Shared.prototype) schema.methods[proto] = Shared[proto];

module.exports = Group;
