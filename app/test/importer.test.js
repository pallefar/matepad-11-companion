'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createImportService } = require('../src/main/importer');

function makeService(root) {
  const store = {
    get: () => ({ demo: false, workspace: root }),
    update: (fn) => {
      const draft = { hashes: {} };
      fn(draft);
      return draft;
    },
  };
  const logger = { info() {}, good() {}, warn() {}, error() {} };
  return createImportService({ store, logger });
}

test('folder import maps a mixed tool pack into the canonical layout', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-import-'));
  const root = path.join(dir, 'workspace');
  const pack = path.join(dir, 'tool-pack', 'anything');
  fs.mkdirSync(root, { recursive: true });
  const files = {
    'QSaharaServer.exe': 'sahara',
    'fh_loader.exe': 'fh',
    '7za.exe': '7zip',
    'Huawei865870_devprg.elf': 'firehose',
    'Huawei865870_abl_unlock.img': 'abl',
    'kptools-x86_64-win.exe': 'kptools',
    'kpimg-android': 'kpimg',
    'APatch_11282_test.apk': 'apatch',
    'Magisk-v31.1.apk': 'magisk',
    'rawprogram0.xml': '<data/>',
    'README.txt': 'ignore me',
  };
  fs.mkdirSync(pack, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(pack, name), content);

  try {
    const service = makeService(root);
    const result = await service.importPath(path.join(dir, 'tool-pack'));
    assert.equal(result.ok, true);
    assert.equal(result.copied.length, 10);
    assert.ok(result.ignored.includes('README.txt'));
    const expected = [
      'tools/QSaharaServer.exe',
      'tools/fh_loader.exe',
      'tools/7z.exe',
      'unlock/Huawei865870_devprg.elf',
      'unlock/Huawei865870_abl_unlock.img',
      'tools/apatch_tools/kptools.exe',
      'tools/apatch_tools/kpimg-android',
      'tools/apks/Apatch.apk',
      'tools/apks/Magisk.apk',
      'tools/rawprogram/rawprogram0.xml',
    ];
    for (const rel of expected) {
      assert.ok(fs.existsSync(path.join(root, rel)), `${rel} missing`);
    }
    assert.equal(fs.readFileSync(path.join(root, 'tools', '7z.exe'), 'utf8'), '7zip');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ramdisk import accepts an arbitrary patched .img and keeps its name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-import-'));
  const root = path.join(dir, 'workspace');
  fs.mkdirSync(root, { recursive: true });
  const img = path.join(dir, 'magisk_patched-31000_abc.img');
  fs.writeFileSync(img, 'patched');
  try {
    const service = makeService(root);
    const result = await service.importPath(img, { role: 'ramdisk' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ramdisk.map((entry) => entry.file), ['magisk_patched-31000_abc.img']);
    assert.ok(fs.existsSync(path.join(root, 'ramdisk', 'magisk_patched-31000_abc.img')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('import refuses demo mode before touching the disk', async () => {
  const store = { get: () => ({ demo: true, workspace: '/nope' }), update() {} };
  const service = createImportService({ store, logger: { info() {}, good() {}, warn() {}, error() {} } });
  await assert.rejects(() => service.importPath('/tmp/x', { role: 'toolpack' }), /Demo mode/);
});
