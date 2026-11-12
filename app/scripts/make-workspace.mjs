import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { createDownloadService } = require('../src/main/downloads.js');
const { EXTERNAL_PACK } = require('../src/core/external-pack.js');

const ROOT = path.resolve(process.cwd(), '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'MatePad-11-Workspace-1.0.0');
const WS = path.join(STAGE, 'MatePad11');

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(WS, { recursive: true });

const state = { demo: false, workspace: WS, hashes: {} };
const store = {
  get: () => state,
  update: (fn) => {
    const draft = JSON.parse(JSON.stringify(state));
    const next = fn(draft) || draft;
    state.hashes = next.hashes || {};
    return state;
  },
};
const logger = {
  info: (s, m) => console.log(`INFO ${s}: ${m}`),
  warn: (s, m) => console.log(`WARN ${s}: ${m}`),
  error: (s, m) => console.log(`ERROR ${s}: ${m}`),
  good: (s, m) => console.log(`GOOD ${s}: ${m}`),
};

const service = createDownloadService({ store, logger });
service.setProgressSink((progress) => {
  if (progress.phase === 'done' || progress.phase === 'error' || progress.phase === 'resolve') {
    console.log(`PROGRESS ${progress.id}: ${progress.phase} ${progress.message || ''}`);
  }
});

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

try {
  for (const id of ['platform', 'sevenzip', 'magisk', 'apatch', 'kernelpatch']) {
    console.log(`\n=== ${id} ===`);
    const result = await service.install(id);
    if (!result?.ok) throw new Error(`${id} failed: ${JSON.stringify(result)}`);
  }
  console.log('\n=== external pack ===');
  const external = await service.installExternalPack();
  if (!external.ok) throw new Error(`external pack failed: ${JSON.stringify(external.errors)}`);

  // No runtime-generated or ROM-only files belong in this workspace.
  for (const dir of ['.setup', 'ramdisk', 'backup', 'cache', 'tmp', 'out', 'base', 'vbmeta', 'tools/rawprogram', 'tools/HiSuiteProxy']) {
    fs.rmSync(path.join(WS, dir), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(WS, 'ramdisk'), { recursive: true });

  const files = walk(WS).sort();
  const byRel = new Map(files.map((f) => [path.relative(WS, f).replaceAll(path.sep, '/'), f]));
  const manifest = {
    name: 'MatePad 11 unlock + APatch root workspace',
    version: '1.0.0',
    generated: new Date().toISOString(),
    device: 'Huawei MatePad 11 DBY-W09',
    purpose: 'Preloads every file required by MatePadToolbox for bootloader unlock and APatch root.',
    notIncluded: [
      'rawprogram*.xml, ptool.exe, vbmeta.zip, misc.img — only for ROM flashing/rescue',
      'HiSuite / HiSuite Proxy — only for the HarmonyOS 4 downgrade path',
      'ramdisk/*.img — Magisk only; must match the exact firmware',
      'MatePadToolbox.exe — build it on Windows from the GPL source',
    ],
    externalSources: EXTERNAL_PACK.map((entry) => ({
      id: entry.id,
      label: entry.label,
      destinations: entry.destinations,
      source: entry.source,
      license: entry.license,
      note: entry.note,
      bytes: entry.bytes,
      sha256: entry.sha256,
    })),
    files: files.map((file) => {
      const rel = path.relative(WS, file).replaceAll(path.sep, '/');
      return { path: rel, bytes: fs.statSync(file).size, sha256: sha256(file) };
    }),
  };
  fs.writeFileSync(path.join(WS, 'TOOLPACK-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const checksums = [
    '# SHA-256 — MatePad 11 workspace 1.0.0',
    `# generated ${manifest.generated}`,
    '',
    ...manifest.files.map((file) => `${file.sha256}  ${file.path}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(WS, 'CHECKSUMS.txt'), checksums);

  const readme = `MatePad 11 Workspace 1.0.0 — DBY-W09
=========================================

This folder is already laid out for the upstream MatePadToolbox:

  tools/adb.exe, fastboot.exe, platform-tools DLLs
  tools/7z.exe
  tools/QSaharaServer.exe, fh_loader.exe
  tools/apatch_tools/kptools.exe, kpimg-android
  tools/apks/Magisk.apk, Apatch.apk
  tools/driver/adbdriver.exe, qcdriver.exe
  unlock/Huawei865870_devprg.elf
  unlock/Huawei865870_abl_unlock.img

It covers the upstream's APatch requirements 10/10 and Magisk 9/9 once you add
a patched ramdisk. Build the toolkit into this folder on Windows:

  1. Copy this MatePad11 folder to C:\\MatePad11 (or another writable place).
  2. Start MatePad 11 Companion -> Prepare.
  3. Change folder -> select THIS MatePad11 folder.
  4. Download & build. The app fetches the GPL source and writes
     MatePadToolbox.exe into this folder. No tool-pack import is needed.
  5. Device -> detect tablet -> Unlock, then Root (APatch recommended).

Drivers: tools/driver/adbdriver.exe and qcdriver.exe are copies of the same
signed Xiaomi MiFlash combined driver installer (Xiaomi-signed). The original
author's separate installers were not available; this combined installer is a
working substitute. You can also install drivers manually through Device
Manager. A reboot may be needed.

NOT included (not needed for unlock + APatch root):
  - tools/rawprogram/*, tools/ptool.exe, vbmeta/vbmeta.zip, misc.img
    (only for third-party ROM flashing / rescue)
  - tools/HiSuiteProxy/* (only for HarmonyOS 4 downgrade)
  - ramdisk/*.img (Magisk only; must match your exact firmware)

Verify every file with CHECKSUMS.txt. TOOLPACK-MANIFEST.json records provenance.

THIRD-PARTY / PROPRIETARY NOTICE
These files are proprietary Qualcomm, Huawei, and Xiaomi binaries obtained from
public sources listed in the manifest. They are provided for your personal use
with your own tablet, are NOT part of the MatePad 11 Companion MIT license, and
must not be redistributed. The signed firehose and ABL are device-specific. No
warranty is provided. Verify hashes before use.

The actual EDL/9008 writes are performed by the upstream MatePadToolbox.
Unlocking erases all data and can hard-brick the tablet. Make a full EDL backup
first. Never flash the stock ABL after unlocking and never accept an OTA.
`;
  fs.writeFileSync(path.join(WS, 'README-FIRST.txt'), readme);

  // Top-level convenience copy of the README.
  fs.copyFileSync(path.join(WS, 'README-FIRST.txt'), path.join(STAGE, 'README-FIRST.txt'));

  const zipPath = path.join(DIST, 'MatePad-11-Workspace-1.0.0.zip');
  fs.rmSync(zipPath, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zipPath, 'MatePad-11-Workspace-1.0.0'], { cwd: DIST });
  const zipHash = sha256(zipPath);
  fs.writeFileSync(`${zipPath}.sha256`, `${zipHash}  MatePad-11-Workspace-1.0.0.zip\n`);

  console.log(`\nWorkspace files: ${manifest.files.length}`);
  console.log(`Workspace size: ${(files.reduce((sum, file) => sum + fs.statSync(file).size, 0) / 1024 ** 2).toFixed(1)} MiB`);
  console.log(`ZIP: ${zipPath} (${(fs.statSync(zipPath).size / 1024 ** 2).toFixed(1)} MiB)`);
  console.log(`ZIP SHA-256: ${zipHash}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
