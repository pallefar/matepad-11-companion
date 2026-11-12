'use strict';

const { runCapture } = require('./shell');
const {
  parseAdbVersion,
  parseFastbootVersion,
  parseWindowsDriverJson,
  summarizeStatuses,
  collectStatuses,
} = require('../core/checks');
const { makeDemoChecks } = require('./demo');

const DRIVER_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue';",
  "$rows = Get-CimInstance Win32_PnPEntity | Where-Object {",
  "  $_.Name -match 'ADB|Android|Huawei|Qualcomm|QUSB|QHSUSB|QDLoader|9008' -or",
  "  $_.DeviceID -match 'VID_12D1|VID_18D1|VID_05C6'",
  "} | Select-Object Name, DeviceID, ConfigManagerErrorCode, Status, Service;",
  "if ($rows) { $rows | ConvertTo-Json -Compress -Depth 3 }",
].join(' ');

function createChecksService({ store, logger, environment }) {
  let cached = null;
  let cachedAt = 0;
  let running = null;

  function isDemo() {
    return Boolean(store.get().demo);
  }

  async function toolCheck(command, args, parser, label) {
    if (!command) {
      return {
        label,
        status: 'fail',
        path: null,
        version: null,
        detail: `${label} was not found. Install platform-tools in the tool pack or put it on PATH.`,
      };
    }
    const result = await runCapture(command, args, { timeoutMs: 10000 });
    const parsed = parser(result.combined);
    if (result.code === 0) {
      return {
        label,
        status: 'pass',
        path: command,
        version: parsed.version || null,
        detail: parsed.raw || `${label} runs`,
      };
    }
    return {
      label,
      status: 'fail',
      path: command,
      version: parsed.version || null,
      detail: firstProblem(result) || `${label} did not run`,
    };
  }

  function firstProblem(result) {
    return String(result.combined || result.error || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || null;
  }

  async function runToolChecks(env) {
    const adb = await toolCheck(env.adbPath || env.systemAdb, ['version'], parseAdbVersion, 'adb');
    const fastboot = await toolCheck(
      env.fastbootPath || env.systemFastboot,
      ['--version'],
      parseFastbootVersion,
      'fastboot',
    );
    const sevenZipPath = env.isWindows ? require('node:path').join(store.get().workspace, 'tools', '7z.exe') : null;
    const sevenZip = env.isWindows
      ? {
          label: '7-Zip',
          status: require('node:fs').existsSync(sevenZipPath) ? 'pass' : 'fail',
          path: sevenZipPath,
          version: null,
          detail: require('node:fs').existsSync(sevenZipPath) ? '7z.exe is present' : '7z.exe is missing from the tool pack',
        }
      : {
          label: '7-Zip',
          status: 'pending',
          path: null,
          version: null,
          detail: 'Windows-only workspace tool; not needed on this host',
        };
    return { adb, fastboot, sevenZip };
  }

  async function runDriverChecks(env, device) {
    if (!env.isWindows) {
      return {
        supported: false,
        adb: { status: 'unknown', present: null, name: null, detail: 'Windows-only check; adb connectivity is the proof here.' },
        qualcomm: { status: 'unknown', present: null, name: null, detail: 'Windows-only check; the 9008 port appears only in EDL mode.' },
        problems: [],
        detail: 'Driver inspection is available on Windows.',
      };
    }
    if (!env.powershell?.found) {
      return {
        supported: true,
        adb: { status: 'unknown', present: null, name: null, detail: 'PowerShell was not found; driver check skipped.' },
        qualcomm: { status: 'unknown', present: null, name: null, detail: 'PowerShell was not found; driver check skipped.' },
        problems: [],
        detail: 'PowerShell missing',
      };
    }
    const result = await runCapture(
      env.powershell.path,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', DRIVER_SCRIPT],
      { timeoutMs: 20000 },
    );
    const parsed = parseWindowsDriverJson(result.combined);
    const adbConnected = device?.state === 'device';
    const devicePresent = ['device', 'unauthorized'].includes(device?.state);
    const adb = parsed.adb.present
      ? { status: 'pass', present: true, name: parsed.adb.name, detail: parsed.adb.name }
      : adbConnected
        ? { status: 'pass', present: true, name: null, detail: 'ADB is responding, so the ADB interface driver is working.' }
        : devicePresent
          ? { status: 'warn', present: false, name: null, detail: 'No ADB interface found for the attached tablet. Reinstall the ADB driver.' }
          : { status: 'pending', present: false, name: null, detail: 'Connect the tablet to check the ADB interface driver.' };
    const qualcomm = parsed.qualcomm.present
      ? { status: 'pass', present: true, name: parsed.qualcomm.name, detail: parsed.qualcomm.name }
      : {
          status: 'unknown',
          present: false,
          name: null,
          detail: 'No Qualcomm 9008 port is present. This is normal unless the tablet is in EDL mode.',
        };
    const problems = parsed.problems;
    let detail = '';
    if (result.code !== 0) detail = firstProblem(result) || 'The driver query failed.';
    else if (problems.length) detail = `${problems.length} related device(s) report a driver problem.`;
    else if (parsed.adb.present || parsed.qualcomm.present) detail = `${parsed.deviceCount} related Windows device(s) found.`;
    else detail = 'No Huawei/Qualcomm/Android devices are currently attached.';
    return {
      supported: true,
      adb,
      qualcomm,
      problems,
      detail,
      deviceCount: parsed.deviceCount,
    };
  }

  function phoneChecks(device) {
    const connected = device?.state === 'device';
    const settings = device?.developer || {};
    const apps = device?.apps || {};
    const su = apps.su || {};
    const boot = device?.bootloader || {};
    if (!connected) {
      return {
        connection: {
          status: device?.state === 'unauthorized' ? 'fail' : 'pending',
          detail:
            device?.state === 'unauthorized'
              ? 'Device is unauthorized. Accept the USB debugging prompt on the tablet.'
              : 'No authorized tablet is connected.',
        },
        usbDebug: { status: 'pending', detail: 'Connect the tablet with USB debugging enabled.' },
        developer: { status: 'unknown', detail: 'Connect the tablet to read Developer options.' },
        adbEnabled: { status: 'unknown', detail: 'Connect the tablet to read the USB debugging setting.' },
        bootloader: { status: 'unknown', detail: 'Connect the tablet to read the bootloader state.' },
        root: { status: 'unknown', detail: 'Connect the tablet to check for su.' },
      };
    }
    return {
      connection: { status: 'pass', detail: `${device.serialMasked || 'device'} · ${device.model || 'unknown model'}` },
      usbDebug: { status: 'pass', detail: 'USB debugging is authorized and adb can read the device.' },
      developer: settings.settingsEnabled === true
        ? { status: 'pass', detail: 'Developer options are enabled.' }
        : settings.settingsEnabled === false
          ? { status: 'warn', detail: 'Developer options are off. Enable them to use adb.' }
          : { status: 'unknown', detail: 'Developer options state could not be read.' },
      adbEnabled: settings.adbEnabled === true
        ? { status: 'pass', detail: 'USB debugging setting is on.' }
        : settings.adbEnabled === false
          ? { status: 'warn', detail: 'USB debugging is off in Developer options.' }
          : { status: 'unknown', detail: 'USB debugging setting could not be read.' },
      bootloader: boot.unlocked === true
        ? { status: 'pass', detail: 'Bootloader reports unlocked.' }
        : boot.unlocked === false
          ? { status: 'pending', detail: 'Bootloader is locked (expected before unlock).' }
          : { status: 'unknown', detail: 'Bootloader state is unknown.' },
      root: su.present || device?.rootVerified
        ? { status: 'pass', detail: su.path ? `su found at ${su.path}` : 'Root was verified by the app.' }
        : { status: 'pending', detail: 'No su binary found; the tablet is not rooted yet.' },
    };
  }

  function appChecks(device) {
    const apps = device?.apps || {};
    const connected = device?.state === 'device';
    const row = (entry, label) => {
      const installed = Boolean(entry?.installed);
      if (!connected) {
        return {
          status: 'pending',
          installed: false,
          package: null,
          version: null,
          detail: `Connect the tablet to read the ${label} manager.`,
        };
      }
      return {
        status: installed ? 'pass' : 'pending',
        installed,
        package: entry?.package || null,
        version: entry?.version || null,
        detail: installed
          ? `${label} manager installed${entry.version ? ` · v${entry.version}` : ''}${entry.package ? ` · ${entry.package}` : ''}`
          : `${label} manager is not installed on the tablet.`,
      };
    };
    const su = apps.su || {};
    return {
      magisk: row(apps.magisk, 'Magisk'),
      apatch: row(apps.apatch, 'APatch'),
      kernelsu: row(apps.kernelsu, 'KernelSU'),
      su: {
        status: connected ? (su.present ? 'pass' : 'pending') : 'unknown',
        installed: connected && Boolean(su.present),
        path: su.path || null,
        detail: connected
          ? su.present
            ? `su found at ${su.path}`
            : 'No su binary found on the tablet.'
          : 'Connect the tablet to check for su.',
      },
    };
  }

  function buildResult({ tools, drivers, phone, apps }) {
    const summary = summarizeStatuses(collectStatuses({ tools, drivers, phone, apps }));
    return {
      checkedAt: new Date().toISOString(),
      tools,
      drivers,
      phone,
      apps,
      summary,
    };
  }

  async function runAll({ device, force = false } = {}) {
    if (isDemo()) {
      cached = makeDemoChecks(makeDemoDeviceFallback(device));
      cachedAt = Date.now();
      return cached;
    }
    if (!force && cached && Date.now() - cachedAt < 15000) return cached;
    if (running) return running;
    running = (async () => {
      const env = await environment.get({ force: true });
      const tools = await runToolChecks(env);
      const drivers = await runDriverChecks(env, device);
      const phone = phoneChecks(device);
      const apps = appChecks(device);
      const result = buildResult({ tools, drivers, phone, apps });
      cached = result;
      cachedAt = Date.now();
      logger.info(
        'checks',
        `adb=${tools.adb.status} fastboot=${tools.fastboot.status} drivers=${drivers.adb.status}/${drivers.qualcomm.status} apps=${apps.magisk.installed ? 'magisk' : 'no-magisk'}`,
      );
      return result;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  function makeDemoDeviceFallback(device) {
    if (device) return device;
    try {
      return require('./demo').makeDemoDevice();
    } catch {
      return null;
    }
  }

  return {
    runAll,
    getCached: () => cached,
    isRunning: () => Boolean(running),
  };
}

module.exports = { createChecksService, DRIVER_SCRIPT };
