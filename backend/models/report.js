// A report is a single post/comment/article or other chunk of data from a source.
// This class is responsible for executing ReportQuerys.
const database = require("../database");
const mongoose = database.mongoose;
const AutoIncrement = require("mongoose-sequence")(mongoose);
const Schema = mongoose.Schema;
const SchemaTypes = mongoose.SchemaTypes;
const SMTCTag = require("./tag");
const { addPost, removePost } = require("../comments");
const { strict } = require("assert");

let schema = new Schema({
  authoredAt: { type: Date, index: true },
  fetchedAt: { type: Date, index: true },
  storedAt: { type: Date, index: true },
  isOutageEvent: { type: Boolean, index: true },
  isAsnScoped: { type: Boolean, index: true },
  asn: { type: String },
  outageStartedAt: { type: Date },
  outageEndedAt: { type: Date },
  geoScope: { type: String },
  eventIdentifier: { type: String }, // an identifier derived from asn, geoScope, and outageStartedAt
  eventAggKeyBase: { type: String }, // an aggregation key base, derived from asn and geoScope, combined with dynamic time interval bucket in aggregation layer
  content: { type: String },
  author: { type: String },
  veracity: {
    type: String,
    default: "Unconfirmed",
    enum: ["Unconfirmed", "Confirmed True", "Confirmed False"],
    index: true,
  },
  url: { type: String },
  guid: { type: String, index: true, unique: true },
  metadata: Schema.Types.Mixed,
  smtcTags: {
    type: [{ type: SchemaTypes.ObjectId, ref: "SMTCTag" }],
    default: [],
  },
  hasSMTCTags: { type: Boolean, default: false, required: true, index: true },
  closed: { type: Boolean, default: false, required: true },
  read: { type: Boolean, default: false, required: true, index: true },
  _sources: [{ type: String, ref: "Source", index: true }],
  _media: { type: [String], index: true },
  _sourceNicknames: [String],
  _group: { type: SchemaTypes.ObjectId, ref: "Group", index: true },
  checkedOutBy: { type: Schema.ObjectId, ref: "User", index: true },
  checkedOutAt: { type: Date, index: true },
  commentTo: { type: Schema.ObjectId, ref: "Report", index: true },
  notes: { type: String },
  escalated: { type: Boolean, default: false, required: true, index: true },
  content_lang: { type: String },
  irrelevant: {
    type: String,
    default: "maybe",
    required: false,
    enum: ["false", "true", "maybe"],
    index: true,
  },
  aitags: {
    type: Map,
    of: SchemaTypes.Mixed,
    default: {},
  },
  aitags_feedback: [
    {
      type: Map,
      of: SchemaTypes.Mixed,
      default: {},
    },
  ],
  aitagnames: { type: [String], default: [] },
  red_flag: { type: Boolean, default: false, index: true },
});

// schema.index({ 'metadata.ct_tag': 1 }, { background: true });
// Add fulltext index to the `content` and `author` field.

schema.index({ author: "text", content: "text" });
schema.index({ geoScope: 1 });
schema.index({ outageStartedAt: 1 });
schema.index({ outageEndedAt: 1 });
schema.index({ irrelevant: 1 });
schema.index({ eventIdentifier: 1 }, { sparse: true }); // sparse index (i.e. only docs with field are indexed)
schema.index({ isOutageEvent: 1, authoredAt: -1 }); // alerts list: match + sort + limit without in-memory sort
schema.index({ eventAggKeyBase: 1 }, { sparse: true });
schema.path("_group").set(function (_group) {
  this._prevGroup = this._group;
  return _group;
});

// sets the indexed hasSMTCTags boolean
schema.pre("save", function (next) {
  this.hasSMTCTags = this.smtcTags.length > 0;
  next();
});

schema.pre("save", function (next) {
  if (this.isNew) {
    this._wasNew = true;
    // Set default storedAt.
    if (!this.storedAt) this.storedAt = new Date();
  } else {
    // Capture updates before saving report
    if (this.isModified("_group")) {
      this._groupWasModified = true;
    }
  }
  next();
});

// Emit information about updates after saving report
schema.post("save", function () {
  if (this._wasNew) schema.emit("report:new", { _id: this._id.toString() });
  if (!this._wasNew) schema.emit("report:updated", this);
  if (this._groupWasModified) {
    schema.emit("change:group", this._prevGroup, this._group);
  }
});

schema.methods.setReadStatus = function (readStatus) {
  this.read = readStatus;
};

schema.methods.setVeracity = function (veracity) {
  this.veracity = veracity;
};

schema.methods.setEscalated = function (escalated) {
  this.escalated = escalated;
};

schema.methods.setIrrelevant = function (irrelevant) {
  this.irrelevant = irrelevant;
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
    this.read = true;
    // Only send a post to the acquisition API if it is a) not a comment b) a FB post and c) not a group post
    if (
      !this.commentTo &&
      this._media[0] === "facebook" &&
      !this.url.match(/permalink/)
    ) {
      SMTCTag.findById(smtcTagId, (err, tag) => {
        if (err) {
          console.error(err);
        }
        if (tag.isCommentTag) {
          addPost(this.url, callback);
        } else {
          callback();
        }
      });
      return;
    }
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

      if (!this.commentTo && this._media[0] === "facebook") {
        SMTCTag.findById(smtcTagId, (err, tag) => {
          if (err) {
            console.error(err);
          }
          if (tag.isCommentTag) {
            removePost(this.url, callback);
          } else {
            callback();
          }
        });
        return;
      }
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
    let remaining = this.smtcTags.length;
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
// schema.plugin(AutoIncrement, { inc_field: 'reportId' });
const Report = mongoose.model("Report", schema);

SMTCTag.schema.on("tag:removed", function (id) {
  Report.find({ smtcTags: id }, function (err, reports) {
    if (err) {
      console.error(err);
    }
    reports.forEach(function (report) {
      report.removeSMTCTag(id, () => {
        report.save();
      });
    });
  });
});

// queryReports reports based on passed query data
Report.queryReports = function (query, page, callback) {
  if (typeof query === "function") return Report.findPage(query);
  if (typeof page === "function") {
    callback = page;
    page = 0;
  }
  if (page === undefined || page === null || Number.isNaN(Number(page)))
    page = 0;
  if (page < 0) page = 0;

  const filter = query.toMongooseFilter();

  // Re-set search timestamp
  query.since = new Date();

  if (query.escalated === "escalated") filter.escalated = true;
  if (query.escalated === "unescalated") filter.escalated = false;
  if (query.veracity === "confirmed true") filter.veracity = "Confirmed True";
  if (query.veracity === "confirmed false") filter.veracity = "Confirmed False";
  if (query.veracity === "unconfirmed") filter.veracity = "Unconfirmed";

  // console.log(JSON.stringify(filter))

  // if (!!query.keywords) {
  //   const keywordsToFilter = ["content", "author"]
  //   const orArray = keywordsToFilter.map(i => {
  //     return { [i]: new RegExp(query.keywords, 'i') }
  //   })
  //   const prevOr = filter.$or || []
  //   filter.$or = [...prevOr, ...orArray]
  // }
  // delete query.keywords

  Report.findSortedPage(filter, page, callback);
};

// Dedup reports based on eventidentifier(if exist), general findPage() does not apply to this
Report.queryReportsDeduped = async function (query, page, callback) {
  if (typeof page === "function") {
    callback = page;
    page = 0;
  }

  let result;
  try {
    if (page === undefined || page === null || Number.isNaN(Number(page)))
      page = 0;
    if (page < 0) page = 0;

    const filter = query.toMongooseFilter();

    // same extra filters as queryReports
    if (query.escalated === "escalated") filter.escalated = true;
    if (query.escalated === "unescalated") filter.escalated = false;
    if (query.veracity === "confirmed true") filter.veracity = "Confirmed True";
    if (query.veracity === "confirmed false")
      filter.veracity = "Confirmed False";
    if (query.veracity === "unconfirmed") filter.veracity = "Unconfirmed";

    // TODO: can i import this from perPage?
    const PAGE_LIMIT = 50; // Note: This should be the same as `perPage` in config.js.

    const targetUnique = (page + 1) * PAGE_LIMIT;
    // TODO: when more than half the fetched rows are duplicates, deep pages come
    // back short while `total` promises more.
    const rawFetchLimit = targetUnique * 2; // fetch extra rows, worst case 2 * page size

    // Abort slow queries well before API_REQUEST_TIMEOUT so the HTTP timeout
    // middleware never responds first and the late result double-sends.
    const QUERY_TIME_LIMIT_MS = 30000;

    const [rawReports, countRows] = await Promise.all([
      // fetch raw candidates
      // IODA chart SVGs now live in media storage (metadata.rawAPIResponse.image holds
      // a small key, not the inline SVG), so list rows are cheap to ship in full.
      Report.find(filter)
        .sort({ authoredAt: -1 })
        .limit(rawFetchLimit)
        .maxTimeMS(QUERY_TIME_LIMIT_MS)
        .lean(),
      // Deduped total: identified reports count once per distinct eventIdentifier;
      // reports without one (missing, null, or '') share the null bucket and count
      // per-doc, matching the `!key` handling in the dedup loop below.
      Report.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              $cond: [
                { $in: [{ $ifNull: ["$eventIdentifier", null] }, [null, ""]] },
                null,
                "$eventIdentifier",
              ],
            },
            c: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $cond: [{ $eq: ["$_id", null] }, "$c", 1] } },
          },
        },
        { $project: { _id: 0, total: 1 } },
      ]).option({ maxTimeMS: QUERY_TIME_LIMIT_MS }),
    ]);

    const [{ total = 0 } = {}] = countRows;

    const seen = new Set();
    const deduped = [];

    for (const report of rawReports) {
      const key = report.eventIdentifier;

      if (!key) {
        deduped.push(report);
      } else if (!seen.has(key)) {
        seen.add(key);
        deduped.push(report);
      }

      if (deduped.length >= targetUnique) break;
    }

    const start = page * PAGE_LIMIT;
    const end = start + PAGE_LIMIT;

    result = {
      total,
      results: deduped.slice(start, end),
    };
  } catch (err) {
    return callback(err);
  }

  // Outside the main try/catch: if the callback itself throws (e.g. the response
  // was already sent by the timeout middleware), it must not re-enter callback(err)
  // or reject this async function (which would crash the api process).
  try {
    callback(null, result);
  } catch (cbErr) {
    console.error(
      "queryReportsDeduped: callback threw after results were ready:",
      cbErr.message,
    );
  }
};

Report.findSortedPage = function (filter, page, callback) {
  Report.findPage(
    filter,
    page,
    { sort: "-authoredAt" },
    function (err, reports) {
      if (err) return callback(err);
      callback(null, reports);
    },
  );
};

module.exports = Report;
