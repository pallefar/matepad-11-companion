'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAdbDevices,
  parseFastbootDevices,
  parseGetprop,
  detectHarmonyOS,
  parseBattery,
  parseDf,
  parseFastbootGetvar,
  parseDotnetSdks,
  modelKind,
  routeUnlock,
  evaluateGates,
  summarizeGates,
} = require('../src/core/parse');

test('parseAdbDevices distinguishes device, unauthorized and offline', () => {
  const output = [
    'List of devices attached',
    '* daemon not running; starting now at tcp:5037',
    'FMR0220A28001234\tdevice product:DBY-W09 model:DBY_W09 device:DBY-W09 transport_id:1',
    'ABCDEF012345\tunauthorized usb:1-1',
    'OFFLINE0001\toffline',
    '',
  ].join('\n');
  const devices = parseAdbDevices(output);
  assert.equal(devices.length, 3);
  assert.equal(devices[0].state, 'device');
  assert.equal(devices[0].props.model, 'DBY_W09');
  assert.equal(devices[0].props.transport_id, '1');
  assert.equal(devices[1].state, 'unauthorized');
  assert.equal(devices[2].state, 'offline');
});

test('parseAdbDevices ignores daemon noise and handles no permissions', () => {
  const output = [
    'adb server version (41) doesn\'t match this client (39); killing...',
    'XYZ no permissions (user in plugdev group; are your udev rules wrong?); see [http://developer.android.com/tools/device.html]',
  ].join('\n');
  const devices = parseAdbDevices(output);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].state, 'no-permissions');
});

test('parseFastbootDevices only keeps real fastboot rows', () => {
  const devices = parseFastbootDevices('FMR0220A28\tfastboot\nfastboot: error\n\n');
  assert.deepEqual(devices.map((d) => d.serial), ['FMR0220A28']);
});

test('parseGetprop and HarmonyOS detection from hw_sc', () => {
  const props = parseGetprop(
    [
      '[ro.product.model]: [DBY-W09]',
      '[hw_sc.build.platform.version]: [4.2.0.208]',
      '[hw_sc.build.os.apiversion]: [12]',
      '[ro.build.version.release]: [12]',
      '[ro.build.version.sdk]: [31]',
    ].join('\n'),
  );
  assert.equal(props['ro.product.model'], 'DBY-W09');
  const os = detectHarmonyOS(props);
  assert.equal(os.version, '4.2.0.208');
  assert.equal(os.major, 4);
  assert.equal(os.api, '12');
  assert.equal(os.android, '12');
  assert.equal(os.isHuawei, true);
});

test('HarmonyOS 2 and 3 map to major 2/3, unknown stays unknown', () => {
  assert.equal(detectHarmonyOS({ 'hw_sc.build.platform.version': '2.0.0.278' }).major, 2);
  assert.equal(detectHarmonyOS({ 'hw_sc.build.platform.version': '3.0.0.216' }).major, 3);
  const unknown = detectHarmonyOS({ 'ro.build.version.release': '10' });
  assert.equal(unknown.major, null);
  assert.equal(unknown.version, null);
});

test('battery, df and fastboot parsing', () => {
  const battery = parseBattery('Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  level: 76\n  status: 2\n');
  assert.equal(battery.level, 76);
  assert.equal(battery.charging, true);

  const df = parseDf('Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-4 110961920 12345678 98616242 12% /data\n');
  assert.equal(df.totalBytes, 110961920 * 1024);
  assert.equal(df.freeBytes, 98616242 * 1024);

  assert.equal(parseFastbootGetvar('(bootloader) unlocked: yes\nfinished. total time: 0.002s', 'unlocked'), 'yes');
  assert.equal(parseFastbootGetvar('is-userspace: no', 'is-userspace'), 'no');
  assert.equal(parseFastbootGetvar('garbage', 'unlocked'), null);
});

test('dotnet SDK list detects 8.x', () => {
  const parsed = parseDotnetSdks('8.0.133 [/usr/local/share/dotnet/sdk]\n9.0.100 [/x]\n');
  assert.deepEqual(parsed.versions, ['8.0.133', '9.0.100']);
  assert.equal(parsed.has8, true);
  assert.equal(parseDotnetSdks('7.0.400 [C:\\dotnet]').has8, false);
});

test('modelKind accepts DBY-W09 and flags the global name', () => {
  assert.equal(modelKind('DBY-W09'), 'supported');
  assert.equal(modelKind('DBY_W09'), 'supported');
  assert.equal(modelKind(' dby-w09 '), 'supported');
  assert.equal(modelKind('DBY-W09S'), 'global');
  assert.equal(modelKind('DBY2-W09'), 'unsupported');
  assert.equal(modelKind(''), 'missing');
});

test('routeUnlock never sends HarmonyOS 4 down the ADB path', () => {
  assert.equal(routeUnlock({ harmonyMajor: 2 }).route, 'adb-edl');
  assert.equal(routeUnlock({ harmonyMajor: 3 }).route, 'adb-edl');
  assert.equal(routeUnlock({ harmonyMajor: 4 }).route, 'engineering');
  assert.equal(routeUnlock({ harmonyMajor: 4, unlocked: true }).route, 'already-unlocked');
  assert.equal(routeUnlock({ harmonyMajor: null }).route, 'unknown');
});

test('gates block a low battery, a non-DBY model and a missing backup acknowledgement', () => {
  const base = {
    env: { isWindows: true, platformLabel: 'Windows 11', arch: 'x64' },
    pcFreeBytes: 80 * 1024 ** 3,
    inventory: { requiredMissing: [] },
    toolkitReady: true,
    backupAck: true,
    method: 'apatch',
    device: {
      state: 'device',
      model: 'DBY-W09',
      os: { major: 3, version: '3.0.0.168' },
      battery: { level: 30 },
    },
  };
  const low = summarizeGates(evaluateGates(base));
  assert.equal(low.canProceed, false);
  assert.ok(low.blocking.some((g) => g.id === 'battery'));

  const ok = summarizeGates(evaluateGates({ ...base, device: { ...base.device, battery: { level: 76 } } }));
  assert.equal(ok.canProceed, true);

  const noAck = summarizeGates(evaluateGates({ ...base, device: { ...base.device, battery: { level: 76 } }, backupAck: false }));
  assert.equal(noAck.canProceed, false);

  const wrongModel = summarizeGates(
    evaluateGates({ ...base, device: { ...base.device, battery: { level: 76 }, model: 'DBY2-W09' } }),
  );
  assert.ok(wrongModel.blocking.some((g) => g.id === 'model'));

  const lowDisk = summarizeGates(
    evaluateGates({ ...base, pcFreeBytes: 8 * 1024 ** 3, device: { ...base.device, battery: { level: 76 } } }),
  );
  assert.ok(lowDisk.blocking.some((g) => g.id === 'disk'));
});

test('50% battery warns but does not block, 40% does block', () => {
  const base = {
    env: { isWindows: true },
    pcFreeBytes: 80 * 1024 ** 3,
    inventory: { requiredMissing: [] },
    toolkitReady: true,
    backupAck: true,
    device: { state: 'device', model: 'DBY-W09', os: { major: 3 }, battery: { level: 50 } },
  };
  const fifty = summarizeGates(evaluateGates(base));
  assert.equal(fifty.canProceed, true);
  assert.ok(fifty.warned.some((g) => g.id === 'battery'));
  const forty = summarizeGates(evaluateGates({ ...base, device: { ...base.device, battery: { level: 40 } } }));
  assert.equal(forty.canProceed, true);
  const below = summarizeGates(evaluateGates({ ...base, device: { ...base.device, battery: { level: 39 } } }));
  assert.equal(below.canProceed, false);
});
