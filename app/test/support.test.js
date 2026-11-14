'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSupportUrl } = require('../src/core/support');

test('accepts localhost http and remote https support links', () => {
  assert.equal(normalizeSupportUrl('http://127.0.0.1:52188'), 'http://127.0.0.1:52188/');
  assert.equal(normalizeSupportUrl('http://localhost:52188/session/abc'), 'http://localhost:52188/session/abc');
  assert.equal(normalizeSupportUrl('https://support.example/session/1'), 'https://support.example/session/1');
  assert.equal(normalizeSupportUrl(''), null);
});

test('rejects unsafe or malformed support links', () => {
  assert.throws(() => normalizeSupportUrl('ftp://example.com/x'));
  assert.throws(() => normalizeSupportUrl('http://example.com/x'));
  assert.throws(() => normalizeSupportUrl('https://user:pass@example.com/x'));
  assert.throws(() => normalizeSupportUrl('not a url'));
  assert.throws(() => normalizeSupportUrl(`https://example.com/${'x'.repeat(600)}`));
});
