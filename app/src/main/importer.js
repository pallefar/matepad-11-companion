'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  ensureDir,
  exists,
  sha256File,
  extractZipSafe,
  walkFiles,
  copyWithBackup,
  removeDirSafe,
  timestampForFile,
} = require('./files');
const { matchImportedFile, ITEM_BY_ID, safeJoin } = require('../core/inventory');

const MAX_HASH_BYTES = 400 * 1024 * 1024;

function createImportService({ store, logger }) {
  function workspace() {
    const state = store.get();
    if (state.demo) throw new Error('Demo mode: importing files is disabled.');
    if (!state.workspace) throw new Error('Choose a workspace first.');
    return state.workspace;
  }

  async function filesFromInput(inputPath) {
    const resolved = path.resolve(String(inputPath || ''));
    let stat;
    try {
      stat = fs.lstatSync(resolved);
    } catch {
      throw new Error(`Path not found: ${resolved}`);
    }
    if (stat.isSymbolicLink()) throw new Error('Symbolic links are not accepted for tool imports.');
    if (stat.isDirectory()) {
      const files = await walkFiles(resolved, { skipDirs: ['node_modules', '.git', '.setup'] });
      return { files, cleanup: null, sourceLabel: path.basename(resolved) };
    }
    if (stat.isFile() && /\.zip$/i.test(resolved)) {
      const setup = path.join(workspace(), '.setup');
      ensureDir(setup);
      const extractDir = path.join(setup, `import-${timestampForFile()}`);
      removeDirSafe(extractDir);
      logger.info('import', `Extracting ${path.basename(resolved)} for scanning.`);
      extractZipSafe(resolved, extractDir);
      const files = await walkFiles(extractDir);
      return { files, cleanup: extractDir, sourceLabel: path.basename(resolved) };
    }
    if (stat.isFile()) {
      return { files: [resolved], cleanup: null, sourceLabel: path.basename(resolved) };
    }
    throw new Error('Select a ZIP file, a folder, or a single file.');
  }

  function destinationFor(item, canonicalName) {
    const root = workspace();
    const rel = canonicalName ? path.join(path.dirname(item.rel), canonicalName) : item.rel;
    return { rel: rel.replace(/\\/g, '/'), absolute: safeJoin(root, rel) };
  }

  async function importPath(inputPath, { role = 'toolpack' } = {}) {
    if (store.get().demo) throw new Error('Demo mode: importing files is disabled.');
    const root = workspace();
    const { files, cleanup, sourceLabel } = await filesFromInput(inputPath);
    const result = {
      ok: true,
      source: sourceLabel,
      scanned: files.length,
      copied: [],
      replaced: [],
      ramdisk: [],
      ignored: [],
      ambiguous: [],
      errors: [],
      missingAfter: [],
    };

    try {
      if (role === 'ramdisk') {
        const images = files.filter((file) => /\.img$/i.test(file));
        if (images.length === 0) throw new Error('No .img file found for the ramdisk import.');
        for (const image of images) {
          const destination = path.join(root, 'ramdisk', path.basename(image));
          ensureDir(path.dirname(destination));
          const existed = exists(destination);
          copyWithBackup(image, destination);
          result.ramdisk.push({ file: path.basename(image), destination, replaced: existed });
          if (existed) result.replaced.push(path.basename(image));
          else result.copied.push(path.basename(image));
          logger.good('import', `ramdisk image copied: ${path.basename(image)}`);
        }
        return result;
      }

      const byItem = new Map();
      for (const file of files) {
        const match = matchImportedFile(file);
        if (!match) {
          result.ignored.push(path.basename(file));
          continue;
        }
        const entry = { file, item: match.item, canonicalName: match.canonicalName };
        const list = byItem.get(match.item.id) || [];
        list.push(entry);
        byItem.set(match.item.id, list);
      }

      for (const [id, entries] of byItem.entries()) {
        const item = ITEM_BY_ID.get(id);
        if (!item) continue;
        const sorted = entries.sort((a, b) => a.file.length - b.file.length);
        const chosen = sorted[0];
        if (sorted.length > 1) {
          result.ambiguous.push({
            id,
            label: item.label,
            chosen: path.basename(chosen.file),
            others: sorted.slice(1).map((entry) => path.basename(entry.file)),
          });
        }
        const target = destinationFor(item, chosen.canonicalName);
        if (path.resolve(chosen.file) === path.resolve(target.absolute)) {
          result.ignored.push(path.basename(chosen.file));
          continue;
        }
        const existed = exists(target.absolute);
        copyWithBackup(chosen.file, target.absolute);
        const bytes = fs.statSync(target.absolute).size;
        if (bytes === 0) {
          result.errors.push(`${item.label}: copied file is empty (${target.rel})`);
          logger.warn('import', `Empty file copied for ${item.label}; it will not satisfy the check.`);
        }
        let hash = null;
        if (bytes <= MAX_HASH_BYTES) {
          try {
            hash = await sha256File(target.absolute);
            store.update((draft) => {
              draft.hashes[target.rel] = {
                sha256: hash,
                bytes,
                at: new Date().toISOString(),
                source: `import:${sourceLabel}`,
              };
              return draft;
            });
          } catch {
            hash = null;
          }
        }
        result.copied.push({
          id,
          label: item.label,
          rel: target.rel,
          bytes,
          hash,
          from: path.basename(chosen.file),
          replaced: existed,
        });
        if (existed) result.replaced.push(target.rel);
        logger.good(
          'import',
          `${item.label} → ${target.rel}${existed ? ' (replaced, backup kept)' : ''}${hash ? ` · sha256 ${hash.slice(0, 12)}…` : ''}`,
        );
      }

      if (byItem.size === 0) {
        logger.warn('import', `No known toolkit files were found in ${sourceLabel}.`);
      }
      return result;
    } finally {
      if (cleanup) removeDirSafe(cleanup);
    }
  }

  return { importPath };
}

module.exports = { createImportService };
