'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ITEMS, summarize } = require('../core/inventory');
const { exists, statOrNull } = require('./files');
const { makeDemoInventory } = require('./demo');

function sourceLabel(item) {
  const labels = {
    google: 'Google platform-tools',
    '7zip': '7-Zip',
    magisk: 'Magisk release',
    apatch: 'APatch release',
    kernelpatch: 'KernelPatch release',
    user: 'Tool pack import',
  };
  return labels[item.source] || item.source;
}

function createInventoryService({ store, logger }) {
  function isDemo() {
    return Boolean(store.get().demo);
  }

  function scanRamdisks(root) {
    const dir = path.join(root, 'ramdisk');
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.img$/i.test(entry.name))
        .map((entry) => {
          const full = path.join(dir, entry.name);
          const stat = fs.statSync(full);
          return { name: entry.name, bytes: stat.size, mtime: stat.mtime.toISOString() };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  async function scan() {
    const state = store.get();
    const method = state.method;
    if (state.demo) return makeDemoInventory(method);
    const root = state.workspace;
    const ramdisks = scanRamdisks(root);
    const items = ITEMS.map((item) => {
      if (item.dynamic === 'ramdisk') {
        const first = ramdisks[0] || null;
        const rel = first ? `ramdisk/${first.name}` : item.rel;
        return {
          ...item,
          rel,
          present: Boolean(first),
          bytes: first?.bytes || 0,
          mtime: first?.mtime || null,
          hash: first ? state.hashes?.[rel]?.sha256 || null : null,
          sourceLabel: 'Patched image you provide',
          ramdisks,
        };
      }
      const absolute = path.join(root, item.rel);
      const stat = statOrNull(absolute);
      return {
        ...item,
        present: Boolean(stat && stat.isFile()),
        bytes: stat?.isFile() ? stat.size : 0,
        mtime: stat?.isFile() ? stat.mtime.toISOString() : null,
        hash: state.hashes?.[item.rel]?.sha256 || null,
        absolute,
        sourceLabel: sourceLabel(item),
      };
    });
    const summary = summarize(items, method, { ramdiskCount: ramdisks.length });
    return {
      ...summary,
      items,
      demo: false,
      scannedAt: new Date().toISOString(),
      workspace: root,
    };
  }

  return { scan, isDemo };
}

module.exports = { createInventoryService };
