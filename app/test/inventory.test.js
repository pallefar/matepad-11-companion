'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  ITEMS,
  matchImportedFile,
  requiredItems,
  recommendedItems,
  summarize,
  safeJoin,
  groupItems,
} = require('../src/core/inventory');

test('required sets differ correctly between APatch and Magisk', () => {
  const apatch = requiredItems('apatch').map((item) => item.id);
  const magisk = requiredItems('magisk').map((item) => item.id);
  assert.ok(apatch.includes('devprg'));
  assert.ok(apatch.includes('kptools'));
  assert.ok(apatch.includes('apatch_apk'));
  assert.ok(!apatch.includes('magisk_apk'));
  assert.ok(!apatch.includes('ramdisk'));
  assert.ok(magisk.includes('magisk_apk'));
  assert.ok(magisk.includes('ramdisk'));
  assert.ok(!magisk.includes('apatch_apk'));
  assert.ok(!magisk.includes('kptools'));
});

test('tool pack names map to canonical destinations', () => {
  const mappings = [
    ['adb.exe', 'adb'],
    ['platform-tools/fastboot.exe', 'fastboot'],
    ['7za.exe', '7zip'],
    ['QSaharaServer.exe', 'qsahara'],
    ['fh_loader.exe', 'fh_loader'],
    ['kptools-x86_64-win.exe', 'kptools'],
    ['kpimg-android', 'kpimg'],
    ['Magisk-v31.1.apk', 'magisk_apk'],
    ['APatch_11282_e8e4651_HEAD-release-signed.apk', 'apatch_apk'],
    ['Huawei865870_devprg.elf', 'devprg'],
    ['Huawei865870_abl_unlock.img', 'abl_unlock'],
    ['rawprogram0.xml', 'rawprogram0'],
    ['rawprogram_vbmeta.xml', 'rawprogram_vbmeta'],
    ['misc.img', 'misc'],
    ['HiSuite Proxy V3.exe', 'hisuite_proxy'],
  ];
  for (const [name, id] of mappings) {
    const match = matchImportedFile(name);
    assert.ok(match, `expected ${name} to match`);
    assert.equal(match.item.id, id, name);
  }
  assert.equal(matchImportedFile('README.md'), null);
  assert.equal(matchImportedFile('random.apk'), null);
});

test('APK matching is case-insensitive and maps app-debug.apk to Magisk', () => {
  assert.equal(matchImportedFile('MAGISK.APK').item.id, 'magisk_apk');
  assert.equal(matchImportedFile('app-debug.apk').item.id, 'magisk_apk');
  assert.equal(matchImportedFile('something-APATCH.apk').item.id, 'apatch_apk');
});

test('summarize reports required missing items and ramdisk count', () => {
  const items = ITEMS.map((item) => ({
    ...item,
    present: ['adb', 'fastboot', '7zip'].includes(item.id),
    bytes: 1,
  }));
  const summary = summarize(items, 'apatch', { ramdiskCount: 0 });
  assert.equal(summary.requiredCount, 10);
  assert.equal(summary.requiredPresent, 3);
  assert.equal(summary.requiredMissing.length, 7);
  assert.ok(summary.requiredMissing.some((item) => item.id === 'devprg'));

  const magiskSummary = summarize(items, 'magisk');
  assert.ok(magiskSummary.requiredMissing.some((item) => item.id === 'ramdisk'));
});

test('safeJoin blocks traversal and absolute paths', () => {
  const root = path.resolve('/tmp/workspace');
  assert.equal(safeJoin(root, 'tools/adb.exe'), path.join(root, 'tools/adb.exe'));
  assert.throws(() => safeJoin(root, '../escape.exe'), /escapes root/);
  assert.throws(() => safeJoin(root, '/etc/passwd'), /absolute/);
  assert.throws(() => safeJoin(root, 'C:\\Windows\\system32\\cmd.exe'), /absolute/);
});

test('groups expose only non-empty categories and keep order', () => {
  const groups = groupItems(ITEMS.map((item) => ({ ...item, present: true })));
  assert.equal(groups[0].id, 'core');
  assert.ok(groups.some((group) => group.id === 'unlock'));
  assert.ok(groups.every((group) => group.items.length > 0));
});
