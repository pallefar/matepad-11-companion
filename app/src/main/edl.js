'use strict';

const path = require('node:path');
const { runCapture } = require('./shell');
const { exists } = require('./files');

const REGEX = /QUSB_BULK|QHSUSB|QDLoader|9008|VID_05C6.*PID_9008/i;

function extractComPort(name) {
  const match = String(name || '').match(/\(COM(\d+)\)/i) || String(name || '').match(/\bCOM(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function parsePowerShellPorts(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  let parsed;
  for (const candidate of [text, text.slice(text.indexOf('[')), text.slice(text.indexOf('{'))]) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      /* try the next shape */
    }
  }
  if (!parsed) return [];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row) => row && (REGEX.test(row.Name || '') || REGEX.test(row.DeviceID || '')))
    .map((row) => ({
      name: row.Name || 'Qualcomm 9008 device',
      deviceId: row.DeviceID || null,
      comPort: extractComPort(row.Name),
    }));
}

function createEdlService({ store, logger }) {
  function isDemo() {
    return Boolean(store.get().demo);
  }

  async function detect() {
    if (isDemo()) {
      return {
        supported: true,
        platform: 'win32',
        ports: [],
        demo: true,
        checkedAt: new Date().toISOString(),
        note: 'Demo mode: no Windows device query was run.',
      };
    }
    const checkedAt = new Date().toISOString();
    if (process.platform === 'win32') {
      const powershell = path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      );
      if (!exists(powershell)) {
        return { supported: true, platform: 'win32', ports: [], checkedAt, error: 'Windows PowerShell not found.' };
      }
      const script = [
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8",
        "$ErrorActionPreference='SilentlyContinue'",
        "Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'QUSB_BULK|QHSUSB|QDLoader|9008' -or $_.DeviceID -match 'VID_05C6&PID_9008' } | Select-Object Name,DeviceID | ConvertTo-Json -Compress",
      ].join('; ');
      const result = await runCapture(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        timeoutMs: 20000,
      });
      if (result.code !== 0) {
        logger.warn('edl', `9008 detection failed: ${(result.stderr || result.error || '').slice(0, 300)}`);
        return { supported: true, platform: 'win32', ports: [], checkedAt, error: 'PowerShell query failed.' };
      }
      const ports = parsePowerShellPorts(result.combined);
      if (ports.length > 0) {
        logger.good('edl', `9008 device detected: ${ports.map((port) => port.name).join('; ')}`);
      } else {
        logger.info('edl', 'No Qualcomm 9008 device detected.');
      }
      return { supported: true, platform: 'win32', ports, checkedAt, error: null };
    }

    if (process.platform === 'darwin') {
      const result = await runCapture('system_profiler', ['SPUSBDataType'], { timeoutMs: 20000 });
      const text = result.combined || '';
      const lines = text
        .split(/\r?\n/)
        .filter((line) => /QUSB|QHSUSB|QDLoader|9008|Qualcomm/i.test(line))
        .slice(0, 8);
      return {
        supported: false,
        platform: 'darwin',
        ports: lines.map((line) => ({ name: line.trim(), deviceId: null, comPort: null })),
        checkedAt,
        note: 'EDL writes require Windows. This is a read-only USB scan.',
      };
    }

    const result = await runCapture('lsusb', [], { timeoutMs: 10000 });
    const ports = String(result.combined || '')
      .split(/\r?\n/)
      .filter((line) => /05c6|9008|QUSB|Qualcomm/i.test(line))
      .map((line) => ({ name: line.trim(), deviceId: null, comPort: null }));
    return {
      supported: false,
      platform: process.platform,
      ports,
      checkedAt,
      note: 'EDL writes require Windows. This is a read-only USB scan.',
    };
  }

  return { detect };
}

module.exports = { createEdlService, parsePowerShellPorts, extractComPort };
