'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanBackupFolder } = require('../src/main/backup');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'matepad-backup-'));
}

function sparse(file, bytes) {
  const fd = fs.openSync(file, 'w');
  fs.ftruncateSync(fd, bytes);
  fs.closeSync(fd);
}

test('detects a folder with images, GPT XML and enough size', () => {
  const dir = tempDir();
  try {
    sparse(path.join(dir, 'system.img'), 200 * 1024 ** 2);
    sparse(path.join(dir, 'boot.img'), 200 * 1024 ** 2);
    sparse(path.join(dir, 'super.img'), 200 * 1024 ** 2);
    fs.writeFileSync(path.join(dir, 'gpt_main0.xml'), '<gpt/>');
    const scan = scanBackupFolder(dir);
    assert.equal(scan.ok, true);
    assert.equal(scan.imageCount, 3);
    assert.equal(scan.gptCount, 1);
    assert.ok(scan.totalBytes >= 512 * 1024 ** 2);
    assert.equal(scan.missing.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects a folder without a GPT/partition file', () => {
  const dir = tempDir();
  try {
    sparse(path.join(dir, 'system.img'), 200 * 1024 ** 2);
    sparse(path.join(dir, 'boot.img'), 200 * 1024 ** 2);
    sparse(path.join(dir, 'super.img'), 200 * 1024 ** 2);
    const scan = scanBackupFolder(dir);
    assert.equal(scan.ok, false);
    assert.ok(scan.missing.some((item) => /GPT/.test(item)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
