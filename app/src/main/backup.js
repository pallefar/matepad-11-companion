'use strict';

const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXT = new Set(['.img', '.bin', '.raw']);
const GPT_NAME = /(gpt|partition|rawprogram|super|vbmeta)/i;
const MIN_IMAGES = 3;
const MIN_BYTES = 512 * 1024 ** 2;
const MAX_FILES = 4000;
const MAX_DEPTH = 5;

/**
 * Inspect a user-selected directory for evidence of a full 9008 backup.
 * This is an evidence check, not proof of completeness. It never writes.
 */
function scanBackupFolder(folder) {
  const root = path.resolve(String(folder || ''));
  if (!folder || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('Choose an existing backup folder.');
  }
  const images = [];
  const gpt = [];
  const samples = [];
  let totalBytes = 0;
  let visited = 0;
  let truncated = false;

  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH || visited >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (visited >= MAX_FILES) {
        truncated = true;
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      visited += 1;
      const ext = path.extname(entry.name).toLowerCase();
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      totalBytes += size;
      if (IMAGE_EXT.has(ext)) images.push({ name: entry.name, bytes: size });
      else if (GPT_NAME.test(entry.name) && ['.xml', '.txt', '.bin', '.json'].includes(ext)) {
        gpt.push({ name: entry.name, bytes: size });
      }
      if (samples.length < 8) samples.push({ name: entry.name, bytes: size });
    }
  };
  walk(root, 0);

  const imageCount = images.length;
  const gptCount = gpt.length;
  const ok = imageCount >= MIN_IMAGES && gptCount >= 1 && totalBytes >= MIN_BYTES;
  const missing = [];
  if (imageCount < MIN_IMAGES) missing.push(`at least ${MIN_IMAGES} images`);
  if (gptCount < 1) missing.push('a GPT/rawprogram/partition XML');
  if (totalBytes < MIN_BYTES) missing.push('at least 512 MB');
  return {
    path: root,
    imageCount,
    gptCount,
    totalBytes,
    samples,
    ok,
    missing,
    truncated,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { scanBackupFolder, MIN_IMAGES, MIN_BYTES };
