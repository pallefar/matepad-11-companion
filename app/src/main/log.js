'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ensureDir, timestampForFile } = require('./files');

const LEVELS = new Set(['debug', 'info', 'good', 'warn', 'error']);

function cleanMessage(message) {
  return String(message ?? '')
    .replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '')
    .replace(/\0/g, '')
    .replace(/\r/g, '')
    .slice(0, 4000);
}

function maskText(text, values = []) {
  let output = String(text ?? '');
  for (const value of values) {
    if (!value || String(value).length < 4) continue;
    output = output.split(String(value)).join('[serial hidden]');
  }
  return output;
}

class Logger extends EventEmitter {
  constructor({ version = '0.0.0' } = {}) {
    super();
    this.version = version;
    this.ring = [];
    this.maxRing = 1200;
    this.filePath = null;
    this.quietConsole = Boolean(process.env.MATEPAD_QUIET);
    this.sink = null;
    this.pendingWrites = 0;
  }

  setSink(sink) {
    this.sink = typeof sink === 'function' ? sink : null;
  }

  attachFile(dir) {
    try {
      ensureDir(dir);
      this.filePath = path.join(dir, 'companion.log');
      if (fs.existsSync(this.filePath) && fs.statSync(this.filePath).size > 5 * 1024 * 1024) {
        try {
          fs.renameSync(this.filePath, path.join(dir, `companion-${timestampForFile()}.log`));
        } catch {
          /* ignore */
        }
      }
    } catch {
      this.filePath = null;
    }
  }

  log(level, source, message, meta) {
    const safeLevel = LEVELS.has(level) ? level : 'info';
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      ts: new Date().toISOString(),
      level: safeLevel,
      source: String(source || 'app').slice(0, 40),
      message: cleanMessage(message),
      ...(meta && typeof meta === 'object' ? { meta } : {}),
    };
    this.ring.push(entry);
    if (this.ring.length > this.maxRing) this.ring.splice(0, this.ring.length - this.maxRing);
    if (!this.quietConsole) {
      const line = `[${entry.ts}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}`;
      if (entry.level === 'error') console.error(line);
      else console.log(line);
    }
    if (this.sink) {
      try {
        this.sink(entry);
      } catch {
        /* ignore */
      }
    }
    if (this.filePath) {
      this.pendingWrites += 1;
      fs.appendFile(
        this.filePath,
        `${entry.ts}\t${entry.level}\t${entry.source}\t${entry.message}\n`,
        () => {
          this.pendingWrites = Math.max(0, this.pendingWrites - 1);
        },
      );
    }
    this.emit('line', entry);
    return entry;
  }

  info(source, message, meta) {
    return this.log('info', source, message, meta);
  }

  good(source, message, meta) {
    return this.log('good', source, message, meta);
  }

  warn(source, message, meta) {
    return this.log('warn', source, message, meta);
  }

  error(source, message, meta) {
    return this.log('error', source, message, meta);
  }

  debug(source, message, meta) {
    return this.log('debug', source, message, meta);
  }

  snapshot(limit = 400) {
    return this.ring.slice(-limit).map((entry) => ({ ...entry }));
  }

  clear() {
    this.ring = [];
  }

  seed(entries) {
    if (!Array.isArray(entries)) return;
    this.ring = entries.map((entry) => ({ ...entry }));
    this.emit('seeded', this.ring.length);
  }

  exportText({ env, state, device, inventory, extraLines = [] } = {}) {
    const lines = [];
    lines.push('MatePad 11 Companion — diagnostics');
    lines.push(`version: ${this.version}`);
    lines.push(`exported: ${new Date().toISOString()}`);
    lines.push(`platform: ${env?.platform || process.platform} ${env?.release || ''} ${env?.arch || ''}`);
    lines.push(`demo: ${state?.demo ? 'yes' : 'no'}`);
    lines.push(`workspace: ${state?.workspace || ''}`);
    lines.push(`toolkit: ${state?.toolkitPath || 'not built'}`);
    lines.push(`method: ${state?.method || 'unknown'}`);
    lines.push('');
    if (device) {
      lines.push('Device snapshot:');
      lines.push(`  model: ${device.model || 'unknown'}`);
      lines.push(`  harmony: ${device.os?.version || 'unknown'} (major ${device.os?.major ?? '?'})`);
      lines.push(`  android: ${device.os?.android || '?'} / sdk ${device.os?.sdk || '?'}`);
      lines.push(`  battery: ${device.battery?.level ?? '?'}%`);
      lines.push(`  bootloader: ${device.bootloader?.unlocked === true ? 'unlocked' : device.bootloader?.unlocked === false ? 'locked' : 'unknown'}`);
      lines.push(`  root verified: ${device.rootVerified ? 'yes' : 'no'}`);
      lines.push(`  detected: ${device.detectedAt || '?'}`);
      lines.push('');
    }
    if (inventory) {
      lines.push('Inventory:');
      for (const item of inventory.items || []) {
        lines.push(`  ${item.present ? 'OK  ' : 'MISS'} ${item.rel}${item.present ? ` (${item.bytes} bytes)` : ''}`);
      }
      lines.push(`  required: ${inventory.requiredPresent}/${inventory.requiredCount} (${inventory.method})`);
      lines.push('');
    }
    for (const line of extraLines) lines.push(line);
    lines.push('Log:');
    for (const entry of this.ring) {
      lines.push(`${entry.ts}\t${entry.level}\t${entry.source}\t${entry.message}`);
    }
    lines.push('');
    return lines.join('\n');
  }
}

module.exports = { Logger, maskText, cleanMessage };
