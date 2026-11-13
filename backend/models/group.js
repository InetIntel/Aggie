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
const AsnInfo = require('./asnInfo');
const User = require('./user');
const { MAX_ATTACHMENT_COUNT, MAX_ATTACHMENT_SIZE } = require('../config/models/groupConfigs');
require('./tag');

require('../error');

const lengthValidator = function (str) {
  return validator.isLength(str, { min: 0, max: 42 });
};

const publicationValidator = function (arr) {
  if (
    arr.includes("Not Published") && arr.includes("Published")) {
      return false;
    }
  return true;
}

const Attachment = new mongoose.Schema({
  fileName: { type: String, required: true},
  path: { type: String, required: true},
  serverPath: {type: String, required: true},
  mimeType: { type: String, required: true},
  fileSize: {
    type: Number,
    required: true,
    validate: {
      validator: (size) => size <= MAX_ATTACHMENT_SIZE,
      message: `Attachment must be less than ${MAX_ATTACHMENT_SIZE / 1024} kb`,
    }
  }
});

const Comment = new mongoose.Schema({
  data: { type: String, required: true},
  author: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  attachments: {
    type: [Attachment],
    default: [],
    validate: {
      validator: (arr) => arr.length <= MAX_ATTACHMENT_COUNT, 
      message: `Max ${MAX_ATTACHMENT_COUNT} attachments`,
    }
  }
}, {timestamps: true});

let schema = new mongoose.Schema({
  title: { type: String, required: true },
  locationName: String,
  latitude: Number,
  longitude: Number,
  updatedAt: Date,
  storedAt: { type: Date, index: true },
  incidentStartedAt: {type: Date, index: true},
  incidentEndedAt: { type: Date, index: true },
  incidentDurationSeconds: { type: Number, default: null },
  impactedAsns: { type: [String], default:[] },
  impactedGeoScopes:{ type: [String], default:[] },
  tags: { type: [String], default: [] },
  assignedTo: { type: [mongoose.Schema.ObjectId], ref: 'User', index: 1 },
  smtcTags: {
    type: [{ type: SchemaTypes.ObjectId, ref: 'SMTCTag' }],
    default: [],
  },
  creator: { type: mongoose.Schema.ObjectId, ref: 'User', index: 1 },
  status: { type: String, default: 'new', required: true },
  verification_status: { type: String, default: 'maybe', required: true, enum: ['false', 'true', 'maybe'], index: true },
  confirmation_status: { type: String, default: 'maybe', required: true, enum: ['false', 'true', 'maybe'], index: true },
  publication_status: {
    type: [String],
    default: ['Not Published'],
    required: true,
    enum: ['Not Published', 'Published', 'Shared with Networks'],
    validate: {
      validator: publicationValidator,
      message: 'Incident cannot be both Not Published and Published.',
    },
  },
  escalated: { type: Boolean, default: false, required: true, index: 1 },
  closed: { type: Boolean, default: false, required: true, index: 1 },
  public: { type: Boolean, default: true, required: true, index: 1 },
  accessPolicy: {
    mode: {
      type: String,
      enum: ['public', 'restricted'],
      default: 'public',
      index: true,
    },
    teams: [{
      type: SchemaTypes.ObjectId,
      ref: 'Team',
      index: true,
    }],
  },
  reportsLength: { type: Number, default: 0, required: true, index: 1 },
  commentsLength: { type: Number, default: 0, required: true, index: 1 },

  publicDescription: String,
  _reports: {
    type: [{ type: SchemaTypes.ObjectId, ref: 'Report' }],
    default: [],
  },
  notes: String,
  comments: [Comment]
});

schema.plugin(AutoIncrement, { inc_field: 'idnum' });

// index for full text search
schema.index({ title: 'text', locationName: "text", notes: "text", idnum: "text" })

schema.pre('save', function (next) {

  if (this._reports?.length !== this.reportsLength) {
    this.reportsLength = this._reports.length
  }
  if (this.comments?.length !== this.commentsLength) {
    this.commentsLength = this.comments.length
  }
  if (this.isNew) this.storedAt = new Date();
  this.updatedAt = new Date();

  // validate start date & end date when both provided and valid
  const isValidDate = (d) => (d instanceof Date && !isNaN(d));
  if (
    isValidDate(this.incidentStartedAt) &&
    isValidDate(this.incidentEndedAt) && 
    this.incidentStartedAt > this.incidentEndedAt
  ) {
    return next(new Error.Validation('Incident start date must be before end date.'));
  }

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
      report.addedToGroupAt = undefined;
      report.addedToGroupBy = undefined;
      report.pinnedInGroupAt = undefined;
      report.save();
    });
  });
});



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

schema.plugin(require('./kpiPlugin').kpiPlugin, {
  entity: 'group', recordEvents: require('../api/utils/kpiTracking').recordEvents,
});
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
  options = options || {};

  if (page < 0) page = 0;

  var filter = {};
  options.limit = 100;

  // Create filter object
  Group.filterAttributes.forEach(function (attr) {
    //todo: fix this bs
    if (attr === "assignedTo" && query[attr] === "none") return;
    if (!_.isUndefined(query[attr])) filter[attr] = query[attr];
  });

  if (query.idnum !== undefined && String(query.idnum).trim() !== '') {
    const idnum = Number(query.idnum);
    if (!Number.isSafeInteger(idnum) || idnum < 1) {
      const error = new Error('idnum must be a positive integer.');
      error.status = 400;
      return callback(error);
    }
    filter.idnum = idnum;
  }

  if (query.totalReports !== undefined && String(query.totalReports).trim() !== '') {
    const reportCount = Number(query.totalReports);
    if (!Number.isSafeInteger(reportCount) || reportCount < 0) {
      const error = new Error('totalReports must be a non-negative integer.');
      error.status = 400;
      return callback(error);
    }
    filter.reportsLength = reportCount;
  }
  delete filter.totalReports;

  if (typeof query.impactedAsn === 'string' && query.impactedAsn.trim()) {
    const values = query.impactedAsn.split(',').map((v) => v.trim()).filter(Boolean);
    const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const looksLikeAsn = (v) => /^(as)?\d+$/i.test(v);
    if (values.length === 1 && !looksLikeAsn(values[0])) {
      // free-text search: substring match
      filter.impactedAsns = new RegExp(escape(values[0]), 'i');
    } else {
      // one or more picked ASNs: exact match, with or without the "AS" prefix
      filter.impactedAsns = {
        $in: values.map((v) => new RegExp('^(as)?' + escape(v.replace(/^as/i, '')) + '$', 'i')),
      };
    }
  }

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



  // default filter open
  filter.closed = false;
  if (query.closed === 'all') delete filter.closed
  if (query.closed === 'true') filter.closed = true;
  delete filter.status;

  // Lifecycle-stage filter (multi-select, OR semantics). Strict pipeline buckets
  // matching the IncidentStatuses badge precedence: publication > confirmation > verification.
  const NOT_PUBLISHED = { publication_status: { $nin: ['Published', 'Shared with Networks'] } };
  const stagePredicates = {
    verification: { verification_status: { $in: ['maybe'] }, ...NOT_PUBLISHED },
    confirmation: { verification_status: { $in: ['true', true] }, confirmation_status: { $in: ['maybe'] }, ...NOT_PUBLISHED },
    published: { publication_status: { $in: ['Published', 'Shared with Networks'] } },
  };
  if (typeof query.stages === 'string' && query.stages.length) {
    const selected = query.stages.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return stagePredicates[s]; });
    if (selected.length) {
      // push as an $and clause so we don't clobber the assignedTo `$or` above
      filter.$and = (filter.$and || []).concat([{ $or: selected.map(function (s) { return stagePredicates[s]; }) }]);
    }
  }
  delete filter.stages;

  const statusExpression = {
    $switch: {
      branches: [
        {
          case: { $in: ['Shared with Networks', { $ifNull: ['$publication_status', []] }] },
          then: 'Shared with Networks',
        },
        {
          case: { $in: ['Published', { $ifNull: ['$publication_status', []] }] },
          then: 'Published',
        },
        {
          case: { $in: ['$confirmation_status', ['true', true]] },
          then: 'Confirmed',
        },
        {
          case: { $in: ['$confirmation_status', ['false', false]] },
          then: 'Unable to Confirm',
        },
        {
          case: { $in: ['$verification_status', ['true', true]] },
          then: 'Confirming',
        },
        {
          case: { $in: ['$verification_status', ['false', false]] },
          then: 'Unable to Verify',
        },
      ],
      default: 'Verifying Measurement',
    },
  };
  if (typeof query.tableStatus === 'string' && query.tableStatus.length) {
    const statuses = query.tableStatus.split(',').map((status) => status.trim()).filter(Boolean);
    if (statuses.length) filter.$expr = { $in: [statusExpression, statuses] };
  }
  delete filter.tableStatus;


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
    const tagOperator = filter.tagMatch === 'all' ? '$all' : '$in';
    filter.smtcTags = { [tagOperator]: filter.tags };
    delete filter.tags;
  }
  delete filter.tagMatch;
  // Re-set search timestamp
  query.since = new Date();
  console.log(JSON.stringify(filter))
  const accessFilter = options.accessFilter;
  delete options.accessFilter;
  if (accessFilter && Object.keys(accessFilter).length > 0) {
    filter = { $and: [filter, accessFilter] };
  }
  if (options.computedSort) {
    return queryGroupsByComputedValue(filter, page, options, callback, statusExpression, AsnInfo);
  }
  // Just use filters when no keywords are provided
  Group.findPage(filter, page, options, callback);
};

function queryGroupsByComputedValue(filter, page, options, callback, statusExpression, AsnInfo) {
  const pageNumber = Number(page);
  const safePage = Number.isFinite(pageNumber) && pageNumber > 0 ? Math.floor(pageNumber) : 0;
  const { field, direction } = options.computedSort;
  const computedField = field === 'tableStatus' ? '_tableStatus' : '_coverageSortValue';
  const pipeline = [{ $match: filter }];

  if (field === 'tableStatus') {
    pipeline.push({ $addFields: { [computedField]: statusExpression } });
  } else if (field === 'assignedTo') {
    pipeline.push({
      $lookup: {
        from: User.collection.name,
        let: { groupUsers: { $ifNull: ['$assignedTo', []] } },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$groupUsers'] } } },
          { $project: { username: 1 } },
        ],
        as: '_assignedUsers',
      },
    });
    pipeline.push({
      $addFields: {
        [computedField]: {
          $reduce: {
            input: {
              $map: {
                input: '$_assignedUsers',
                as: 'user',
                in: { $toLower: '$$user.username' },
              },
            },
            initialValue: '\uffff',
            in: {
              $cond: [
                { $lt: ['$$this', '$$value'] },
                '$$this',
                '$$value',
              ],
            },
          },
        },
      },
    });
  } else {
    pipeline.push({
      $lookup: {
        from: AsnInfo.collection.name,
        let: {
          groupAsns: {
            $map: {
              input: { $ifNull: ['$impactedAsns', []] },
              as: 'asn',
              in: { $toLower: '$$asn' },
            },
          },
        },
        pipeline: [
          { $match: { $expr: { $in: [{ $toLower: '$asn' }, '$$groupAsns'] } } },
          { $project: { populationCoverageDirect: 1, populationCoverageIndirect: 1 } },
        ],
        as: '_coverageAsns',
      },
    });
    const coverageField = field === 'directPopulationCoverageScore'
      ? 'populationCoverageDirect'
      : 'populationCoverageIndirect';
    const accumulator = field === 'directPopulationCoverageScore' ? '$avg' : '$max';
    pipeline.push({
      $addFields: {
        [computedField]: {
          [accumulator]: {
            $map: {
              input: '$_coverageAsns',
              as: 'coverage',
              in: `$$coverage.${coverageField}`,
            },
          },
        },
      },
    });
  }

  pipeline.push(
    { $sort: { [computedField]: direction, _id: 1 } },
    { $skip: safePage * 50 },
    { $limit: 50 },
    { $project: { _id: 1 } },
  );

  Promise.all([
    Group.countDocuments(filter).exec(),
    Group.aggregate(pipeline).exec(),
  ]).then(([total, rows]) => {
    const ids = rows.map((row) => row._id);
    if (!ids.length) return callback(null, { total, results: [] });
    return Group.find({ _id: { $in: ids } })
      .populate([
        { path: 'creator', select: 'username' },
        { path: 'assignedTo', select: 'username' },
      ])
      .exec()
      .then((groups) => {
        const byId = new Map(groups.map((group) => [String(group._id), group]));
        callback(null, {
          total,
          results: ids.map((id) => byId.get(String(id))).filter(Boolean),
        });
      });
  }).catch(callback);
}

// Mixin shared group methods
var Shared = require('../shared/group');
for (var staticVar in Shared) Group[staticVar] = Shared[staticVar];
for (var proto in Shared.prototype) schema.methods[proto] = Shared[proto];

module.exports = Group;
