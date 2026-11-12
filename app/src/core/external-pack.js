'use strict';

/**
 * The proprietary files the upstream toolkit needs for unlock + APatch root.
 * Every source is pinned by size and SHA-256; the fetcher refuses mismatches.
 *
 * These files are NOT redistributed under this project's MIT license. They are
 * third-party, device-specific binaries. The fetcher stores them only in the
 * user's workspace. The ready-workspace ZIP is a personal convenience bundle.
 */
const DRIVE_ABL = '1LHecE8X_xPKIssUI60_Smu-1YM1JNCru';
const DRIVE_FIREHOSE = '1fYhkIv6xTi-SzuRCfzACwM8rjCR6qbns';

function driveUrls(id) {
  return [
    `https://drive.google.com/uc?export=download&id=${id}`,
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
  ];
}

const EXTERNAL_PACK = [
  {
    id: 'firehose',
    label: 'Signed firehose programmer',
    destinations: ['unlock/Huawei865870_devprg.elf'],
    itemIds: ['devprg'],
    urls: driveUrls(DRIVE_FIREHOSE),
    bytes: 697648,
    sha256: 'a0e08a0a26b1356e04fb3b3097c70237a2e3e0861dbd1a99cafbab4f5adc7c9d',
    source: 'XDA DBY-W09 guide — public Google Drive folder',
    license: 'Huawei-signed proprietary image. Personal device use only.',
    note: 'dbyprog_emmc_firehose, renamed to the upstream filename. Hash matches the independent guide.',
  },
  {
    id: 'abl_unlock',
    label: 'Unlocked ABL image',
    destinations: ['unlock/Huawei865870_abl_unlock.img'],
    itemIds: ['abl_unlock'],
    urls: driveUrls(DRIVE_ABL),
    bytes: 602112,
    sha256: '552e96d2565627563b7f2b072f720efd048abdf11fa050959aec55e7d3f0b79d',
    source: 'XDA DBY-W09 guide — public Google Drive folder',
    license: 'Huawei-signed proprietary image. Personal device use only.',
    note: 'abl_hw865870unlock.elf, renamed to the upstream filename. Hash matches the independent guide.',
  },
  {
    id: 'qsahara',
    label: 'QSaharaServer.exe',
    destinations: ['tools/QSaharaServer.exe'],
    itemIds: ['qsahara'],
    urls: [
      'https://gitee.com/aialbb/mi-flash-tool/raw/master/QSaharaServer.exe',
      'https://gitee.com/aialbb/mi-flash-tool/raw/%E4%B8%8D%E9%94%81BL%E7%89%88%E6%9C%AC/QSaharaServer.exe',
    ],
    bytes: 174592,
    sha256: 'de5cd326ec23889c21de9383ab83013ee9edd286793949890b9ab48d8561f09e',
    source: 'MiFlash tool mirror (Gitee aialbb/mi-flash-tool)',
    license: 'Qualcomm utility, redistributed by the MiFlash tool. Unsigned. Personal use only.',
    note: 'Standard Qualcomm Sahara uploader. Supports -p COM and -s 13:<file>.',
  },
  {
    id: 'fh_loader',
    label: 'fh_loader.exe',
    destinations: ['tools/fh_loader.exe'],
    itemIds: ['fh_loader'],
    urls: [
      'https://raw.githubusercontent.com/snowwolf725/OPlus_EDL_Toolkit/main/src-tauri/tools/fh_loader.exe',
    ],
    bytes: 485888,
    sha256: '84bec0a6b64f38104e8ce8f7940c5aa701b9c59f0010cbd79e38ce0c3f7a2722',
    source: 'OPlus EDL Toolkit (Qualcomm 23.06.20.17.11 build)',
    license: 'Qualcomm utility, redistributed by the OPlus toolkit. Unsigned. Personal use only.',
    note: 'Verified to advertise --skip_configure, --configure, --sendxml, --convertprogram2read, --memoryname, --search_path, --mainoutputdir and --noprompt.',
  },
  {
    id: 'drivers',
    label: 'ADB + Qualcomm driver installer',
    destinations: ['tools/driver/adbdriver.exe', 'tools/driver/qcdriver.exe'],
    itemIds: ['adbdriver', 'qcdriver'],
    urls: [
      'https://raw.githubusercontent.com/suskie778/miflash-unlock-extracted/main/miflash_unlock-en-6.5.224.28/driver_install_64.exe',
    ],
    bytes: 261176,
    sha256: '206e3065f2afd0d45d84aea00e017a31fdfeea62062c6ea1d0fd8062766a3430',
    source: 'Xiaomi MiFlash Unlock 6.5.224.28 — Authenticode-signed by Beijing Xiaomi',
    license: 'Xiaomi/Qualcomm driver installer. Personal use only.',
    note: 'A combined installer substituted for the author’s separate adbdriver.exe and qcdriver.exe. Both toolkit Driver buttons launch this same signed installer.',
  },
];

const EXTERNAL_PACK_BY_ID = new Map(EXTERNAL_PACK.map((entry) => [entry.id, entry]));

function publicPack() {
  return EXTERNAL_PACK.map((entry) => ({
    id: entry.id,
    label: entry.label,
    destinations: entry.destinations,
    itemIds: entry.itemIds,
    bytes: entry.bytes,
    sha256: entry.sha256,
    source: entry.source,
    license: entry.license,
    note: entry.note,
    sourceUrl: entry.urls[0],
  }));
}

module.exports = { EXTERNAL_PACK, EXTERNAL_PACK_BY_ID, publicPack };
