'use strict';

/**
 * Pure parsers for everything we read off the tablet or the PC.
 * No child processes, no filesystem: this file is unit-tested directly.
 */

const HARMONY_VERSION_KEYS = [
  'hw_sc.build.platform.version',
  'hw_sc.build.os.version',
  'ro.build.version.harmony',
  'ro.build.version.harmonyos',
  'persist.sys.ohc.version',
];

function parseAdbDevices(output) {
  if (!output) return [];
  const devices = [];
  for (const rawLine of String(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('List of devices')) continue;
    if (line.startsWith('*')) continue;
    if (line.startsWith('adb server')) continue;
    if (line.startsWith('daemon')) continue;
    if (line.includes('no permissions')) {
      const serial = line.split(/\s+/)[0];
      devices.push({ serial, state: 'no-permissions', props: {}, raw: line });
      continue;
    }
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const serial = tokens[0];
    const state = tokens[1];
    if (!/^(device|unauthorized|offline|recovery|sideload|bootloader|rescue)$/.test(state)) {
      continue;
    }
    const props = {};
    for (const token of tokens.slice(2)) {
      const idx = token.indexOf(':');
      if (idx > 0) props[token.slice(0, idx)] = token.slice(idx + 1);
    }
    devices.push({ serial, state, props, raw: line });
  }
  return devices;
}

function parseFastbootDevices(output) {
  if (!output) return [];
  const devices = [];
  for (const rawLine of String(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.includes('no permissions')) {
      devices.push({ serial: line.split(/\s+/)[0], state: 'no-permissions', raw: line });
      continue;
    }
    const tokens = line.split(/\s+/);
    if (tokens.length >= 2 && tokens[1] === 'fastboot') {
      devices.push({ serial: tokens[0], state: 'fastboot', raw: line });
    }
  }
  return devices;
}

function parseGetprop(output) {
  const props = {};
  if (!output) return props;
  for (const rawLine of String(output).split(/\r?\n/)) {
    const match = rawLine.match(/^\[([^\]]+)\]: \[(.*)\]\s*$/);
    if (match) props[match[1]] = match[2];
  }
  return props;
}

function detectHarmonyOS(props = {}) {
  const hasHuaweiProps = Object.keys(props).some((key) => /^hw_sc\.|harmony|ohc\./i.test(key));
  let version = null;
  let source = null;
  for (const key of HARMONY_VERSION_KEYS) {
    const value = String(props[key] || '').trim();
    if (value && /^\d+(\.\d+)+/.test(value)) {
      version = value;
      source = key;
      break;
    }
  }
  const android = String(props['ro.build.version.release'] || '').trim() || null;
  const sdk = String(props['ro.build.version.sdk'] || '').trim() || null;
  const api =
    String(props['hw_sc.build.os.apiversion'] || props['persist.sys.ohc.apiversion'] || '').trim() || null;
  const releaseType = String(props['hw_sc.build.os.releasetype'] || '').trim() || null;
  let major = null;
  if (version) {
    const parsed = Number.parseInt(version.split('.')[0], 10);
    if (Number.isFinite(parsed) && parsed >= 2) major = parsed;
  }
  return {
    isHuawei: hasHuaweiProps || Boolean(version),
    version,
    major,
    source,
    android,
    sdk,
    api,
    releaseType,
  };
}

function parseBattery(output) {
  if (!output) return null;
  const text = String(output);
  const levelMatch = text.match(/^\s*level:\s*(\d+)/m);
  if (!levelMatch) return null;
  const statusMatch = text.match(/^\s*status:\s*(\d+)/m);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  const usb = /^\s*USB powered:\s*true/m.test(text);
  const ac = /^\s*AC powered:\s*true/m.test(text);
  const wireless = /^\s*Wireless powered:\s*true/m.test(text);
  return {
    level: Number(levelMatch[1]),
    status,
    charging: status === 2 || status === 5 || usb || ac || wireless,
    usb,
    ac,
  };
}

function parseDf(output) {
  if (!output) return null;
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!/\/data\b/.test(line)) continue;
    const fields = line.split(/\s+/);
    if (fields.length < 4) continue;
    const totalKb = Number(fields[1]);
    const freeKb = Number(fields[3]);
    if (Number.isFinite(totalKb) && Number.isFinite(freeKb)) {
      return { totalBytes: totalKb * 1024, freeBytes: freeKb * 1024, raw: line };
    }
  }
  return null;
}

function parseFastbootGetvar(output, name) {
  if (!output) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|\\n)\\s*(?:\\(bootloader\\)\\s*)?${escaped}:\\s*([^\\r\\n]+)`, 'i');
  const match = String(output).match(regex);
  return match ? match[1].trim() : null;
}

function parseDotnetSdks(output) {
  const versions = [];
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][^\s]*)?(?:\s|$)/);
    if (match) versions.push(`${match[1]}.${match[2]}.${match[3]}`);
  }
  return { versions, has8: versions.some((v) => v.startsWith('8.')) };
}

function modelKind(model) {
  const normalized = String(model || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-');
  if (!normalized) return 'missing';
  if (normalized === 'DBY-W09') return 'supported';
  if (normalized === 'DBY-W09S') return 'global';
  return 'unsupported';
}

function routeUnlock({ harmonyMajor, unlocked }) {
  if (unlocked === true) {
    return {
      route: 'already-unlocked',
      tone: 'ready',
      title: 'Bootloader is already unlocked',
      detail: 'fastboot reports unlocked: yes. Do not re-run the unlock step; continue to root.',
    };
  }
  if (harmonyMajor === 2 || harmonyMajor === 3) {
    return {
      route: 'adb-edl',
      tone: 'ready',
      title: 'HarmonyOS 2/3 — ADB to EDL',
      detail:
        'The toolkit can reboot the tablet into 9008 over ADB, then write the unlock ABL. Some global 3.x builds ignore adb reboot edl; if no 9008 device appears, fall back to an engineering cable or downgrade to HarmonyOS 2.',
    };
  }
  if (harmonyMajor >= 4) {
    return {
      route: 'engineering',
      tone: 'attention',
      title: 'HarmonyOS 4 — engineering cable or downgrade',
      detail:
        'ADB cannot enter EDL on this branch. You need an engineering cable / test-point short to reach 9008, or you must downgrade to HarmonyOS 2/3 first. Do not start the ADB unlock method.',
    };
  }
  return {
    route: 'unknown',
    tone: 'unknown',
    title: 'HarmonyOS version unknown',
    detail:
      'Read Settings → About tablet and confirm the HarmonyOS version, or refresh the device. The unlock method cannot be chosen safely without it.',
  };
}

function evaluateGates(input = {}) {
  const {
    env = {},
    device = null,
    pcFreeBytes = null,
    inventory = null,
    backupAck = false,
    backupVerified = null,
    backupDetail = null,
    backupOverride = false,
    backupOverrideAt = null,
    toolkitReady = false,
    method = 'apatch',
  } = input;
  const gates = [];
  const push = (gate) => gates.push({ blocks: false, ...gate });

  push({
    id: 'windows',
    label: 'Windows PC',
    status: env.isWindows ? 'pass' : 'warn',
    detail: env.isWindows
      ? `${env.platformLabel || 'Windows'} · ${env.arch || 'x64'}`
      : 'Preview only: building and flashing require Windows 10/11 x64.',
    blocks: false,
  });

  push({
    id: 'toolkit',
    label: 'Upstream toolkit',
    status: toolkitReady ? 'pass' : 'fail',
    detail: toolkitReady ? 'MatePadToolbox.exe found in the workspace.' : 'Build or select the toolkit in Prepare.',
    blocks: !toolkitReady,
  });

  if (inventory) {
    const missing = inventory.requiredMissing || [];
    push({
      id: 'toolpack',
      label: 'Required files',
      status: missing.length === 0 ? 'pass' : 'fail',
      detail:
        missing.length === 0
          ? 'Every file this procedure needs is present.'
          : `${missing.length} required file(s) missing for ${method === 'apatch' ? 'APatch' : 'Magisk'} root.`,
      blocks: missing.length > 0,
    });
  }

  if (!device) {
    push({
      id: 'device',
      label: 'Tablet',
      status: 'unknown',
      detail: 'No tablet detected. Connect it with USB debugging enabled.',
      blocks: true,
    });
  } else if (device.state === 'unauthorized') {
    push({
      id: 'device',
      label: 'Tablet',
      status: 'fail',
      detail: 'USB debugging is not authorized. Accept the RSA prompt on the tablet.',
      blocks: true,
    });
  } else if (device.state !== 'device') {
    push({
      id: 'device',
      label: 'Tablet',
      status: 'fail',
      detail: `Tablet is in state “${device.state}”.`,
      blocks: true,
    });
  } else {
    const kind = modelKind(device.model);
    push({
      id: 'model',
      label: 'Device model',
      status: kind === 'supported' ? 'pass' : kind === 'global' ? 'warn' : 'fail',
      detail:
        kind === 'supported'
          ? 'DBY-W09 confirmed.'
          : kind === 'global'
            ? 'DBY-W09S: global name of the same hardware, but the upstream toolkit lists DBY-W09 only. Confirm before writing anything.'
            : `Model “${device.model || 'unknown'}” is not supported. This toolkit is DBY-W09 only.`,
      blocks: kind === 'unsupported' || kind === 'missing',
    });
    const os = device.os || {};
    push({
      id: 'os',
      label: 'HarmonyOS version',
      status: os.major ? 'pass' : 'warn',
      detail: os.version
        ? `${os.version}${os.android ? ` · Android ${os.android}` : ''}${os.api ? ` · API ${os.api}` : ''}`
        : 'Could not read hw_sc.build.platform.version. Check Settings → About tablet.',
      blocks: !os.major,
    });
    const level = device.battery?.level;
    if (typeof level !== 'number') {
      push({
        id: 'battery',
        label: 'Battery',
        status: 'warn',
        detail: 'Battery level unavailable. Charge above 60% before starting.',
        blocks: false,
      });
    } else {
      push({
        id: 'battery',
        label: 'Battery',
        status: level >= 60 ? 'pass' : level >= 40 ? 'warn' : 'fail',
        detail:
          level >= 60
            ? `${level}% — enough for a long EDL session.`
            : level >= 40
              ? `${level}% — charge above 60% before a 9008 backup or write.`
              : `${level}% — too low. Charge the tablet before continuing.`,
        blocks: level < 40,
      });
    }
  }

  if (pcFreeBytes == null) {
    push({
      id: 'disk',
      label: 'Free disk space',
      status: 'warn',
      detail: 'Free space could not be read. An EDL backup can take ~13 GB.',
      blocks: false,
    });
  } else if (pcFreeBytes < 15 * 1024 ** 3) {
    push({
      id: 'disk',
      label: 'Free disk space',
      status: 'fail',
      detail: 'Less than 15 GB free. A full EDL backup needs about 13 GB plus working room.',
      blocks: true,
    });
  } else if (pcFreeBytes < 40 * 1024 ** 3) {
    push({
      id: 'disk',
      label: 'Free disk space',
      status: 'warn',
      detail: 'Under 40 GB free. Enough for the backup, tight if you also keep firmware images.',
      blocks: false,
    });
  } else {
    push({
      id: 'disk',
      label: 'Free disk space',
      status: 'pass',
      detail: 'Room for the EDL backup and firmware images.',
      blocks: false,
    });
  }

  push({
    id: 'backup',
    label: 'Backup acknowledged',
    status: backupAck ? 'pass' : 'fail',
    detail: backupAck
      ? 'You have confirmed a backup plan and that unlock erases all data.'
      : 'Confirm the data-loss / backup acknowledgement before the unlock step.',
    blocks: !backupAck,
  });

  if (typeof backupVerified === 'boolean') {
    const overridden = !backupVerified && Boolean(backupOverride);
    push({
      id: 'backup-files',
      label: 'EDL backup folder',
      status: backupVerified ? 'pass' : overridden ? 'warn' : 'fail',
      detail: backupVerified
        ? backupDetail || 'A backup folder was recorded and scanned.'
        : overridden
          ? `Backup deliberately skipped${backupOverrideAt ? ` on ${backupOverrideAt}` : ''}. No recovery image exists.`
          : 'Choose and record a backup folder containing images and GPT/rawprogram XML before unlocking.',
      blocks: !backupVerified && !overridden,
    });
  }

  return gates;
}

function summarizeGates(gates) {
  const blocking = gates.filter((gate) => gate.blocks);
  const failed = gates.filter((gate) => gate.status === 'fail');
  const warned = gates.filter((gate) => gate.status === 'warn');
  return {
    gates,
    blocking,
    failed,
    warned,
    canProceed: blocking.length === 0,
    status: blocking.length > 0 ? 'blocked' : warned.length > 0 ? 'attention' : 'ready',
  };
}

module.exports = {
  HARMONY_VERSION_KEYS,
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
};
