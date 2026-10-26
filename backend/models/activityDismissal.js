'use strict';
// A notable activity dismissed from the dashboard, shared by every user.
//
// Kept apart from NotableActivity because those snapshots expire and get recomputed,
// which would drop the dismissal. Keyed on eventAggKey alone (not cacheKey) so it holds
// across every date range the activity shows up in; the key already encodes the
// grouping and start-time tolerance, so each tolerance keeps its own dismissals.

const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;
const SchemaTypes = mongoose.SchemaTypes;

const activityDismissalSchema = new Schema({
  eventAggKey: { type: String, required: true, unique: true },
  dismissedBy: { type: SchemaTypes.ObjectId, ref: 'User', default: null },
  dismissedAt: { type: Date, required: true, default: Date.now },
});

const ActivityDismissal = mongoose.model('ActivityDismissal', activityDismissalSchema);

module.exports = ActivityDismissal;
