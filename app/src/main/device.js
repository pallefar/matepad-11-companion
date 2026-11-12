'use strict';

const { runCapture } = require('./shell');
const {
  parseAdbDevices,
  parseFastbootDevices,
  parseGetprop,
  detectHarmonyOS,
  parseBattery,
  parseDf,
  parseFastbootGetvar,
  modelKind,
} = require('../core/parse');
const { maskSerial } = require('../core/commands');
const { makeDemoDevice } = require('./demo');

const PROP_KEYS = [
  'ro.product.model',
  'ro.product.name',
  'ro.product.device',
  'ro.build.display.id',
  'ro.build.version.release',
  'ro.build.version.sdk',
  'ro.build.version.security_patch',
  'hw_sc.build.platform.version',
  'hw_sc.build.os.apiversion',
  'hw_sc.build.os.releasetype',
  'persist.sys.ohc.apiversion',
  'ro.boot.flash.locked',
  'ro.boot.verifiedbootstate',
  'ro.boot.vbmeta.device_state',
  'ro.boot.slot_suffix',
];

function inferBootloader(props) {
  const flashLocked = props['ro.boot.flash.locked'];
  const verified = props['ro.boot.verifiedbootstate'];
  const deviceState = props['ro.boot.vbmeta.device_state'];
  let unlocked = null;
  if (flashLocked === '0') unlocked = true;
  else if (flashLocked === '1') unlocked = false;
  else if (verified && String(verified).toLowerCase() === 'orange') unlocked = true;
  else if (verified && ['green', 'yellow'].includes(String(verified).toLowerCase())) unlocked = false;
  else if (deviceState) unlocked = String(deviceState).toLowerCase() === 'unlocked';
  return { unlocked, source: 'props', verifiedBootState: verified || null, flashLocked: flashLocked || null };
}

function selectProps(props) {
  const result = {};
  for (const key of PROP_KEYS) {
    if (props[key] != null && props[key] !== '') result[key] = props[key];
  }
  const harmonyKeys = Object.keys(props)
    .filter((key) => /^(hw_sc\.|persist\.sys\.ohc\.)|harmony/i.test(key))
    .slice(0, 16);
  for (const key of harmonyKeys) {
    if (result[key] == null) result[key] = props[key];
  }
  return result;
}

function createDeviceService({ store, logger, environment }) {
  let lastDevice = null;
  let lastFastboot = null;
  let refreshing = null;

  function isDemo() {
    return Boolean(store.get().demo);
  }

  function resolved(env, key, fallbackName) {
    return env[key] || env.systemAdb || fallbackName;
  }

  async function adb(args, { timeoutMs = 15000 } = {}) {
    const env = await environment.get();
    const command = resolved(env, 'adbPath', 'adb');
    if (!command) {
      return { code: -1, combined: '', error: 'adb not found' };
    }
    const result = await runCapture(command, args, { timeoutMs });
    return result;
  }

  async function deviceAdb(serial, args, options = {}) {
    return adb(['-s', serial, ...args], options);
  }

  async function refresh() {
    if (isDemo()) {
      lastDevice = makeDemoDevice();
      return lastDevice;
    }
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const env = await environment.get();
      const adbCommand = resolved(env, 'adbPath', 'adb');
      if (!adbCommand) {
        logger.warn('device', 'adb was not found. Install platform-tools in the tool pack, or put adb on PATH.');
        lastDevice = {
          connected: false,
          state: 'no-adb',
          error: 'adb not found',
          detectedAt: new Date().toISOString(),
        };
        return lastDevice;
      }
      logger.info('adb', `adb: ${adbCommand}`);
      await adb(['start-server'], { timeoutMs: 8000 });
      const result = await adb(['devices', '-l'], { timeoutMs: 10000 });
      const devices = parseAdbDevices(result.combined);
      if (devices.length === 0) {
        logger.info('device', 'No ADB device detected.');
        lastDevice = {
          connected: false,
          state: 'no-device',
          error: result.code === 0 ? null : result.error,
          detectedAt: new Date().toISOString(),
        };
        return lastDevice;
      }
      const chosen = devices[0];
      const serial = chosen.serial;
      const masked = maskSerial(serial);
      if (devices.length > 1) {
        logger.warn('device', `${devices.length} ADB devices found; using ${masked}. Disconnect the others to avoid writing to the wrong tablet.`);
      }
      if (chosen.state !== 'device') {
        logger.warn('device', `Tablet ${masked} is ${chosen.state}.`);
        lastDevice = {
          connected: true,
          state: chosen.state,
          serial,
          serialMasked: masked,
          model: chosen.props.model || null,
          product: chosen.props.product || null,
          detectedAt: new Date().toISOString(),
          props: {},
          os: { major: null, version: null },
        };
        return lastDevice;
      }

      const [propResult, batteryResult, dfResult] = await Promise.all([
        deviceAdb(serial, ['shell', 'getprop'], { timeoutMs: 15000 }),
        deviceAdb(serial, ['shell', 'dumpsys', 'battery'], { timeoutMs: 10000 }),
        deviceAdb(serial, ['shell', 'df', '-k', '/data'], { timeoutMs: 10000 }),
      ]);
      const props = parseGetprop(propResult.combined);
      const os = detectHarmonyOS(props);
      const battery = parseBattery(batteryResult.combined);
      const storage = parseDf(dfResult.combined);
      const model = props['ro.product.model'] || chosen.props.model || null;
      const bootloader = inferBootloader(props);
      const profile = {
        connected: true,
        state: 'device',
        serial,
        serialMasked: masked,
        model,
        product: props['ro.product.name'] || chosen.props.product || null,
        name: props['ro.product.device'] || null,
        os,
        battery,
        storage,
        bootloader,
        rootVerified: null,
        build: props['ro.build.display.id'] || null,
        securityPatch: props['ro.build.version.security_patch'] || null,
        detectedAt: new Date().toISOString(),
        props: selectProps(props),
        multiple: devices.length > 1,
      };
      lastDevice = profile;
      const kind = modelKind(model);
      logger.info(
        'device',
        `${model || 'Unknown model'} · HarmonyOS ${os.version || 'unknown'} · Android ${os.android || '?'} · battery ${battery?.level ?? '?'}%`,
      );
      if (kind === 'unsupported') {
        logger.error('device', `Model ${model} is not supported. Stop before any write.`);
      } else if (kind === 'global') {
        logger.warn('device', 'DBY-W09S is the global name of the same hardware, but the toolkit lists DBY-W09 only.');
      }
      if (bootloader.unlocked === true) logger.info('device', 'Bootloader reported unlocked by ro.boot properties.');
      if (bootloader.unlocked === false) logger.info('device', 'Bootloader reported locked by ro.boot properties.');
      return profile;
    })();
    try {
      return await refreshing;
    } finally {
      refreshing = null;
    }
  }

  async function checkFastboot() {
    if (isDemo()) {
      return {
        state: 'none',
        demo: true,
        message: 'Demo mode: no fastboot command was run.',
        checkedAt: new Date().toISOString(),
      };
    }
    const env = await environment.get();
    const command = env.fastbootPath || env.systemFastboot;
    if (!command) {
      return { state: 'no-fastboot-tool', error: 'fastboot not found', checkedAt: new Date().toISOString() };
    }
    const devicesResult = await runCapture(command, ['devices'], { timeoutMs: 10000 });
    const devices = parseFastbootDevices(devicesResult.combined);
    if (devices.length === 0) {
      logger.info('fastboot', 'No fastboot device detected. Reboot the tablet to bootloader first.');
      lastFastboot = { state: 'none', checkedAt: new Date().toISOString() };
      return lastFastboot;
    }
    const serial = devices[0].serial;
    const unlockedResult = await runCapture(command, ['-s', serial, 'getvar', 'unlocked'], { timeoutMs: 10000 });
    const userspaceResult = await runCapture(command, ['-s', serial, 'getvar', 'is-userspace'], { timeoutMs: 10000 });
    const unlockedValue = parseFastbootGetvar(unlockedResult.combined, 'unlocked');
    const userspace = parseFastbootGetvar(userspaceResult.combined, 'is-userspace');
    const unlocked = unlockedValue == null ? null : /yes|true|1/i.test(unlockedValue);
    logger.good(
      'fastboot',
      `fastboot device ${maskSerial(serial)}: unlocked=${unlockedValue ?? 'unknown'}, is-userspace=${userspace ?? 'unknown'}`,
    );
    if (lastDevice && lastDevice.connected) {
      lastDevice.bootloader = {
        ...(lastDevice.bootloader || {}),
        unlocked,
        source: 'fastboot',
        checkedAt: new Date().toISOString(),
      };
    }
    if (unlocked) {
      store.update((draft) => {
        draft.progress.unlock.completed = true;
        draft.progress.unlock.completedAt = new Date().toISOString();
        draft.progress.unlock.verifiedBy = 'fastboot getvar unlocked';
        return draft;
      });
    }
    lastFastboot = {
      state: 'fastboot',
      serialMasked: maskSerial(serial),
      unlocked,
      unlockedRaw: unlockedValue,
      userspace,
      checkedAt: new Date().toISOString(),
    };
    return lastFastboot;
  }

  async function verifyRoot() {
    if (isDemo()) {
      return { ok: false, demo: true, message: 'Demo mode: no su command was run on a device.' };
    }
    if (!lastDevice || lastDevice.state !== 'device') {
      return { ok: false, error: 'No authorized tablet. Refresh the device first.' };
    }
    const result = await deviceAdb(lastDevice.serial, ['shell', 'su', '-c', 'id'], { timeoutMs: 20000 });
    const output = `${result.combined || ''}`.trim();
    const ok = /\buid=0\(root\)/.test(output);
    logger.log(ok ? 'good' : 'warn', 'root', ok ? 'su -c id returned uid=0(root).' : `su -c id did not confirm root: ${output.slice(0, 300) || result.error || 'no output'}`);
    if (ok) {
      lastDevice.rootVerified = true;
      store.update((draft) => {
        draft.progress.root.completed = true;
        draft.progress.root.completedAt = new Date().toISOString();
        draft.progress.root.verifiedBy = 'adb shell su -c id';
        return draft;
      });
    }
    return { ok, output: output.slice(0, 1200), code: result.code, timedOut: result.timedOut };
  }

  async function installApk(apkPath) {
    if (isDemo()) return { ok: false, demo: true, message: 'Demo mode: no APK was installed.' };
    if (!lastDevice || lastDevice.state !== 'device') return { ok: false, error: 'No authorized tablet.' };
    const result = await deviceAdb(lastDevice.serial, ['install', '-r', apkPath], { timeoutMs: 180000 });
    const ok = result.code === 0 && /Success/i.test(result.combined);
    logger.log(ok ? 'good' : 'error', 'adb', ok ? `APK installed: ${apkPath}` : `APK install failed: ${result.combined.slice(0, 400)}`);
    return { ok, output: result.combined.slice(0, 1200) };
  }

  async function reboot(mode) {
    if (isDemo()) return { ok: false, demo: true, message: 'Demo mode: no reboot command was run.' };
    if (!lastDevice || lastDevice.state !== 'device') return { ok: false, error: 'No authorized tablet.' };
    const target = mode === 'bootloader' ? ['reboot', 'bootloader'] : ['reboot'];
    const result = await deviceAdb(lastDevice.serial, target, { timeoutMs: 15000 });
    const ok = result.code === 0;
    logger.log(ok ? 'info' : 'error', 'adb', ok ? `Reboot requested: ${mode || 'system'}` : `Reboot failed: ${result.combined.slice(0, 300)}`);
    return { ok, output: result.combined.slice(0, 600) };
  }

  async function reconnect() {
    if (isDemo()) return { ok: false, demo: true };
    await adb(['kill-server'], { timeoutMs: 8000 });
    const result = await adb(['start-server'], { timeoutMs: 10000 });
    logger.info('adb', 'ADB server restarted.');
    return { ok: result.code === 0, output: result.combined.slice(0, 400) };
  }

  return {
    refresh,
    checkFastboot,
    verifyRoot,
    installApk,
    reboot,
    reconnect,
    getLastDevice: () => lastDevice,
    getLastFastboot: () => lastFastboot,
    isDemo,
  };
}

module.exports = { createDeviceService, inferBootloader, selectProps };
