'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EXTERNAL_PACK, EXTERNAL_PACK_BY_ID, publicPack } = require('../src/core/external-pack');

test('external pack pins every file by size and SHA-256', () => {
  assert.equal(EXTERNAL_PACK.length, 5);
  const destinations = new Set();
  for (const entry of EXTERNAL_PACK) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, entry.id);
    assert.ok(entry.bytes > 100000, entry.id);
    assert.ok(entry.urls.length >= 1, entry.id);
    assert.ok(entry.destinations.length >= 1, entry.id);
    assert.ok(entry.itemIds.length >= 1, entry.id);
    for (const destination of entry.destinations) {
      assert.ok(!destinations.has(destination), `duplicate destination ${destination}`);
      destinations.add(destination);
    }
  }
  assert.deepEqual(destinations, new Set([
    'unlock/Huawei865870_devprg.elf',
    'unlock/Huawei865870_abl_unlock.img',
    'tools/QSaharaServer.exe',
    'tools/fh_loader.exe',
    'tools/driver/adbdriver.exe',
    'tools/driver/qcdriver.exe',
  ]));
});

test('specific known-good signed images and compatible fh_loader are pinned', () => {
  assert.equal(EXTERNAL_PACK_BY_ID.get('firehose').sha256, 'a0e08a0a26b1356e04fb3b3097c70237a2e3e0861dbd1a99cafbab4f5adc7c9d');
  assert.equal(EXTERNAL_PACK_BY_ID.get('abl_unlock').sha256, '552e96d2565627563b7f2b072f720efd048abdf11fa050959aec55e7d3f0b79d');
  assert.equal(EXTERNAL_PACK_BY_ID.get('firehose').bytes, 697648);
  assert.equal(EXTERNAL_PACK_BY_ID.get('abl_unlock').bytes, 602112);
  const fh = EXTERNAL_PACK_BY_ID.get('fh_loader');
  assert.equal(fh.bytes, 485888);
  assert.match(fh.note, /skip_configure/);
  const drivers = EXTERNAL_PACK_BY_ID.get('drivers');
  assert.deepEqual(drivers.destinations, ['tools/driver/adbdriver.exe', 'tools/driver/qcdriver.exe']);
});

test('publicPack hides raw URLs but exposes source and hash', () => {
  const pub = publicPack();
  assert.equal(pub.length, 5);
  for (const entry of pub) {
    assert.ok(entry.source);
    assert.ok(entry.sourceUrl.startsWith('https://'));
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(entry.urls, undefined);
  }
});
