'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAdbVersion,
  parseFastbootVersion,
  parsePackageList,
  findManagerApps,
  parseVersionName,
  parseSetting,
  parseWhichSu,
  parseWindowsDriverJson,
  summarizeStatuses,
} = require('../src/core/checks');

test('parses adb and fastboot versions from real tool output', () => {
  const adb = parseAdbVersion('Android Debug Bridge version 1.0.41\nVersion 36.0.2-13483242\nInstalled as C:\\tools\\adb.exe');
  assert.equal(adb.version, '1.0.41');
  assert.match(adb.raw, /Android Debug Bridge/);
  const fastboot = parseFastbootVersion('fastboot version 36.0.2-13483242\nInstalled as C:\\tools\\fastboot.exe');
  assert.equal(fastboot.version, '36.0.2-13483242');
});

test('parses packages and identifies Magisk, APatch, and KernelSU', () => {
  const packages = parsePackageList('package:com.topjohnwu.magisk\npackage:me.bmax.apatch\npackage:com.android.settings\npackage:me.weishu.kernelsu');
  assert.deepEqual(packages, ['com.topjohnwu.magisk', 'me.bmax.apatch', 'com.android.settings', 'me.weishu.kernelsu']);
  const managers = findManagerApps(packages);
  assert.equal(managers.magisk.installed, true);
  assert.equal(managers.magisk.package, 'com.topjohnwu.magisk');
  assert.equal(managers.apatch.installed, true);
  assert.equal(managers.kernelsu.installed, true);
  assert.equal(findManagerApps(['com.android.settings']).magisk.installed, false);
});

test('parses manager version, developer settings, and su path', () => {
  assert.equal(parseVersionName('versionName=31.1\nversionCode=31001'), '31.1');
  assert.equal(parseVersionName('no version here'), null);
  assert.equal(parseSetting('1\n'), true);
  assert.equal(parseSetting('0\n'), false);
  assert.equal(parseSetting('null\n'), null);
  assert.equal(parseWhichSu('/system/bin/su\n'), '/system/bin/su');
  assert.equal(parseWhichSu('which: no su in (/system/bin)'), null);
});

test('classifies Windows PnP rows without treating EDL absence as failure', () => {
  const rows = [
    { Name: 'HUAWEI ADB Interface', DeviceID: 'USB\\VID_12D1&PID_1058', ConfigManagerErrorCode: 0, Status: 'OK' },
    { Name: 'QUSB_BULK_CID:0402', DeviceID: 'USB\\VID_05C6&PID_9008', ConfigManagerErrorCode: 0, Status: 'OK' },
    { Name: 'HUAWEI USB Device', DeviceID: 'USB\\VID_12D1&PID_107E', ConfigManagerErrorCode: 28, Status: 'Error' },
  ];
  const parsed = parseWindowsDriverJson(JSON.stringify(rows));
  assert.equal(parsed.adb.present, true);
  assert.equal(parsed.qualcomm.present, true);
  assert.equal(parsed.problems.length, 1);
  assert.equal(parsed.problems[0].errorCode, 28);
  const single = parseWindowsDriverJson(JSON.stringify(rows[0]));
  assert.equal(single.adb.present, true);
  assert.equal(single.qualcomm.present, false);
});

test('summarizes pass, warning, failure, and pending states', () => {
  assert.deepEqual(
    { ...summarizeStatuses(['pass', 'pending', 'unknown']), total: 3, status: 'ready' },
    { pass: 1, warn: 0, fail: 0, pending: 1, unknown: 1, total: 3, status: 'ready' },
  );
  assert.equal(summarizeStatuses(['pass', 'warn']).status, 'attention');
  assert.equal(summarizeStatuses(['pass', 'fail']).status, 'blocked');
});

const { parseDriverPackages } = require('../src/core/checks');

test('finds Qualcomm and ADB driver packages in pnputil output', () => {
  const text = `
Published Name:     oem12.inf
Original Name:      qcusbser.inf
Provider Name:      Qualcomm Incorporated
Class Name:         Ports
Driver Version:     2.1

Published Name:     oem13.inf
Original Name:      android_winusb.inf
Provider Name:      Google
Class Name:         AndroidUsbDeviceClass
`;
  const parsed = parseDriverPackages(text);
  assert.equal(parsed.available, true);
  assert.equal(parsed.qualcomm, true);
  assert.equal(parsed.adb, true);
  assert.match(parsed.samples.join(' '), /qcusbser/);
});

test('does not claim a driver when none is installed', () => {
  const parsed = parseDriverPackages('Published Name: oem1.inf\nOriginal Name: printer.inf');
  assert.equal(parsed.qualcomm, false);
  assert.equal(parsed.adb, false);
});
