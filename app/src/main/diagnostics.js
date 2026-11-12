'use strict';

const path = require('node:path');
const { writeTextAtomic } = require('./files');
const { timestampForFile } = require('./files');

async function exportDiagnostics({ app, dialog, logger, environment, store, deviceService, inventoryService, systemChecks = null }) {
  const state = store.snapshot();
  const env = await environment.get();
  const inventory = await inventoryService.scan();
  const device = state.demo ? null : deviceService.getLastDevice();
  const defaultName = `matepad-11-diagnostics-${timestampForFile()}.txt`;
  const result = await dialog.showSaveDialog({
    title: 'Export diagnostics',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Text', extensions: ['txt'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const filePath = /\.txt$/i.test(result.filePath) ? result.filePath : `${result.filePath}.txt`;
  const hashLines = Object.entries(state.hashes || {}).map(
    ([rel, info]) => `  ${rel}  ${info.sha256 || '?'}  ${info.bytes ?? '?'}  ${info.source || ''}`,
  );
  const extra = [
    'Notable limits:',
    '  Windows-only build/launch steps cannot run on macOS or Linux.',
    '  The companion does not perform EDL writes; those are done by the upstream toolkit.',
    '  Demo mode output is simulated and is not device evidence.',
    '',
    'System checks:',
    ...(systemChecks
      ? [
          `  tools: adb=${systemChecks.tools?.adb?.status} fastboot=${systemChecks.tools?.fastboot?.status} 7z=${systemChecks.tools?.sevenZip?.status}`,
          `  drivers: adb=${systemChecks.drivers?.adb?.status} qualcomm=${systemChecks.drivers?.qualcomm?.status} problems=${systemChecks.drivers?.problems?.length ?? 0}`,
          `  phone: developer=${systemChecks.phone?.developer?.status} adb=${systemChecks.phone?.adbEnabled?.status} bootloader=${systemChecks.phone?.bootloader?.status} root=${systemChecks.phone?.root?.status}`,
          `  apps: magisk=${systemChecks.apps?.magisk?.status} apatch=${systemChecks.apps?.apatch?.status} kernelsu=${systemChecks.apps?.kernelsu?.status} su=${systemChecks.apps?.su?.status}`,
        ]
      : ['  not run']),
    '',
    'Recorded file hashes:',
    ...(hashLines.length ? hashLines : ['  none recorded']),
    '',
  ];
  writeTextAtomic(filePath, logger.exportText({ env, state, device, inventory, extraLines: extra }));
  logger.good('diagnostics', `Diagnostics exported: ${filePath}`);
  return { ok: true, path: filePath };
}

module.exports = { exportDiagnostics };
