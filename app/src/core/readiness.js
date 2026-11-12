'use strict';

const { modelKind } = require('./parse');

const STEP_DEFS = [
  {
    id: 'pc',
    label: 'This PC',
    view: 'prepare',
    short: 'Windows, space, .NET',
  },
  {
    id: 'toolkit',
    label: 'Toolkit',
    view: 'prepare',
    short: 'Upstream app built or selected',
  },
  {
    id: 'toolpack',
    label: 'Tool pack',
    view: 'tools',
    short: 'Unlock, EDL and root files',
  },
  {
    id: 'device',
    label: 'Device',
    view: 'device',
    short: 'DBY-W09 on the right HarmonyOS',
  },
  {
    id: 'unlock',
    label: 'Unlock',
    view: 'unlock',
    short: 'Bootloader unlocked and verified',
  },
  {
    id: 'root',
    label: 'Root',
    view: 'root',
    short: 'APatch or Magisk verified',
  },
];

function deviceStep(device) {
  if (!device) {
    return {
      status: 'pending',
      detail: 'No tablet detected yet.',
    };
  }
  if (device.state === 'unauthorized') {
    return {
      status: 'blocked',
      detail: 'USB debugging is unauthorized. Accept the prompt on the tablet.',
    };
  }
  if (device.state !== 'device') {
    return {
      status: 'blocked',
      detail: `Tablet is in state “${device.state}”.`,
    };
  }
  const kind = modelKind(device.model);
  if (kind === 'unsupported' || kind === 'missing') {
    return {
      status: 'blocked',
      detail: `Model “${device.model || 'unknown'}” is not a DBY-W09. Stop.`,
    };
  }
  if (!device.os || !device.os.major) {
    return {
      status: 'attention',
      detail: 'Connected, but the HarmonyOS version could not be read.',
    };
  }
  const level = device.battery?.level;
  if (typeof level === 'number' && level < 40) {
    return {
      status: 'blocked',
      detail: `Battery at ${level}%. Charge before any EDL work.`,
    };
  }
  if (kind === 'global') {
    return {
      status: 'attention',
      detail: 'DBY-W09S reported. Confirm the global-model caveat before writing.',
    };
  }
  if (typeof level === 'number' && level < 60) {
    return {
      status: 'attention',
      detail: `HarmonyOS ${device.os.version || device.os.major} · battery ${level}%. Charge above 60% first.`,
    };
  }
  return {
    status: 'ready',
    detail: `HarmonyOS ${device.os.version || device.os.major}${level != null ? ` · ${level}%` : ''} · DBY-W09`,
  };
}

function computeReadiness(input = {}) {
  const { env = {}, state = {}, inventory = null, device = null, toolkitPresent = false } = input;
  const steps = [];

  const pcFree = env.freeBytes;
  let pcStatus = 'ready';
  let pcDetail = env.isWindows
    ? `${env.platformLabel || 'Windows'} · ${env.arch || 'x64'} · ${pcFree != null ? `${(pcFree / 1024 ** 3).toFixed(1)} GB free` : 'free space unknown'}`
    : 'Preview only — the build and flashing steps require Windows 10/11 x64.';
  if (!env.isWindows) pcStatus = 'attention';
  else if (pcFree != null && pcFree < 15 * 1024 ** 3) pcStatus = 'blocked';
  steps.push({ ...STEP_DEFS[0], status: pcStatus, detail: pcDetail });

  steps.push({
    ...STEP_DEFS[1],
    status: toolkitPresent ? 'ready' : 'pending',
    detail: toolkitPresent
      ? state.toolkitPath || 'MatePadToolbox.exe is ready.'
      : 'Download the upstream source and build it, or select an existing toolkit folder.',
  });

  if (!inventory) {
    steps.push({ ...STEP_DEFS[2], status: 'pending', detail: 'Workspace not scanned yet.' });
  } else {
    const missing = inventory.requiredMissing || [];
    steps.push({
      ...STEP_DEFS[2],
      status: missing.length === 0 ? 'ready' : 'attention',
      detail:
        missing.length === 0
          ? `${inventory.requiredPresent}/${inventory.requiredCount} required files present.`
          : `${missing.length} of ${inventory.requiredCount} required files missing.`,
    });
  }

  const dev = deviceStep(device);
  steps.push({ ...STEP_DEFS[3], ...dev });

  const unlocked = Boolean(device?.bootloader?.unlocked || state.progress?.unlock?.completed);
  steps.push({
    ...STEP_DEFS[4],
    status: unlocked ? 'ready' : 'pending',
    detail: unlocked
      ? device?.bootloader?.unlocked
        ? 'fastboot reports unlocked: yes.'
        : 'Marked complete — verify with fastboot when convenient.'
      : 'Not unlocked yet. This erases all data.',
  });

  const rooted = Boolean(device?.rootVerified || state.progress?.root?.completed);
  steps.push({
    ...STEP_DEFS[5],
    status: rooted ? 'ready' : 'pending',
    detail: rooted
      ? device?.rootVerified
        ? 'su -c id returned uid=0.'
        : 'Marked complete — verify with su -c id when convenient.'
      : 'Root not verified yet.',
  });

  const requiredMissing = inventory?.requiredMissing || [];
  const modelOk = device ? modelKind(device.model) !== 'unsupported' && modelKind(device.model) !== 'missing' : false;
  const battery = device?.battery?.level;
  const batteryOk = typeof battery !== 'number' || battery >= 40;
  const canUnlock = Boolean(
    env.isWindows &&
      toolkitPresent &&
      requiredMissing.length === 0 &&
      device &&
      device.state === 'device' &&
      modelOk &&
      device.os?.major &&
      batteryOk &&
      state.acknowledgements?.unlockWipe,
  );
  const canRoot = Boolean(canUnlock && unlocked);

  const readyCount = steps.filter((step) => step.status === 'ready').length;
  const nextStep = steps.find((step) => step.status !== 'ready') || steps[steps.length - 1];

  return {
    steps,
    readyCount,
    total: steps.length,
    percent: Math.round((readyCount / steps.length) * 100),
    canUnlock,
    canRoot,
    unlocked,
    rooted,
    nextStep,
    device: dev,
  };
}

module.exports = { STEP_DEFS, computeReadiness, deviceStep };
