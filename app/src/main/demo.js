'use strict';

const { summarizeStatuses, collectStatuses } = require('../core/checks');

const { ITEMS, summarize } = require('../core/inventory');

function demoBytes(rel) {
  const sizes = {
    'tools/adb.exe': 8_125_952,
    'tools/fastboot.exe': 2_245_632,
    'tools/7z.exe': 1_450_496,
    'tools/QSaharaServer.exe': 1_146_880,
    'tools/fh_loader.exe': 2_131_968,
    'tools/ptool.exe': 892_928,
    'unlock/Huawei865870_devprg.elf': 697_648,
    'unlock/Huawei865870_abl_unlock.img': 602_112,
    'tools/apatch_tools/kptools.exe': 782_336,
    'tools/apatch_tools/kpimg-android': 296_336,
    'tools/apks/Apatch.apk': 6_716_426,
    'tools/apks/Magisk.apk': 10_679_283,
  };
  return sizes[rel] || 0;
}

function makeDemoInventory(method = 'apatch') {
  const present = new Set([
    'adb',
    'fastboot',
    '7zip',
    'qsahara',
    'fh_loader',
    'ptool',
    'devprg',
    'abl_unlock',
    'kptools',
    'kpimg',
    'apatch_apk',
  ]);
  const items = ITEMS.map((item) => {
    const isPresent = present.has(item.id);
    const rel = item.dynamic === 'ramdisk' ? 'ramdisk/magisk_patched_31000.img' : item.rel;
    return {
      ...item,
      rel,
      present: isPresent,
      bytes: isPresent ? demoBytes(item.rel) || 4096 : 0,
      mtime: isPresent ? '2026-11-08T16:24:00.000Z' : null,
      hash: null,
      sourceLabel: item.source === 'user' ? 'Tool pack import' : undefined,
    };
  });
  const summary = summarize(items, method, { ramdiskCount: 0 });
  return {
    ...summary,
    items,
    demo: true,
    scannedAt: new Date().toISOString(),
  };
}

function makeDemoEnvironment() {
  return {
    isWindows: true,
    platform: 'win32',
    release: '10.0.26100',
    platformLabel: 'Windows 11 24H2',
    arch: 'x64',
    freeBytes: 91.4 * 1024 ** 3,
    totalBytes: 512 * 1024 ** 3,
    powershell: {
      found: true,
      path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    },
    dotnet: {
      found: true,
      path: 'C:\\Program Files\\dotnet\\dotnet.exe',
      versions: ['8.0.133', '9.0.301'],
      has8: true,
      source: 'PATH',
    },
    toolkit: {
      present: true,
      path: 'C:\\MatePad11\\MatePadToolbox.exe',
      exe: 'C:\\MatePad11\\MatePadToolbox.exe',
      sourcePresent: true,
      csproj: 'C:\\MatePad11\\.setup\\src\\MatePadToolbox\\MatePadToolbox.csproj',
      sourceUrl: 'https://github.com/run2000s/MatePad11_Tool_Kit_GUI',
      commit: 'd4c1b8e',
    },
    adbPath: 'C:\\MatePad11\\tools\\adb.exe',
    fastbootPath: 'C:\\MatePad11\\tools\\fastboot.exe',
    demo: true,
  };
}

function makeDemoDevice() {
  return {
    connected: true,
    state: 'device',
    demo: true,
    serial: 'FMR0220A28001234',
    serialMasked: '••••••••••1234',
    model: 'DBY-W09',
    product: 'DBY-W09',
    name: 'HUAWEI MatePad 11',
    os: {
      isHuawei: true,
      version: '3.0.0.168',
      major: 3,
      source: 'hw_sc.build.platform.version',
      android: '11',
      sdk: '30',
      api: '11',
      releaseType: 'release',
    },
    battery: { level: 76, charging: true, usb: true, status: 2 },
    storage: { freeBytes: 41.2 * 1024 ** 3, totalBytes: 128 * 1024 ** 3 },
    bootloader: { unlocked: false, source: 'props', verifiedBootState: 'green', flashLocked: '1' },
    rootVerified: false,
    apps: {
      magisk: { installed: true, package: 'com.topjohnwu.magisk', version: '31.1' },
      apatch: { installed: false, package: null, version: null },
      kernelsu: { installed: false, package: null, version: null },
      su: { present: false, path: null },
    },
    developer: { settingsEnabled: true, adbEnabled: true },
    build: 'DBY-W09 3.0.0.168(C00E160R2P3)',
    securityPatch: '2022-08-01',
    detectedAt: new Date().toISOString(),
    props: {
      'ro.product.model': 'DBY-W09',
      'ro.product.name': 'DBY-W09',
      'ro.product.device': 'DBY-W09',
      'ro.build.display.id': 'DBY-W09 3.0.0.168(C00E160R2P3)',
      'ro.build.version.release': '11',
      'ro.build.version.sdk': '30',
      'hw_sc.build.platform.version': '3.0.0.168',
      'hw_sc.build.os.apiversion': '11',
      'hw_sc.build.os.releasetype': 'release',
      'ro.boot.flash.locked': '1',
      'ro.boot.verifiedbootstate': 'green',
      'ro.boot.vbmeta.device_state': 'locked',
      'ro.build.version.security_patch': '2022-08-01',
    },
  };
}


function makeDemoChecks(device = makeDemoDevice()) {
  const apps = device.apps || {};
  const tools = {
    adb: { label: 'adb', status: 'pass', path: 'C:\\MatePad11\\tools\\adb.exe', version: '1.0.41 (36.0.2)', detail: 'Android Debug Bridge version 1.0.41' },
    fastboot: { label: 'fastboot', status: 'pass', path: 'C:\\MatePad11\\tools\\fastboot.exe', version: '36.0.2', detail: 'fastboot version 36.0.2' },
    sevenZip: { label: '7-Zip', status: 'pass', path: 'C:\\MatePad11\\tools\\7z.exe', version: '23.01', detail: '7z.exe is present' },
  };
  const drivers = {
    supported: true,
    adb: { status: 'pass', present: true, name: 'HUAWEI ADB Interface', detail: 'HUAWEI ADB Interface' },
    qualcomm: { status: 'unknown', present: false, name: null, detail: 'No Qualcomm 9008 port is present. This is normal unless the tablet is in EDL mode.' },
    problems: [],
    detail: '1 related Windows device found.',
    deviceCount: 1,
  };
  const phone = {
    connection: { status: 'pass', detail: `${device.serialMasked} · ${device.model}` },
    usbDebug: { status: 'pass', detail: 'USB debugging is authorized and adb can read the device.' },
    developer: { status: 'pass', detail: 'Developer options are enabled.' },
    adbEnabled: { status: 'pass', detail: 'USB debugging setting is on.' },
    bootloader: { status: 'pending', detail: 'Bootloader is locked (expected before unlock).' },
    root: { status: 'pending', detail: 'No su binary found; the tablet is not rooted yet.' },
  };
  const appRows = {
    magisk: {
      status: apps.magisk?.installed ? 'pass' : 'pending',
      installed: Boolean(apps.magisk?.installed),
      package: apps.magisk?.package || null,
      version: apps.magisk?.version || null,
      detail: apps.magisk?.installed ? `Magisk manager installed · v${apps.magisk.version}` : 'Magisk manager is not installed on the tablet.',
    },
    apatch: {
      status: apps.apatch?.installed ? 'pass' : 'pending',
      installed: Boolean(apps.apatch?.installed),
      package: apps.apatch?.package || null,
      version: apps.apatch?.version || null,
      detail: apps.apatch?.installed ? 'APatch manager installed' : 'APatch manager is not installed on the tablet.',
    },
    kernelsu: {
      status: apps.kernelsu?.installed ? 'pass' : 'pending',
      installed: Boolean(apps.kernelsu?.installed),
      package: apps.kernelsu?.package || null,
      version: apps.kernelsu?.version || null,
      detail: apps.kernelsu?.installed ? 'KernelSU manager installed' : 'KernelSU manager is not installed on the tablet.',
    },
    su: { status: 'pending', installed: false, path: null, detail: 'No su binary found on the tablet.' },
  };
  const summary = summarizeStatuses(collectStatuses({ tools, drivers, phone, apps: appRows }));
  return { checkedAt: new Date().toISOString(), tools, drivers, phone, apps: appRows, summary };
}

function makeDemoLogs(now = new Date()) {
  const base = now.getTime() - 42000;
  const entries = [
    ['info', 'app', 'MatePad 11 Companion 1.4.0 started (demo profile)'],
    ['good', 'workspace', 'Toolkit found: C:\\MatePad11\\MatePadToolbox.exe'],
    ['info', 'inventory', 'Scanned 27 expected paths; APatch requirements present'],
    ['info', 'adb', 'adb devices -l → 1 device'],
    ['info', 'device', 'DBY-W09 · HarmonyOS 3.0.0.168 · Android 11 · battery 76%'],
    ['good', 'device', 'USB debugging authorized; bootloader reported locked'],
    ['info', 'guide', 'Route selected: HarmonyOS 2/3 → ADB → EDL'],
    ['info', 'download', 'platform-tools: adb.exe and AdbWinApi.dll installed'],
    ['info', 'download', '7-Zip extra package extracted; 7z.exe ready'],
    ['info', 'download', 'KernelPatch 0.13.9: kpimg-android and kptools installed'],
    ['info', 'inventory', 'sha256 recorded for 11 imported files'],
    ['info', 'build', 'dotnet publish completed in 6m 42s'],
    ['good', 'build', 'MatePadToolbox.exe written to C:\\MatePad11'],
    ['warn', 'guide', 'Magisk ramdisk is still missing; root method is APatch'],
    ['info', 'safety', 'Data-wipe acknowledgement recorded'],
  ];
  return entries.map(([level, source, message], index) => ({
    id: `demo-${index}`,
    ts: new Date(base + index * 5200).toISOString(),
    level,
    source,
    message,
  }));
}

function makeDemoState(base) {
  return {
    ...base,
    demo: true,
    workspace: 'C:\\MatePad11',
    toolkitMode: 'build',
    toolkitPath: 'C:\\MatePad11\\MatePadToolbox.exe',
    method: 'apatch',
    acknowledgements: {
      disclaimer: '2026-11-08T15:58:00.000Z',
      unlockWipe: '2026-11-09T18:12:00.000Z',
      backup: {
        path: 'C:\\MatePad11\\backup',
        imageCount: 42,
        gptCount: 2,
        totalBytes: 18.4 * 1024 ** 3,
        checkedAt: '2026-11-09T18:08:00.000Z',
        confirmedAt: '2026-11-09T18:11:00.000Z',
        confirmed: true,
      },
    },
    progress: {
      unlock: { steps: { backup: true } },
      root: { steps: {} },
    },
    build: {
      ...base.build,
      commit: 'd4c1b8e',
      builtAt: '2026-11-08T16:24:00.000Z',
      dotnet: '8.0.133',
      sourceFetchedAt: '2026-11-08T16:19:00.000Z',
    },
  };
}

module.exports = {
  makeDemoChecks,
  makeDemoInventory,
  makeDemoEnvironment,
  makeDemoDevice,
  makeDemoLogs,
  makeDemoState,
  demoBytes,
};
