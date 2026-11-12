'use strict';

function firstLine(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

function parseAdbVersion(output) {
  const text = String(output || '');
  const bridge = text.match(/Android Debug Bridge version\s+([^\s]+)/i);
  const version = text.match(/(?:^|\n)Version\s+([^\s]+)/i);
  return { version: (bridge && bridge[1]) || (version && version[1]) || null, raw: firstLine(text) };
}

function parseFastbootVersion(output) {
  const text = String(output || '');
  const match = text.match(/fastboot version\s+([^\s]+)/i) || text.match(/^fastboot\s+([^\s]+)/i);
  return { version: match ? match[1] : null, raw: firstLine(text) };
}

function parsePackageList(output) {
  const packages = [];
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^package:(.+)$/);
    if (match) packages.push(match[1].trim());
  }
  return packages;
}

function matchManager(packages, regex) {
  const found = packages.find((name) => regex.test(name));
  return found ? { installed: true, package: found, version: null } : { installed: false, package: null, version: null };
}

function findManagerApps(packages) {
  const list = Array.isArray(packages) ? packages : [];
  return {
    packages: list,
    magisk: matchManager(list, /(^|\.)topjohnwu\.magisk$|magisk/i),
    apatch: matchManager(list, /apatch/i),
    kernelsu: matchManager(list, /kernelsu|weishu/i),
  };
}

function parseVersionName(output) {
  const match = String(output || '').match(/versionName=([^\s]+)/);
  return match ? match[1].replace(/^"|"$/g, '') : null;
}

function parseSetting(output) {
  const value = String(output || '').trim().split(/\r?\n/)[0];
  if (!value || value === 'null') return null;
  return value === '1';
}

function parseWhichSu(output) {
  const lines = String(output || '').split(/\r?\n/).map((line) => line.trim());
  const path = lines.find((line) => /^\/.*\bsu$/.test(line) || /\/su$/.test(line));
  return path || null;
}

function normalizeRows(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  let parsed = null;
  for (const candidate of [text, text.slice(text.indexOf('[')), text.slice(text.indexOf('{'))]) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      /* next shape */
    }
  }
  if (!parsed) return [];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row) => row && (row.Name || row.DeviceID))
    .map((row) => {
      const code = Number(row.ConfigManagerErrorCode);
      return {
        name: String(row.Name || ''),
        deviceId: String(row.DeviceID || ''),
        errorCode: Number.isFinite(code) ? code : 0,
        status: row.Status || (Number.isFinite(code) && code !== 0 ? 'Error' : 'OK'),
        service: row.Service || null,
      };
    });
}

function parseWindowsDriverJson(raw) {
  const rows = normalizeRows(raw);
  const adbRegex = /ADB|Android|Huawei Composite|VID_12D1|VID_18D1/i;
  const qualcommRegex = /QUSB|QHSUSB|QDLoader|9008|VID_05C6.*PID_9008/i;
  const adb = rows.find((row) => adbRegex.test(`${row.name} ${row.deviceId}`) && row.errorCode === 0) || null;
  const qualcomm = rows.find((row) => qualcommRegex.test(`${row.name} ${row.deviceId}`)) || null;
  const problems = rows
    .filter((row) => row.errorCode !== 0 && (adbRegex.test(`${row.name} ${row.deviceId}`) || qualcommRegex.test(`${row.name} ${row.deviceId}`)))
    .map(({ name, deviceId, errorCode }) => ({ name, deviceId, errorCode }));
  return {
    adb: adb ? { present: true, name: adb.name } : { present: false, name: null },
    qualcomm: qualcomm
      ? { present: qualcomm.errorCode === 0, name: qualcomm.name, errorCode: qualcomm.errorCode }
      : { present: false, name: null, errorCode: null },
    problems,
    deviceCount: rows.length,
  };
}

function summarizeStatuses(statuses) {
  const counts = { pass: 0, warn: 0, fail: 0, pending: 0, unknown: 0 };
  for (const status of statuses) {
    if (status === 'pass' || status === 'ready') counts.pass += 1;
    else if (status === 'warn' || status === 'attention') counts.warn += 1;
    else if (status === 'fail' || status === 'blocked') counts.fail += 1;
    else if (status === 'pending') counts.pending += 1;
    else counts.unknown += 1;
  }
  return {
    ...counts,
    status: counts.fail > 0 ? 'blocked' : counts.warn > 0 ? 'attention' : 'ready',
    total: statuses.length,
  };
}

function collectStatuses(checks) {
  const statuses = [];
  for (const group of [checks.tools, checks.drivers, checks.phone, checks.apps]) {
    if (!group) continue;
    for (const value of Object.values(group)) {
      if (value && typeof value === 'object' && typeof value.status === 'string') statuses.push(value.status);
    }
  }
  return statuses;
}

module.exports = {
  firstLine,
  parseAdbVersion,
  parseFastbootVersion,
  parsePackageList,
  findManagerApps,
  parseVersionName,
  parseSetting,
  parseWhichSu,
  parseWindowsDriverJson,
  summarizeStatuses,
  collectStatuses,
};
