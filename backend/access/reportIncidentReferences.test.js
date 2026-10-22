'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { stripIncidentReferences } = require('./reportIncidentReferences');

test('restricted incident ids are removed without hiding the report', () => {
  const response = {
    total: 2,
    results: [
      { _id: 'report-a', _group: 'incident-visible' },
      { _id: 'report-b', _group: 'incident-hidden', content: 'still visible' },
    ],
  };

  const sanitized = stripIncidentReferences(response, ['incident-visible']);

  assert.equal(sanitized.total, 2);
  assert.equal(sanitized.results[0]._group, 'incident-visible');
  assert.equal(sanitized.results[1]._group, undefined);
  assert.equal(sanitized.results[1].content, 'still visible');
});

test('export-shaped report collections are sanitized', () => {
  const sanitized = stripIncidentReferences(
    { reports: [{ _id: 'report-a', _group: 'incident-hidden' }] },
    []
  );

  assert.equal(sanitized.reports[0]._group, undefined);
});
