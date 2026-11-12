'use strict';

const path = require('node:path');

const GROUPS = [
  {
    id: 'core',
    label: 'Core toolkit',
    description: 'The three executables the upstream app checks on its home page.',
  },
  {
    id: 'edl',
    label: 'Qualcomm 9008 / EDL',
    description: 'Firehose upload and raw XML read/write. Required for unlock and APatch boot extraction.',
  },
  {
    id: 'unlock',
    label: 'Bootloader unlock',
    description: 'The signed firehose programmer and the unlocked ABL image for the Snapdragon 865 platform.',
  },
  {
    id: 'apatch',
    label: 'APatch root',
    description: 'KernelPatch tools the toolkit calls while patching the extracted boot image.',
  },
  {
    id: 'magisk',
    label: 'Magisk root',
    description: 'Magisk manager plus a patched ramdisk image for your exact firmware.',
  },
  {
    id: 'runtime',
    label: 'Runtime images',
    description: 'Images you generate for this tablet after the toolkit is set up.',
  },
  {
    id: 'drivers',
    label: 'Windows drivers',
    description: 'Optional installers. If Device Manager already shows the tablet and 9008 port, you can skip them.',
  },
  {
    id: 'rom',
    label: 'ROM and recovery',
    description: 'Only needed if you later flash a third-party or official ROM. Not needed to unlock or root.',
  },
  {
    id: 'downgrade',
    label: 'Downgrade',
    description: 'Only for the HarmonyOS 4 downgrade path. Not needed on HarmonyOS 2/3.',
  },
];

/**
 * Every path here is relative to the toolkit workspace, matching AppConfig.cs in the
 * upstream project. `source` says how the companion can obtain it:
 *   google | 7zip | magisk | apatch | kernelpatch | user
 */
const ITEMS = [
  {
    id: 'adb',
    rel: 'tools/adb.exe',
    label: 'adb.exe',
    group: 'core',
    priority: 'required',
    neededFor: ['unlock', 'apatch', 'magisk', 'rom'],
    source: 'google',
    note: 'Android platform-tools. Detection, getprop, APK install, reboot commands.',
  },
  {
    id: 'fastboot',
    rel: 'tools/fastboot.exe',
    label: 'fastboot.exe',
    group: 'core',
    priority: 'required',
    neededFor: ['unlock', 'apatch', 'magisk', 'rom'],
    source: 'google',
    note: 'Checks bootloader state and flashes the patched boot or ramdisk image.',
  },
  {
    id: '7zip',
    rel: 'tools/7z.exe',
    label: '7z.exe',
    group: 'core',
    priority: 'required',
    neededFor: ['unlock', 'apatch', 'magisk', 'rom'],
    source: '7zip',
    note: 'The toolkit uses it to unpack update packages. Installed from the official 7-Zip extra package.',
  },
  {
    id: 'qsahara',
    rel: 'tools/QSaharaServer.exe',
    label: 'QSaharaServer.exe',
    group: 'edl',
    priority: 'required',
    neededFor: ['unlock', 'apatch'],
    source: 'user',
    note: 'Qualcomm Sahara uploader. Proprietary; comes with the original toolkit tool pack.',
  },
  {
    id: 'fh_loader',
    rel: 'tools/fh_loader.exe',
    label: 'fh_loader.exe',
    group: 'edl',
    priority: 'required',
    neededFor: ['unlock', 'apatch'],
    source: 'user',
    note: 'Qualcomm Firehose loader. Proprietary; comes with the original toolkit tool pack.',
  },
  {
    id: 'ptool',
    rel: 'tools/ptool.exe',
    label: 'ptool.exe (optional)',
    group: 'edl',
    priority: 'optional',
    neededFor: [],
    source: 'user',
    note: 'Optional: generates flashable GPT/rawprogram files after a 9008 backup.',
  },
  {
    id: 'devprg',
    rel: 'unlock/Huawei865870_devprg.elf',
    label: 'Huawei865870_devprg.elf',
    group: 'unlock',
    priority: 'required',
    neededFor: ['unlock', 'apatch'],
    source: 'user',
    note: 'Signed firehose programmer for the Huawei 865870 platform. Do not substitute another device loader.',
  },
  {
    id: 'abl_unlock',
    rel: 'unlock/Huawei865870_abl_unlock.img',
    label: 'Huawei865870_abl_unlock.img',
    group: 'unlock',
    priority: 'required',
    neededFor: ['unlock'],
    source: 'user',
    note: 'Unlocked ABL image written to LUN 4, sector 49670. This is what unlocks the bootloader.',
  },
  {
    id: 'kptools',
    rel: 'tools/apatch_tools/kptools.exe',
    label: 'kptools.exe',
    group: 'apatch',
    priority: 'required',
    neededFor: ['apatch'],
    source: 'kernelpatch',
    note: 'KernelPatch unpack/patch/repack tool. The official Windows archive contains kptools-x86_64-win.exe.',
  },
  {
    id: 'kpimg',
    rel: 'tools/apatch_tools/kpimg-android',
    label: 'kpimg-android',
    group: 'apatch',
    priority: 'required',
    neededFor: ['apatch'],
    source: 'kernelpatch',
    note: 'KernelPatch payload used while patching the extracted boot image.',
  },
  {
    id: 'apatch_apk',
    rel: 'tools/apks/Apatch.apk',
    label: 'Apatch.apk',
    group: 'apatch',
    priority: 'required',
    neededFor: ['apatch'],
    source: 'apatch',
    note: 'APatch manager, installed after the patched boot boots.',
  },
  {
    id: 'magisk_apk',
    rel: 'tools/apks/Magisk.apk',
    label: 'Magisk.apk',
    group: 'magisk',
    priority: 'required',
    neededFor: ['magisk'],
    source: 'magisk',
    note: 'Magisk manager. Also used to patch the stock ramdisk image on the tablet.',
  },
  {
    id: 'ramdisk',
    rel: 'ramdisk',
    label: 'patched ramdisk (*.img)',
    group: 'runtime',
    priority: 'required',
    neededFor: ['magisk'],
    source: 'user',
    dynamic: 'ramdisk',
    note: 'A Magisk-patched ramdisk image for your exact firmware, placed in the ramdisk folder. The toolkit flashes it as partition “ramdisk”.',
  },
  {
    id: 'adbdriver',
    rel: 'tools/driver/adbdriver.exe',
    label: 'adbdriver.exe',
    group: 'drivers',
    priority: 'recommended',
    neededFor: ['drivers'],
    source: 'user',
    note: 'Installs the Huawei/Android ADB driver. Windows may already have a working driver.',
  },
  {
    id: 'qcdriver',
    rel: 'tools/driver/qcdriver.exe',
    label: 'qcdriver.exe',
    group: 'drivers',
    priority: 'recommended',
    neededFor: ['drivers'],
    source: 'user',
    note: 'Installs the Qualcomm 9008 driver. Required if Device Manager shows QUSB_BULK with a warning.',
  },
  {
    id: 'vbmeta',
    rel: 'vbmeta/vbmeta.zip',
    label: 'vbmeta.zip',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: 'Empty vbmeta package used to disable AVB before flashing a third-party ROM.',
  },
  {
    id: 'rawprogram0',
    rel: 'tools/rawprogram/rawprogram0.xml',
    label: 'rawprogram0.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: '9008 flashing description for LUN 0.',
  },
  {
    id: 'rawprogram1',
    rel: 'tools/rawprogram/rawprogram1.xml',
    label: 'rawprogram1.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: '9008 flashing description for LUN 1.',
  },
  {
    id: 'rawprogram2',
    rel: 'tools/rawprogram/rawprogram2.xml',
    label: 'rawprogram2.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: '9008 flashing description for LUN 2.',
  },
  {
    id: 'rawprogram3',
    rel: 'tools/rawprogram/rawprogram3.xml',
    label: 'rawprogram3.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: '9008 flashing description for LUN 3.',
  },
  {
    id: 'rawprogram4',
    rel: 'tools/rawprogram/rawprogram4.xml',
    label: 'rawprogram4.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: '9008 flashing description for LUN 4.',
  },
  {
    id: 'rawprogram5',
    rel: 'tools/rawprogram/rawprogram5.xml',
    label: 'rawprogram5.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: '9008 flashing description for LUN 5.',
  },
  {
    id: 'rawprogram_vbmeta',
    rel: 'tools/rawprogram/rawprogram_vbmeta.xml',
    label: 'rawprogram_vbmeta.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: 'AVB/vbmeta write description.',
  },
  {
    id: 'rawprogram_super',
    rel: 'tools/rawprogram/rawprogram_super.xml',
    label: 'rawprogram_super.xml',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: 'Super partition write description.',
  },
  {
    id: 'misc',
    rel: 'tools/rawprogram/misc.img',
    label: 'misc.img',
    group: 'rom',
    priority: 'optional',
    neededFor: ['rom'],
    source: 'user',
    note: 'Misc image written together with vbmeta for the third-party ROM flow.',
  },
  {
    id: 'hisuite',
    rel: 'tools/HiSuiteProxy/HiSuite1.exe',
    label: 'HiSuite1.exe',
    group: 'downgrade',
    priority: 'optional',
    neededFor: ['downgrade'],
    source: 'user',
    note: 'Old HiSuite used by the downgrade page. Only needed on the HarmonyOS 4 downgrade path.',
  },
  {
    id: 'hisuite_proxy',
    rel: 'tools/HiSuiteProxy/HiSuite Proxy V3.exe',
    label: 'HiSuite Proxy V3.exe',
    group: 'downgrade',
    priority: 'optional',
    neededFor: ['downgrade'],
    source: 'user',
    note: 'Proxy that pins HiSuite to an older firmware version.',
  },
];

const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

function safeJoin(root, rel) {
  if (!root) throw new Error('safeJoin: root is required');
  const normalizedRel = String(rel).replace(/\\/g, '/');
  if (normalizedRel.startsWith('/') || /^[a-zA-Z]:/.test(normalizedRel)) {
    throw new Error(`safeJoin: absolute path rejected: ${rel}`);
  }
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, normalizedRel);
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (target !== rootResolved && !target.startsWith(prefix)) {
    throw new Error(`safeJoin: path escapes root: ${rel}`);
  }
  return target;
}

function normalizeName(name) {
  return String(name || '')
    .split(/[\\/]/)
    .pop()
    .trim()
    .toLowerCase();
}

/**
 * Map one file name from an imported pack to a canonical inventory item.
 * Returns { item, canonicalName } or null. Ambiguity is resolved by the caller
 * when two source files map to the same item.
 */
function matchImportedFile(fileName) {
  const base = normalizeName(fileName);
  if (!base) return null;

  const exact = {
    'adb.exe': 'adb',
    'fastboot.exe': 'fastboot',
    '7z.exe': '7zip',
    '7za.exe': '7zip',
    'qsaharaserver.exe': 'qsahara',
    'fh_loader.exe': 'fh_loader',
    'ptool.exe': 'ptool',
    'adbdriver.exe': 'adbdriver',
    'qcdriver.exe': 'qcdriver',
    'kpimg-android': 'kpimg',
    'huawei865870_devprg.elf': 'devprg',
    'huawei865870_abl_unlock.img': 'abl_unlock',
    'vbmeta.zip': 'vbmeta',
    'misc.img': 'misc',
    'rawprogram0.xml': 'rawprogram0',
    'rawprogram1.xml': 'rawprogram1',
    'rawprogram2.xml': 'rawprogram2',
    'rawprogram3.xml': 'rawprogram3',
    'rawprogram4.xml': 'rawprogram4',
    'rawprogram5.xml': 'rawprogram5',
    'rawprogram_vbmeta.xml': 'rawprogram_vbmeta',
    'rawprogram_super.xml': 'rawprogram_super',
    'hisuite1.exe': 'hisuite',
    'hisuite proxy v3.exe': 'hisuite_proxy',
  };
  if (exact[base]) return { item: ITEM_BY_ID.get(exact[base]), canonicalName: null };

  if (/^kptools.*\.exe$/.test(base) || base === 'kptools') {
    return { item: ITEM_BY_ID.get('kptools'), canonicalName: 'kptools.exe' };
  }
  if (base === 'app-debug.apk' || (base.includes('magisk') && base.endsWith('.apk'))) {
    return { item: ITEM_BY_ID.get('magisk_apk'), canonicalName: 'Magisk.apk' };
  }
  if ((base.includes('apatch') || base === 'apatch.apk') && base.endsWith('.apk')) {
    return { item: ITEM_BY_ID.get('apatch_apk'), canonicalName: 'Apatch.apk' };
  }
  if (/^huawei865870.*abl.*unlock.*\.img$/.test(base)) {
    return { item: ITEM_BY_ID.get('abl_unlock'), canonicalName: 'Huawei865870_abl_unlock.img' };
  }
  if (/^huawei865870.*devprg.*\.elf$/.test(base)) {
    return { item: ITEM_BY_ID.get('devprg'), canonicalName: 'Huawei865870_devprg.elf' };
  }
  return null;
}

function requiredItems(method = 'apatch') {
  return ITEMS.filter((item) => {
    if (item.dynamic) return method === 'magisk';
    if (item.priority !== 'required') return false;
    if (item.neededFor.includes('unlock')) return true;
    return item.neededFor.includes(method);
  });
}

function recommendedItems(method = 'apatch') {
  return ITEMS.filter((item) => {
    if (item.priority !== 'recommended') return false;
    if (item.neededFor.includes(method) || item.neededFor.includes('unlock')) return true;
    return item.neededFor.includes(method);
  });
}

function isItemRequiredFor(item, method) {
  if (item.priority !== 'required') return false;
  return item.neededFor.includes('unlock') || item.neededFor.includes(method) || Boolean(item.dynamic && method === item.dynamic);
}

function summarize(items, method, extras = {}) {
  const required = requiredItems(method);
  const present = items.filter((item) => item.present);
  const requiredMissing = required.filter((req) => {
    const found = items.find((item) => item.id === req.id);
    return !found || !found.present;
  });
  const recommendedMissing = recommendedItems(method).filter((req) => {
    const found = items.find((item) => item.id === req.id);
    return !found || !found.present;
  });
  return {
    total: items.length,
    presentCount: present.length,
    requiredCount: required.length,
    requiredPresent: required.length - requiredMissing.length,
    requiredMissing,
    recommendedMissing,
    method,
    ramdiskCount: extras.ramdiskCount || 0,
  };
}

function groupItems(items) {
  return GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);
}

module.exports = {
  GROUPS,
  ITEMS,
  ITEM_BY_ID,
  safeJoin,
  matchImportedFile,
  requiredItems,
  recommendedItems,
  isItemRequiredFor,
  summarize,
  groupItems,
};
