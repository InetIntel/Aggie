// One-time (rerunnable) backfill script for importing a dataset of sanitized
// incidents (Aggie "groups") into MongoDB.
//
//   node scripts/backfill/backfill-incidents.js --file <path-to.json> [--dry-run] [--limit N]
//
// Behavior (see docs/claude/plans or the PR description for rationale):
//  - Dataset is a single .json file containing an ARRAY of incident objects.
//  - idnum is NOT imported; mongoose-sequence auto-assigns a fresh one on insert.
//  - Idempotent: skips an incident that already exists (dedup key auto-detected,
//    see resolveDedup()).
//  - Links each incident to reports that ALREADY exist in the DB, wiring both
//    group._reports and report._group. Reports already belonging to a different
//    group are logged as conflicts and left untouched (see REASSIGN_GROUPED_REPORTS).
//
// NOTE on require paths: this file lives in scripts/backfill/, so backend modules
// are two levels up (unlike the sibling backfill-reports-*.js files, which use
// "../database" and only resolve from a backend/ cwd).

"use strict";

require("dotenv").config();

const fs = require("fs");
const database = require("../../backend/database"); // side-effect: connects mongoose
const mongoose = database.mongoose;
const Group = require("../../backend/models/group");
const Report = require("../../backend/models/report");

const ObjectId = mongoose.Types.ObjectId;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROGRESS_EVERY = 50;

// comments[].author is a REQUIRED User ref; sanitized data usually lacks it, so
// importing comments would fail validation. Flip to true only if the dataset
// carries valid author ObjectIds.
const IMPORT_COMMENTS = false;

// If a referenced report already belongs to a DIFFERENT group, leave it alone by
// default rather than clobbering existing grouping. Flip to true to reassign.
const REASSIGN_GROUPED_REPORTS = false;

// Whitelist of Group fields copied from each record. idnum/creator/assignedTo/
// reportsLength/commentsLength/_reports/comments are handled separately.
const GROUP_FIELDS = [
  "title",
  "locationName",
  "latitude",
  "longitude",
  "incidentStartedAt",
  "incidentEndedAt",
  "incidentDurationSeconds",
  "impactedAsns",
  "impactedGeoScopes",
  "tags",
  "status",
  "verification_status",
  "confirmation_status",
  "publication_status",
  "escalated",
  "closed",
  "public",
  "publicDescription",
  "notes",
];

const DATE_FIELDS = new Set([
  "incidentStartedAt",
  "incidentEndedAt",
  "storedAt",
  "updatedAt",
]);

// Enum-constrained fields: an out-of-enum value is dropped (schema default
// applies) rather than allowed to blow up validation.
const ENUMS = {
  status: ["new", "working", "alert", "closed"],
  verification_status: ["false", "true", "maybe"],
  confirmation_status: ["false", "true", "maybe"],
};
const PUBLICATION_ENUM = ["Not Published", "Published", "Shared with Networks"];

// Candidate field names that may hold the report references on a record.
const REPORT_REF_KEYS = ["_reports", "reports", "reportIds", "report_ids"];

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { file: null, dryRun: false, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--file") args.file = argv[++i];
    else if (a.startsWith("--file=")) args.file = a.slice("--file=".length);
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a.startsWith("--limit=")) args.limit = parseInt(a.slice("--limit=".length), 10);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Value normalizers (tolerant of plain JSON and extended-JSON $oid/$date)
// ---------------------------------------------------------------------------

// Extract an ObjectId (or null) from a string, {$oid}, {_id}, or existing id.
function toObjectId(v) {
  if (v == null) return null;
  if (v instanceof ObjectId) return v;
  let raw = v;
  if (typeof v === "object") {
    if (v.$oid) raw = v.$oid;
    else if (v._id) return toObjectId(v._id);
    else return null;
  }
  if (typeof raw !== "string") raw = String(raw);
  return ObjectId.isValid(raw) ? new ObjectId(raw) : null;
}

// Coerce a string / number / {$date} into a Date, or null.
function toDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  let raw = v;
  if (typeof v === "object" && v.$date != null) raw = v.$date;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Record -> Group doc
// ---------------------------------------------------------------------------

function buildGroupDoc(record, warnings) {
  const doc = {};

  for (const key of GROUP_FIELDS) {
    if (!(key in record) || record[key] == null) continue;
    let value = record[key];

    if (DATE_FIELDS.has(key)) {
      const d = toDate(value);
      if (d) doc[key] = d;
      else warnings.push(`invalid date for ${key}: ${JSON.stringify(value)}`);
      continue;
    }

    if (key in ENUMS) {
      if (ENUMS[key].includes(value)) doc[key] = value;
      else warnings.push(`dropped out-of-enum ${key}=${JSON.stringify(value)}`);
      continue;
    }

    if (key === "publication_status") {
      const arr = (Array.isArray(value) ? value : [value]).filter((v) =>
        PUBLICATION_ENUM.includes(v)
      );
      if (arr.length) doc[key] = arr;
      continue;
    }

    doc[key] = value;
  }

  // storedAt: preserve original if present, else pre-save hook stamps now.
  if (record.storedAt) {
    const d = toDate(record.storedAt);
    if (d) doc.storedAt = d;
  }

  // Reuse the original _id when the sanitized record retains one — most robust
  // idempotency key, and keeps any already-linked report._group pointers valid.
  const origId = toObjectId(record._id);
  if (origId) doc._id = origId;

  if (IMPORT_COMMENTS && Array.isArray(record.comments)) {
    const comments = record.comments.filter((c) => toObjectId(c && c.author));
    if (comments.length !== (record.comments || []).length) {
      warnings.push("some comments dropped (missing/invalid author)");
    }
    if (comments.length) {
      doc.comments = comments.map((c) => ({
        data: c.data,
        author: toObjectId(c.author),
        attachments: Array.isArray(c.attachments) ? c.attachments : [],
      }));
    }
  }

  return doc;
}

// Pull report references off a record, from whichever candidate key holds them.
function extractReportIds(record) {
  for (const key of REPORT_REF_KEYS) {
    const val = record[key];
    if (Array.isArray(val) && val.length) {
      return val.map(toObjectId).filter(Boolean);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

// Returns a mongo filter that identifies an already-imported incident, or null
// if we can't build one (record then always inserts).
function resolveDedup(record, doc) {
  if (doc._id) return { _id: doc._id };
  if (doc.title && doc.incidentStartedAt) {
    return { title: doc.title, incidentStartedAt: doc.incidentStartedAt };
  }
  if (doc.title) return { title: doc.title };
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const args = parseArgs(process.argv);

  if (!args.file) {
    throw new Error("Missing required --file <path-to.json>");
  }

  const raw = fs.readFileSync(args.file, "utf8");
  const parsed = JSON.parse(raw);
  const records = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed && parsed.data)
    ? parsed.data
    : null;

  if (!records) {
    throw new Error("Dataset is not a JSON array (or {data: [...]}).");
  }

  const limit = Number.isFinite(args.limit) ? Math.min(args.limit, records.length) : records.length;

  console.log(
    `[INCIDENT-BACKFILL] file=${args.file} records=${records.length} processing=${limit} dryRun=${args.dryRun}`
  );

  const summary = {
    processed: 0,
    inserted: 0,
    skipped: 0,
    reportsLinked: 0,
    conflicts: 0,
    validationFailures: 0,
  };

  for (let i = 0; i < limit; i++) {
    const record = records[i];
    summary.processed++;

    const warnings = [];
    try {
      const doc = buildGroupDoc(record, warnings);

      if (!doc.title) {
        summary.validationFailures++;
        console.warn(`[INCIDENT-BACKFILL] record #${i} skipped: missing title`);
        continue;
      }

      // --- idempotency ---
      const dedup = resolveDedup(record, doc);
      if (dedup) {
        const existing = await Group.findOne(dedup).select("_id").lean();
        if (existing) {
          summary.skipped++;
          continue;
        }
      }

      // --- resolve report links against the CURRENT db ---
      const wantedIds = extractReportIds(record);
      let existingReports = [];
      if (wantedIds.length) {
        existingReports = await Report.find({ _id: { $in: wantedIds } })
          .select("_id _group")
          .lean();
      }

      const reuseId = !!doc._id;
      const conflicts = REASSIGN_GROUPED_REPORTS
        ? []
        : existingReports.filter(
            (r) => r._group && (reuseId ? String(r._group) !== String(doc._id) : true)
          );
      const conflictSet = new Set(conflicts.map((r) => String(r._id)));
      const linkable = existingReports.filter((r) => !conflictSet.has(String(r._id)));

      doc._reports = linkable.map((r) => r._id);
      summary.conflicts += conflicts.length;

      if (conflicts.length) {
        console.warn(
          `[INCIDENT-BACKFILL] record #${i} ("${doc.title}") has ${conflicts.length} report(s) already grouped elsewhere; left untouched`
        );
      }
      if (warnings.length) {
        console.warn(`[INCIDENT-BACKFILL] record #${i} ("${doc.title}") warnings: ${warnings.join("; ")}`);
      }

      if (args.dryRun) {
        summary.inserted++; // "would insert"
        summary.reportsLinked += linkable.length; // "would link"
        continue;
      }

      // --- insert (pre-save hook assigns idnum, storedAt/updatedAt, lengths) ---
      const group = await new Group(doc).save();
      summary.inserted++;

      // --- back-link reports ---
      if (linkable.length) {
        const res = await Report.updateMany(
          { _id: { $in: linkable.map((r) => r._id) } },
          { $set: { _group: group._id } }
        );
        summary.reportsLinked += res.modifiedCount ?? res.nModified ?? linkable.length;
      }
    } catch (err) {
      summary.validationFailures++;
      const label = (record && (record._id || record.title)) || `#${i}`;
      console.error(`[INCIDENT-BACKFILL] record ${label} failed:`, err.message);
    }

    if (summary.processed % PROGRESS_EVERY === 0) {
      console.log(
        `[INCIDENT-BACKFILL] progress: ${JSON.stringify(summary)}`
      );
    }
  }

  console.log("[INCIDENT-BACKFILL] Done.");
  console.log(`[INCIDENT-BACKFILL] Summary: ${JSON.stringify(summary, null, 2)}`);
}

async function main() {
  try {
    await run();
  } catch (err) {
    console.error("[INCIDENT-BACKFILL] Fatal error:", err);
    process.exitCode = 1;
  } finally {
    if (mongoose && mongoose.connection) {
      await mongoose.connection.close();
    }
  }
}

if (require.main === module) {
  main();
}
