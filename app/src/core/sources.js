'use strict';

const UPSTREAM = {
  name: 'MatePad11_Tool_Kit_GUI',
  owner: 'run2000s',
  repo: 'https://github.com/run2000s/MatePad11_Tool_Kit_GUI',
  sourceZip: 'https://codeload.github.com/run2000s/MatePad11_Tool_Kit_GUI/zip/refs/heads/main',
  api: 'https://api.github.com/repos/run2000s/MatePad11_Tool_Kit_GUI',
  license: 'GPL-3.0-or-later',
};

const URLS = {
  upstream: UPSTREAM,
  upstreamLatestCommit: `${UPSTREAM.api}/commits/main`,
  platformTools: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  platformToolsPage: 'https://developer.android.com/tools/releases/platform-tools',
  sevenZipPage: 'https://www.7-zip.org/download.html',
  sevenZipBase: 'https://www.7-zip.org/',
  dotnetInstallScript: 'https://dot.net/v1/dotnet-install.ps1',
  dotnetDownload: 'https://dotnet.microsoft.com/download/dotnet/8.0',
  magiskApi: 'https://api.github.com/repos/topjohnwu/Magisk/releases/latest',
  magiskPage: 'https://github.com/topjohnwu/Magisk/releases',
  apatchApi: 'https://api.github.com/repos/bmax121/APatch/releases/latest',
  apatchPage: 'https://github.com/bmax121/APatch/releases',
  kernelPatchApi: 'https://api.github.com/repos/bmax121/KernelPatch/releases/latest',
  kernelPatchPage: 'https://github.com/bmax121/KernelPatch/releases',
  deviceGuide: 'https://github.com/serkanvela/matepad11-hos42-root-gms',
  hiSuite: 'https://consumer.huawei.com/en/support/hisuite/',
  xdaGuide: 'https://xdaforums.com/t/comprehensive-matepad-11-2021-dby-w09-rebrand-update-and-root-guide.4789106/',
  magiskInstall: 'https://topjohnwu.github.io/Magisk/install.html',
  harmonyProps: 'https://juejin.cn/post/7350520171612176435',
};

const EXTERNAL_ALLOWLIST = [
  'github.com',
  'gitee.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
  'api.github.com',
  'developer.android.com',
  'dl.google.com',
  'www.7-zip.org',
  '7-zip.org',
  'dot.net',
  'dotnet.microsoft.com',
  'topjohnwu.github.io',
  'xdaforums.com',
  'juejin.cn',
  'consumer.huawei.com',
];

const DOWNLOADS = {
  platform: {
    id: 'platform',
    label: 'Android platform-tools',
    url: URLS.platformTools,
    page: URLS.platformToolsPage,
    provides: ['adb', 'fastboot'],
    sizeHint: '~8 MB',
  },
  sevenzip: {
    id: 'sevenzip',
    label: '7-Zip',
    url: URLS.sevenZipPage,
    page: URLS.sevenZipPage,
    provides: ['7zip'],
    sizeHint: '~2 MB',
  },
  magisk: {
    id: 'magisk',
    label: 'Magisk',
    url: URLS.magiskApi,
    page: URLS.magiskPage,
    provides: ['magisk_apk'],
    sizeHint: '~11 MB',
  },
  apatch: {
    id: 'apatch',
    label: 'APatch',
    url: URLS.apatchApi,
    page: URLS.apatchPage,
    provides: ['apatch_apk'],
    sizeHint: '~7 MB',
  },
  kernelpatch: {
    id: 'kernelpatch',
    label: 'KernelPatch tools',
    url: URLS.kernelPatchApi,
    page: URLS.kernelPatchPage,
    provides: ['kptools', 'kpimg'],
    sizeHint: '~1.5 MB',
  },
};

const SAFETY_COPY = {
  untouched: [
    'No device writes happen in this app. The upstream toolkit performs every flash.',
    'The only device commands this app runs are read-only checks, plus reboot and APK install that you press yourself.',
  ],
  never: [
    'Never flash the stock ABL after unlocking — it relocks the bootloader, and on HarmonyOS 4 you may not get back into EDL.',
    'Never relock the bootloader while a patched boot or ramdisk is installed.',
    'Never accept an OTA or HiSuite update after unlocking; it can overwrite bootloader components.',
    'Never start a 9008 write without a full EDL backup and a data cable plugged directly into the PC.',
  ],
};

module.exports = { UPSTREAM, URLS, DOWNLOADS, EXTERNAL_ALLOWLIST, SAFETY_COPY };
