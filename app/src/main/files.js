'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function exists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

function statOrNull(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function findExistingParent(target) {
  let current = path.resolve(target);
  for (let i = 0; i < 40; i += 1) {
    if (exists(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

function freeSpace(target) {
  try {
    const stats = fs.statfsSync(findExistingParent(target));
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    return {
      freeBytes: Number.isFinite(freeBytes) ? freeBytes : null,
      totalBytes: Number.isFinite(totalBytes) ? totalBytes : null,
    };
  } catch {
    return { freeBytes: null, totalBytes: null };
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    fs.renameSync(tmp, filePath);
  }
}

function writeTextAtomic(filePath, text) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    fs.renameSync(tmp, filePath);
  }
}

function timestampForFile(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function copyWithBackup(source, destination) {
  ensureDir(path.dirname(destination));
  let backup = null;
  if (exists(destination)) {
    backup = `${destination}.bak-${timestampForFile()}`;
    fs.copyFileSync(destination, backup);
  }
  const tmp = `${destination}.tmp-${process.pid}-${Date.now()}`;
  fs.copyFileSync(source, tmp);
  try {
    fs.renameSync(tmp, destination);
  } catch {
    try {
      fs.unlinkSync(destination);
    } catch {
      /* ignore */
    }
    fs.renameSync(tmp, destination);
  }
  return { backup };
}

function looksLikeSymlink(entryPath) {
  try {
    return fs.lstatSync(entryPath).isSymbolicLink();
  } catch {
    return false;
  }
}

async function walkFiles(root, { maxFiles = 20000, skipDirs = [] } = {}) {
  const files = [];
  const stack = [root];
  const skip = new Set(skipDirs.map((name) => name.toLowerCase()));
  while (stack.length > 0 && files.length < maxFiles) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (skip.has(entry.name.toLowerCase())) continue;
        stack.push(full);
        continue;
      }
      if (entry.isFile()) files.push(full);
      if (files.length >= maxFiles) break;
    }
  }
  return files;
}

function assertSafeEntryName(entryName) {
  const normalized = String(entryName || '').replace(/\\/g, '/');
  if (!normalized) return null;
  if (normalized.includes('\0')) throw new Error('ZIP entry contains a NUL byte');
  if (normalized.startsWith('/')) throw new Error(`ZIP entry is absolute: ${normalized}`);
  if (/^[a-zA-Z]:/.test(normalized)) throw new Error(`ZIP entry has a drive letter: ${normalized}`);
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..')) throw new Error(`ZIP entry traverses upward: ${normalized}`);
  return normalized.replace(/\/+$/, '');
}

/**
 * Extract only regular files, validating every name first.
 * Caps entry count and total uncompressed bytes to keep a malicious pack bounded.
 */
function extractZipSafe(zipPath, destDir, { maxBytes = 4 * 1024 ** 3, maxEntries = 30000 } = {}) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (entries.length > maxEntries) throw new Error(`ZIP has too many entries (${entries.length})`);
  ensureDir(destDir);
  let total = 0;
  const written = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const safeName = assertSafeEntryName(entry.entryName);
    if (!safeName) continue;
    const size = Number(entry.header?.size || 0);
    total += size;
    if (total > maxBytes) throw new Error('ZIP expands beyond the 4 GB safety limit');
    const target = path.resolve(destDir, safeName);
    const prefix = path.resolve(destDir) + path.sep;
    if (!target.startsWith(prefix)) throw new Error(`ZIP entry escaped destination: ${safeName}`);
    ensureDir(path.dirname(target));
    const data = entry.getData();
    fs.writeFileSync(target, data);
    written.push({ name: safeName, bytes: data.length });
  }
  return { files: written, totalBytes: total };
}

function listDir(dir, { max = 500 } = {}) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .slice(0, max)
      .map((entry) => ({
        name: entry.name,
        dir: entry.isDirectory(),
        file: entry.isFile(),
        link: entry.isSymbolicLink(),
      }));
  } catch {
    return [];
  }
}

function removeDirSafe(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    /* ignore */
  }
}

module.exports = {
  ensureDir,
  exists,
  statOrNull,
  findExistingParent,
  freeSpace,
  sha256File,
  sha256Text,
  readJson,
  writeJsonAtomic,
  writeTextAtomic,
  timestampForFile,
  copyWithBackup,
  walkFiles,
  extractZipSafe,
  assertSafeEntryName,
  listDir,
  removeDirSafe,
  looksLikeSymlink,
};
