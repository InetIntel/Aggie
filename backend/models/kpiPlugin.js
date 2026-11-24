'use strict';

const { capture } = require('../api/utils/kpiContext');

// Save hooks cover account provisioning, normal incident creation, dashboard
// incident creation, and both individual and bulk report operations.
function activityEvents(doc, entity) {
  const subject = String(doc._id);
  if (entity === 'user') return doc.isNew ? [{ kind: 'signup', subject }] : [];
  if (entity === 'group') return doc.isNew ? [{ kind: 'incident_created', subject }] : [];
  if (doc.isNew) return []; // Ingestion is not a human triage action.
  const category = doc.isOutageEvent === true ? 'alerts' : 'social';
  const events = [];
  if (doc.isModified('_group') && doc._group) events.push({ kind: 'assigned', subject, category });
  if (doc.isModified('irrelevant')) {
    if (doc.irrelevant === 'false') events.push({ kind: 'investigate', subject, category });
    if (doc.irrelevant === 'true') events.push({ kind: 'ignore', subject, category });
  }
  return events;
}

function kpiPlugin(schema, { entity, recordEvents }) {
  schema.pre('save', function () {
    this.$locals.kpiEvents = activityEvents(this, entity).map((event) => ({ ...event, at: new Date() }));
    // Driver callbacks may run outside the request's async context.
    this.$locals.kpiContext = capture();
  });
  schema.post('save', async function () {
    const events = this.$locals.kpiEvents || [];
    const context = this.$locals.kpiContext;
    this.$locals.kpiEvents = [];
    delete this.$locals.kpiContext;
    await recordEvents(events, entity === 'user' ? this : undefined, context);
  });
}

module.exports = { kpiPlugin, activityEvents };
