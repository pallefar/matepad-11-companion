'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeReadiness } = require('../src/core/readiness');
const { ITEMS, summarize } = require('../src/core/inventory');
const { formatBytes, maskSerial, dotnetPublishArgs, formatCommand } = require('../src/core/commands');

function fullInventory(method = 'apatch') {
  const items = ITEMS.map((item) => ({ ...item, present: true }));
  return summarize(items, method);
}

const device = {
  state: 'device',
  model: 'DBY-W09',
  os: { major: 3, version: '3.0.0.168' },
  battery: { level: 76 },
  bootloader: { unlocked: false },
};

const state = {
  acknowledgements: { unlockWipe: '2026-01-01T00:00:00.000Z' },
  progress: { unlock: {}, root: {} },
  toolkitPath: 'C:\\MatePad11\\MatePadToolbox.exe',
};

test('readiness is ready through device, pending unlock/root', () => {
  const readiness = computeReadiness({
    env: { isWindows: true, platformLabel: 'Windows 11', arch: 'x64', freeBytes: 80 * 1024 ** 3 },
    state,
    inventory: fullInventory(),
    device,
    toolkitPresent: true,
  });
  assert.equal(readiness.readyCount, 4);
  assert.equal(readiness.nextStep.id, 'unlock');
  assert.equal(readiness.canUnlock, true);
  assert.equal(readiness.canRoot, false);
  assert.equal(readiness.unlocked, false);
});

test('readiness blocks unlock on a low battery and flags no toolkit', () => {
  const low = computeReadiness({
    env: { isWindows: true, freeBytes: 80 * 1024 ** 3 },
    state,
    inventory: fullInventory(),
    device: { ...device, battery: { level: 20 } },
    toolkitPresent: true,
  });
  assert.equal(low.canUnlock, false);
  assert.equal(low.steps.find((s) => s.id === 'device').status, 'blocked');

  const noToolkit = computeReadiness({
    env: { isWindows: true, freeBytes: 80 * 1024 ** 3 },
    state,
    inventory: fullInventory(),
    device,
    toolkitPresent: false,
  });
  assert.equal(noToolkit.canUnlock, false);
  assert.equal(noToolkit.nextStep.id, 'toolkit');
});

test('readiness moves to root when bootloader is unlocked', () => {
  const readiness = computeReadiness({
    env: { isWindows: true, freeBytes: 80 * 1024 ** 3 },
    state,
    inventory: fullInventory(),
    device: { ...device, bootloader: { unlocked: true } },
    toolkitPresent: true,
  });
  assert.equal(readiness.unlocked, true);
  assert.equal(readiness.canRoot, true);
  assert.equal(readiness.steps.find((s) => s.id === 'unlock').status, 'ready');
});

test('readiness on macOS is preview-only and cannot unlock', () => {
  const readiness = computeReadiness({
    env: { isWindows: false, platformLabel: 'macOS', arch: 'arm64', freeBytes: 500 * 1024 ** 3 },
    state,
    inventory: fullInventory(),
    device,
    toolkitPresent: true,
  });
  assert.equal(readiness.steps[0].status, 'attention');
  assert.equal(readiness.canUnlock, false);
});

test('readiness does not require a backup acknowledgement for the overview but gates unlock', () => {
  const readiness = computeReadiness({
    env: { isWindows: true, freeBytes: 80 * 1024 ** 3 },
    state: { ...state, acknowledgements: {} },
    inventory: fullInventory(),
    device,
    toolkitPresent: true,
  });
  assert.equal(readiness.canUnlock, false);
});

test('formatBytes and maskSerial are stable', () => {
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(1536), '1.50 KB');
  assert.equal(formatBytes(13 * 1024 ** 3), '13.0 GB');
  assert.equal(formatBytes(null), '—');
  assert.ok(maskSerial('FMR0220A28001234').endsWith('1234'));
  assert.match(maskSerial('FMR0220A28001234'), /^•+1234$/);
  assert.equal(maskSerial('123'), '123');
});

test('publish command is explicit and quotes spaces', () => {
  const args = dotnetPublishArgs('C:\\My Tools\\MatePadToolbox.csproj', 'C:\\MatePad 11');
  assert.deepEqual(args.slice(0, 2), ['publish', 'C:\\My Tools\\MatePadToolbox.csproj']);
  const command = formatCommand('dotnet', args);
  assert.match(command, /-p:Platform=x64/);
  assert.match(command, /-r win-x64/);
  assert.match(command, /"C:\\MatePad 11"/);
});
