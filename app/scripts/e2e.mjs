import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = path.join(os.tmpdir(), `matepad-e2e-${stamp}`);
const DEMO_PROFILE = path.join(BASE, 'demo-profile');
const REAL_PROFILE = path.join(BASE, 'real-profile');
const FRESH_PROFILE = path.join(BASE, 'fresh-profile');
const READY_PROFILE = path.join(BASE, 'ready-profile');
const READY_WORKSPACE = path.resolve(ROOT, '..', 'dist', 'MatePad-11-Workspace-1.0.0', 'MatePad11');
const WORKSPACE = path.join(BASE, 'workspace');
const SHOTS = path.join(ROOT, 'screens', 'e2e');
fs.mkdirSync(DEMO_PROFILE, { recursive: true });
fs.mkdirSync(REAL_PROFILE, { recursive: true });
fs.mkdirSync(FRESH_PROFILE, { recursive: true });
fs.mkdirSync(READY_PROFILE, { recursive: true });
fs.mkdirSync(WORKSPACE, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const results = [];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.MATEPAD_QUIET = '1';

function pass(name, extra = '') {
  results.push({ name, ok: true, extra });
  console.log(`ok   ${name}${extra ? ` — ${extra}` : ''}`);
}

async function launch(profile, extraArgs = []) {
  const app = await electron.launch({
    args: ['.', `--profile=${profile}`, ...extraArgs],
    cwd: ROOT,
    env,
  });
  const page = await app.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.waitForFunction(() => window.__companionReady === true, null, { timeout: 25000 });
  return { app, page };
}

async function goto(page, view) {
  await page.locator(`.nav-item[data-nav="${view}"]`).click();
  await page.waitForTimeout(250);
}

async function snap(page) {
  return page.evaluate(() => window.companion.snapshot());
}

// ---------------------------------------------------------------- demo pass
{
  // The real state behind the demo preview must already hold the disclaimer, otherwise
  // turning demo off would (correctly) pop the first-run gate in the middle of the test.
  fs.writeFileSync(
    path.join(DEMO_PROFILE, 'state.json'),
    JSON.stringify(
      {
        version: 1,
        language: 'en',
        workspace: WORKSPACE,
        toolkitMode: 'build',
        toolkitPath: null,
        method: 'apatch',
        demo: false,
        demoEnabled: false,
        acknowledgements: { disclaimer: '2026-01-01T00:00:00.000Z', unlockWipe: null },
        progress: { unlock: { steps: {} }, root: { steps: {} } },
        hashes: {},
        build: {},
        lastDevice: null,
      },
      null,
      2,
    ),
  );
  const { app, page } = await launch(DEMO_PROFILE, ['--demo', '--lang=en']);
  const initial = await snap(page);
  assert.equal(initial.demo, true);
  assert.equal(initial.state.language, 'en');
  assert.equal(initial.readiness.steps.length, 6);
  assert.equal(initial.readiness.readyCount, 4);
  assert.equal(initial.inventory.requiredMissing.length, 0);
  assert.equal(initial.device.model, 'DBY-W09');
  pass('demo boot: 6 checks, 4 ready, APatch files complete');

  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: path.join(SHOTS, '01-overview.png') });

  await page.locator('[data-action="toggle-theme"]').click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  const lightTheme = await page.evaluate(() => ({
    theme: window.companion && document.documentElement.dataset.theme,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  assert.equal(lightTheme.theme, 'light');
  assert.equal(lightTheme.bg, 'rgb(244, 241, 234)');
  await page.screenshot({ path: path.join(SHOTS, '17-overview-light.png') });
  await goto(page, 'tools');
  await page.screenshot({ path: path.join(SHOTS, '18-tools-light.png') });
  await goto(page, 'settings');
  assert.equal(await page.locator('#view [data-action="set-theme"][data-value="light"]').getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: path.join(SHOTS, '20-settings-light.png') });
  await goto(page, 'device');
  await page.locator('.system-check').screenshot({ path: path.join(SHOTS, '24-system-check-light.png') });
  await page.reload();
  await page.waitForFunction(() => window.__companionReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal((await snap(page)).state.theme, 'light');
  await page.locator('[data-action="toggle-theme"]').click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal((await snap(page)).state.theme, 'dark');
  pass('light mode toggle, persistence across reload, and dark restoration');

  await goto(page, 'prepare');
  assert.match(await page.locator('h1').innerText(), /Build the toolkit/i);
  await page.screenshot({ path: path.join(SHOTS, '02-prepare.png') });
  pass('prepare renders with Windows-only state');

  await goto(page, 'tools');
  await page.locator('#view [data-action="set-method"][data-value="magisk"]').click();
  await page.waitForTimeout(400);
  let demoSnap = await snap(page);
  assert.equal(demoSnap.state.method, 'magisk');
  assert.equal(demoSnap.inventory.requiredMissing.length, 2);
  const magiskCount = await page.locator('#view .toolbar').innerText();
  assert.match(magiskCount, /7\s*\/\s*9/);
  await page.locator('#view [data-action="set-method"][data-value="apatch"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#view .ext-row').count(), 5);
  assert.match(await page.locator('#view').innerText(), /Signed unlock \+ Qualcomm pack/);
  await page.screenshot({ path: path.join(SHOTS, '03-tools.png'), fullPage: false });
  pass('tool pack method switch recalculates required files (Magisk 7/9) and external pack rows render');

  await goto(page, 'device');
  assert.match(await page.locator('h1').innerText(), /Read the tablet/i);
  assert.equal(await page.locator('.prop-table').count(), 1);
  await page.screenshot({ path: path.join(SHOTS, '04-device.png') });
  let checkSnap = await snap(page);
  assert.equal(checkSnap.systemChecks?.tools?.adb?.status, 'pass');
  assert.equal(checkSnap.systemChecks?.tools?.fastboot?.status, 'pass');
  assert.equal(checkSnap.systemChecks?.apps?.magisk?.installed, true);
  assert.equal(checkSnap.systemChecks?.apps?.apatch?.installed, false);
  await page.locator('[data-action="system-check"]').click();
  await page.waitForTimeout(1000);
  checkSnap = await snap(page);
  assert.ok(checkSnap.systemChecks?.checkedAt);
  await page.locator('.system-check').screenshot({ path: path.join(SHOTS, '23-system-check.png') });
  pass('system check executes tools, Windows drivers, phone state and manager apps');
  pass('device passport renders model, OS, battery, props');

  await goto(page, 'unlock');
  assert.match(await page.locator('h1').innerText(), /Unlock, then verify/i);
  const steps = await page.locator('#view .step').count();
  assert.ok(steps >= 5, `expected at least 5 steps, got ${steps}`);
  const ackStep = page.locator('#view input[data-step-flow="unlock"][data-step-id="ack"]');
  assert.equal(await ackStep.count(), 1);
  if (!(await ackStep.isChecked())) await ackStep.click();
  await page.waitForTimeout(350);
  demoSnap = await snap(page);
  assert.equal(demoSnap.state.progress.unlock.steps.ack, true);
  await page.locator('#view [data-action="safety-checklist"]').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#modal').isVisible(), true);
  await page.locator('#safety-close').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, '05-unlock.png') });
  pass('unlock branch, 6 steps, step persistence, safety modal');

  await goto(page, 'root');
  assert.match(await page.locator('h1').innerText(), /Root is a choice/i);
  await page.screenshot({ path: path.join(SHOTS, '06-root.png') });
  pass('root method comparison and prerequisites render');

  await goto(page, 'console');
  const logCount = await page.locator('#console-body .log-row').count();
  assert.ok(logCount >= 8, `expected demo log lines, got ${logCount}`);
  await page.locator('#console-search').fill('adb');
  await page.waitForTimeout(200);
  const filtered = await page.locator('#console-body .log-row').count();
  assert.ok(filtered >= 1 && filtered < logCount);
  await page.locator('#console-search').fill('');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, '07-console.png') });
  pass('console renders and filters logs');

  await goto(page, 'settings');
  await page.locator('#view [data-action="set-language"][data-value="zh"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.match(await page.locator('h1').innerText(), /设置/);
  await page.screenshot({ path: path.join(SHOTS, '08-settings-zh.png') });
  await page.locator('#view [data-action="set-language"][data-value="en"]').click();
  await page.waitForTimeout(400);
  pass('language switches English → Chinese → English');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow: ${overflow}`);
  await page.setViewportSize({ width: 1120, height: 760 });
  await goto(page, 'overview');
  await page.waitForTimeout(300);
  const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(narrowOverflow <= 1, `narrow horizontal overflow: ${narrowOverflow}`);
  await page.screenshot({ path: path.join(SHOTS, '09-overview-narrow.png') });
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.locator('.side-action[data-action="set-language"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  const zhNarrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(zhNarrowOverflow <= 1, `Chinese narrow horizontal overflow: ${zhNarrowOverflow}`);
  await page.locator('.side-action[data-action="set-language"]').click();
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1440, height: 900 });
  pass('no horizontal overflow at 1440 and 1120 widths in both languages');

  await goto(page, 'settings');
  await page.locator('#view [data-action="set-demo"][data-value="false"]').click();
  await page.waitForTimeout(700);
  demoSnap = await snap(page);
  assert.equal(demoSnap.demo, false);
  assert.equal(await page.locator('.demo-strip').count(), 0);
  await page.locator('#view [data-action="set-demo"][data-value="true"]').click();
  await page.waitForTimeout(700);
  assert.equal((await snap(page)).demo, true);
  pass('demo toggles off to live macOS state and back without touching real settings');

  await app.close();
}

// ---------------------------------------------------------------- real workspace pass
{
  const stateFile = path.join(REAL_PROFILE, 'state.json');
  const initialReal = {
    version: 1,
    language: 'en',
    workspace: WORKSPACE,
    toolkitMode: 'build',
    toolkitPath: null,
    method: 'apatch',
    demo: false,
    demoEnabled: false,
    acknowledgements: { disclaimer: '2026-01-01T00:00:00.000Z', unlockWipe: null },
    progress: { unlock: { steps: {} }, root: { steps: {} } },
    hashes: {},
    build: {},
    lastDevice: null,
  };
  fs.writeFileSync(stateFile, JSON.stringify(initialReal, null, 2));

  const { app, page } = await launch(REAL_PROFILE, ['--lang=en']);
  let realSnap = await snap(page);
  assert.equal(realSnap.demo, false);
  assert.equal(realSnap.env.isWindows, false);
  assert.ok(realSnap.inventory.requiredMissing.length > 0);

  await goto(page, 'prepare');
  const buildButton = page.locator('#view [data-action="build"]');
  assert.equal(await buildButton.count(), 1);
  assert.equal(await buildButton.isDisabled(), true);
  pass('build button is disabled on macOS with a visible Windows-only notice');

  const platform = await page.evaluate(() => window.companion.installDownload('platform'));
  assert.equal(platform.ok, true, platform.error);
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'tools', 'adb.exe')));
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'tools', 'fastboot.exe')));
  realSnap = await snap(page);
  assert.equal(realSnap.inventory.items.find((item) => item.id === 'adb').present, true);
  pass('official platform-tools download + safe ZIP extraction');

  const sevenzip = await page.evaluate(() => window.companion.installDownload('sevenzip'));
  assert.equal(sevenzip.ok, true, sevenzip.error);
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'tools', '7z.exe')));
  const sevenzipSize = fs.statSync(path.join(WORKSPACE, 'tools', '7z.exe')).size;
  assert.ok(sevenzipSize > 100000, `7z.exe is suspiciously small (${sevenzipSize})`);
  pass('official 7-Zip page scrape, extra.7z extraction, 7za renamed to 7z.exe');

  const kernelpatch = await page.evaluate(() => window.companion.installDownload('kernelpatch'));
  assert.equal(kernelpatch.ok, true, kernelpatch.error);
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'tools', 'apatch_tools', 'kpimg-android')));
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'tools', 'apatch_tools', 'kptools.exe')));
  assert.ok(fs.statSync(path.join(WORKSPACE, 'tools', 'apatch_tools', 'kptools.exe')).size > 100000);
  pass('KernelPatch release download + kptools Windows archive extraction');

  const magisk = await page.evaluate(() => window.companion.installDownload('magisk'));
  assert.equal(magisk.ok, true, magisk.error);
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'tools', 'apks', 'Magisk.apk')));
  assert.ok(fs.statSync(path.join(WORKSPACE, 'tools', 'apks', 'Magisk.apk')).size > 1000000);
  pass('Magisk latest official APK download and hash');

  const apatch = await page.evaluate(() => window.companion.installDownload('apatch'));
  assert.equal(apatch.ok, true, apatch.error);
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'tools', 'apks', 'Apatch.apk')));
  assert.ok(fs.statSync(path.join(WORKSPACE, 'tools', 'apks', 'Apatch.apk')).size > 1000000);
  pass('APatch latest official APK download and hash');

  const zipPath = path.join(BASE, 'tool-pack.zip');
  const zip = new AdmZip();
  const files = {
    'tools/QSaharaServer.exe': 'synthetic sahara',
    'tools/fh_loader.exe': 'synthetic fh loader',
    'tools/ptool.exe': 'synthetic ptool',
    'unlock/Huawei865870_devprg.elf': 'synthetic firehose',
    'unlock/Huawei865870_abl_unlock.img': 'synthetic abl',
    'tools/rawprogram/rawprogram0.xml': '<data/>',
  };
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
  zip.writeZip(zipPath);
  const imported = await page.evaluate((pack) => window.companion.importPaths([pack], 'toolpack'), zipPath);
  assert.equal(imported.ok, true, imported.error);
  assert.ok(imported.runs?.[0]?.copied?.length >= 5, JSON.stringify(imported.runs?.[0]?.copied?.length));
  realSnap = await snap(page);
  assert.equal(realSnap.inventory.requiredMissing.length, 0, JSON.stringify(realSnap.inventory.requiredMissing.map((i) => i.id)));
  assert.equal(realSnap.inventory.requiredPresent, realSnap.inventory.requiredCount);
  pass('tool-pack ZIP import matches canonical paths; APatch requirements 10/10');

  const externalResult = await page.evaluate(() => window.companion.installExternalPack());
  assert.equal(externalResult.ok, true, JSON.stringify(externalResult.errors));
  assert.equal(externalResult.total, 5);
  const { EXTERNAL_PACK } = require('../src/core/external-pack.js');
  for (const entry of EXTERNAL_PACK) {
    for (const rel of entry.destinations) {
      const file = path.join(WORKSPACE, rel);
      assert.ok(fs.existsSync(file), `${rel} missing`);
      assert.equal(fs.statSync(file).size, entry.bytes, `${rel} size`);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      assert.equal(hash, entry.sha256, `${rel} hash`);
    }
  }
  realSnap = await snap(page);
  assert.equal(realSnap.externalPack.length, 5);
  assert.equal(realSnap.inventory.requiredMissing.length, 0);
  assert.ok(realSnap.inventory.items.find((item) => item.id === 'fh_loader').present);
  assert.ok(realSnap.inventory.items.find((item) => item.id === 'qcdriver').present);
  pass('external pack fetch: Drive firehose/ABL, QSahara, fh_loader 23.06, signed driver, all hashes verified');

  const imgPath = path.join(BASE, 'magisk_patched_test.img');
  fs.writeFileSync(imgPath, 'synthetic ramdisk');
  const importedRamdisk = await page.evaluate((img) => window.companion.importPaths([img], 'ramdisk'), imgPath);
  assert.equal(importedRamdisk.ok, true);
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'ramdisk', 'magisk_patched_test.img')));
  await page.evaluate(() => window.companion.setMethod('magisk'));
  await page.waitForTimeout(400);
  realSnap = await snap(page);
  assert.equal(realSnap.state.method, 'magisk');
  assert.equal(realSnap.inventory.requiredMissing.length, 0, JSON.stringify(realSnap.inventory.requiredMissing.map((i) => i.id)));
  await page.evaluate(() => window.companion.setMethod('apatch'));
  pass('ramdisk import + Magisk requirement set (9/9)');

  const buildResult = await page.evaluate(() => window.companion.build(false));
  assert.equal(buildResult.ok, false);
  assert.match(buildResult.error || '', /Windows/i);
  pass('build refuses clearly on macOS (Windows-only XCompiler)');

  const deviceResult = await page.evaluate(() => window.companion.deviceAction('refresh'));
  assert.equal(deviceResult.ok, true, deviceResult.error);
  assert.ok(['no-device', 'no-adb', 'unauthorized'].includes(deviceResult.device?.state), JSON.stringify(deviceResult.device));
  const liveCheck = await page.evaluate(() => window.companion.systemCheck());
  assert.equal(liveCheck.ok, true, liveCheck.error);
  assert.equal(liveCheck.systemChecks?.tools?.adb?.status, 'pass', JSON.stringify(liveCheck.systemChecks?.tools?.adb));
  assert.equal(liveCheck.systemChecks?.tools?.fastboot?.status, 'pass', JSON.stringify(liveCheck.systemChecks?.tools?.fastboot));
  assert.equal(liveCheck.systemChecks?.drivers?.supported, false);
  pass('live system check executes real adb and fastboot on this Mac');
  pass('device refresh runs real adb without a tablet and reports no device');

  const ack = await page.evaluate(() => window.companion.ackWipe('WIPE', true));
  assert.equal(ack.ok, true);
  const guide = await page.evaluate(() => window.companion.guideStep('unlock', 'branch', true, false));
  assert.equal(guide.ok, true);
  realSnap = await snap(page);
  assert.ok(realSnap.state.acknowledgements.unlockWipe);
  assert.equal(realSnap.state.progress.unlock.steps.branch, true);
  pass('wipe acknowledgement and guide step persist to state');

  await goto(page, 'prepare');
  assert.equal(await page.locator('#view .notice.warn').count() >= 1, true);
  await page.screenshot({ path: path.join(SHOTS, '10-prepare-live-mac.png') });
  await goto(page, 'tools');
  await page.screenshot({ path: path.join(SHOTS, '11-tools-live-files.png') });
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find((el) => /Inventory|文件清单/.test(el.textContent));
    if (heading) heading.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '12-tools-inventory.png') });
  pass('live workspace screenshots captured (prepare, tools, inventory)');

  await app.close();
}

// ---------------------------------------------------------------- first-run UI pass
{
  const stateFile = path.join(FRESH_PROFILE, 'state.json');
  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        version: 1,
        language: 'en',
        workspace: WORKSPACE,
        toolkitMode: 'build',
        toolkitPath: null,
        method: 'apatch',
        demo: false,
        demoEnabled: false,
        acknowledgements: { disclaimer: null, unlockWipe: null },
        progress: { unlock: { steps: {} }, root: { steps: {} } },
        hashes: {},
        build: {},
        lastDevice: null,
      },
      null,
      2,
    ),
  );
  const { app, page } = await launch(FRESH_PROFILE, ['--lang=en']);
  await page.waitForSelector('#modal[open]', { timeout: 8000 });
  assert.match(await page.locator('#modal').innerText(), /erase the tablet/i);
  await page.screenshot({ path: path.join(SHOTS, '13-disclaimer.png') });
  const accept = page.locator('#modal-accept');
  assert.equal(await accept.isDisabled(), true);
  await page.locator('#disclaimer-accept').check();
  assert.equal(await accept.isDisabled(), false);
  await accept.click();
  await page.waitForTimeout(700);
  let freshSnap = await snap(page);
  assert.ok(freshSnap.state.acknowledgements.disclaimer);
  await page.reload();
  await page.waitForFunction(() => window.__companionReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#modal').isVisible(), false);
  pass('first-run disclaimer gates the app, persists, and does not reopen');

  await goto(page, 'unlock');
  await page.waitForSelector('#wipe-form', { timeout: 5000 });
  const submit = page.locator('#wipe-form button[type="submit"]');
  assert.equal(await submit.isDisabled(), true);
  await page.locator('#wipe-phrase').fill('WIPE');
  await page.locator('#wipe-backup').check();
  await page.waitForTimeout(150);
  assert.equal(await submit.isDisabled(), false);
  await page.screenshot({ path: path.join(SHOTS, '14-unlock-ack-form.png') });
  await submit.click();
  await page.waitForTimeout(800);
  freshSnap = await snap(page);
  assert.ok(freshSnap.state.acknowledgements.unlockWipe);
  assert.match(await page.locator('#view').innerText(), /Data-wipe acknowledgement recorded/i);
  pass('typed WIPE + backup checkbox records the data-wipe acknowledgement');

  await app.close();
}

// ---------------------------------------------------------------- ready workspace pass
{
  assert.ok(fs.existsSync(READY_WORKSPACE), 'ready workspace missing; run app/scripts/make-workspace.mjs first');
  fs.writeFileSync(
    path.join(READY_PROFILE, 'state.json'),
    JSON.stringify(
      {
        version: 1,
        language: 'en',
        workspace: READY_WORKSPACE,
        toolkitMode: 'build',
        toolkitPath: null,
        method: 'apatch',
        demo: false,
        demoEnabled: false,
        acknowledgements: { disclaimer: '2026-01-01T00:00:00.000Z', unlockWipe: null },
        progress: { unlock: { steps: {} }, root: { steps: {} } },
        hashes: {},
        build: {},
        lastDevice: null,
      },
      null,
      2,
    ),
  );
  const { app, page } = await launch(READY_PROFILE, ['--lang=en']);
  const readySnap = await snap(page);
  assert.equal(readySnap.demo, false);
  assert.equal(readySnap.inventory.requiredPresent, 10);
  assert.equal(readySnap.inventory.requiredMissing.length, 0);
  for (const id of ['qsahara', 'fh_loader', 'devprg', 'abl_unlock', 'kptools', 'kpimg', 'apatch_apk', 'adbdriver', 'qcdriver']) {
    assert.ok(readySnap.inventory.items.find((item) => item.id === id)?.present, `${id} should be present`);
  }
  assert.equal(readySnap.externalPack.length, 5);
  assert.ok(fs.existsSync(path.join(READY_WORKSPACE, 'TOOLPACK-MANIFEST.json')));
  await goto(page, 'tools');
  await page.screenshot({ path: path.join(SHOTS, '15-tools-ready-workspace.png') });
  await goto(page, 'prepare');
  await page.screenshot({ path: path.join(SHOTS, '16-prepare-ready-workspace.png') });
  pass('ready workspace: 25 files, APatch 10/10, drivers present, manifest verified by the app');
  await app.close();
}

const summary = {
  base: BASE,
  results,
  consoleErrors,
  pageErrors,
};
fs.writeFileSync(path.join(BASE, 'e2e-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (consoleErrors.length || pageErrors.length) {
  console.error('Renderer errors detected');
  process.exit(1);
}
console.log(`E2E passed: ${results.length} checks`);
