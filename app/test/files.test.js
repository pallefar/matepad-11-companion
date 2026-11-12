'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { assertSafeEntryName, extractZipSafe, walkFiles } = require('../src/main/files');

test('safe ZIP names reject traversal, absolute paths and drive letters', () => {
  assert.equal(assertSafeEntryName('tools/adb.exe'), 'tools/adb.exe');
  assert.equal(assertSafeEntryName('tools\\adb.exe'), 'tools/adb.exe');
  assert.throws(() => assertSafeEntryName('../evil.exe'), /traverses/);
  assert.throws(() => assertSafeEntryName('/etc/passwd'), /absolute/);
  assert.throws(() => assertSafeEntryName('C:\\Windows\\cmd.exe'), /drive letter/);
  assert.throws(() => assertSafeEntryName('a/../../evil'), /traverses/);
});

test('extractZipSafe writes regular files under the destination', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-zip-'));
  try {
    const zipPath = path.join(dir, 'pack.zip');
    const zip = new AdmZip();
    zip.addFile('tools/adb.exe', Buffer.from('binary'));
    zip.addFile('unlock/Huawei865870_devprg.elf', Buffer.from('firehose'));
    zip.writeZip(zipPath);
    const dest = path.join(dir, 'out');
    const result = extractZipSafe(zipPath, dest);
    assert.equal(result.files.length, 2);
    assert.equal(fs.readFileSync(path.join(dest, 'tools', 'adb.exe'), 'utf8'), 'binary');
    const walked = await walkFiles(dest);
    assert.equal(walked.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
