'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const {
  ensureDir,
  exists,
  sha256File,
  extractZipSafe,
  walkFiles,
  copyWithBackup,
  removeDirSafe,
} = require('./files');
const { runCapture } = require('./shell');
const { URLS, DOWNLOADS } = require('../core/sources');
const { EXTERNAL_PACK } = require('../core/external-pack');

const USER_AGENT = 'MatePad-11-Companion/1.0 (+https://github.com/run2000s/MatePad11_Tool_Kit_GUI)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpDownload(url, dest, { onProgress, headers = {}, timeoutMs = 240000 } = {}) {
  ensureDir(path.dirname(dest));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const part = `${dest}.part`;
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...headers },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    const total = Number(response.headers.get('content-length')) || null;
    let received = 0;
    let lastReport = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        const now = Date.now();
        if (onProgress && (now - lastReport > 120 || received === total)) {
          lastReport = now;
          onProgress({ received, total, bytes: received, totalBytes: total });
        }
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(part));
    fs.renameSync(part, dest);
    return { bytes: received, totalBytes: total };
  } catch (error) {
    try {
      fs.unlinkSync(part);
    } catch {
      /* ignore */
    }
    if (error.name === 'AbortError') throw new Error(`Download timed out: ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const rateLimited = response.status === 403 || /rate limit/i.test(body);
      const error = new Error(
        rateLimited
          ? 'GitHub API rate limit reached. Open the release page and import the file manually.'
          : `GitHub API HTTP ${response.status} for ${url}`,
      );
      error.rateLimited = rateLimited;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function pickAsset(assets, matcher) {
  return (assets || []).find((asset) => matcher.test(String(asset.name || '')));
}

function createDownloadService({ store, logger }) {
  let onProgress = null;

  function setProgressSink(sink) {
    onProgress = typeof sink === 'function' ? sink : null;
  }

  function emit(payload) {
    if (onProgress) {
      try {
        onProgress(payload);
      } catch {
        /* ignore */
      }
    }
  }

  function workspace() {
    const state = store.get();
    if (state.demo) throw new Error('Demo mode: downloads are disabled.');
    if (!state.workspace) throw new Error('Choose a workspace first.');
    return state.workspace;
  }

  async function recordHash(rel, file, source) {
    const sha256 = await sha256File(file);
    const stat = fs.statSync(file);
    store.update((draft) => {
      draft.hashes[rel] = {
        sha256,
        bytes: stat.size,
        at: new Date().toISOString(),
        source,
      };
      return draft;
    });
    return sha256;
  }

  async function ensure7zr() {
    const setup = path.join(workspace(), '.setup');
    ensureDir(setup);
    const dest = path.join(setup, '7zr.exe');
    if (exists(dest)) return dest;
    emit({ id: 'sevenzip', phase: 'download', label: '7-Zip standalone', message: 'Downloading 7zr.exe' });
    await httpDownload('https://www.7-zip.org/a/7zr.exe', dest, {
      onProgress: (progress) => emit({ id: 'sevenzip', phase: 'download', label: '7-Zip standalone', ...progress }),
    });
    return dest;
  }

  async function extract7z(archive, dest, label) {
    ensureDir(dest);
    let command = null;
    let args = [];
    if (process.platform === 'win32') {
      command = await ensure7zr();
      args = ['x', archive, `-o${dest}`, '-y'];
    } else {
      for (const candidate of ['7z', '7zz', '7za']) {
        const probe = await runCapture('which', [candidate], { timeoutMs: 3000 });
        if (probe.code === 0) {
          command = candidate;
          args = ['x', archive, `-o${dest}`, '-y'];
          break;
        }
      }
    }
    if (!command) {
      throw new Error(
        `Extracting ${label} needs 7-Zip. On Windows the companion downloads 7zr.exe automatically; on this host install 7-Zip or extract it on the Windows PC.`,
      );
    }
    emit({ id: 'sevenzip', phase: 'extract', label, message: 'Extracting archive' });
    const result = await runCapture(command, args, { timeoutMs: 120000 });
    if (result.code !== 0) {
      throw new Error(`7-Zip extraction failed for ${label}: ${(result.combined || '').slice(-400)}`);
    }
  }

  async function installPlatformTools() {
    const root = workspace();
    const setup = path.join(root, '.setup');
    ensureDir(setup);
    ensureDir(path.join(root, 'tools'));
    const zipPath = path.join(setup, 'platform-tools.zip');
    const extractDir = path.join(setup, 'platform-tools-extract');
    emit({ id: 'platform', phase: 'download', label: 'Android platform-tools', message: 'Downloading Google platform-tools' });
    await httpDownload(URLS.platformTools, zipPath, {
      onProgress: (progress) =>
        emit({ id: 'platform', phase: 'download', label: 'Android platform-tools', ...progress }),
    });
    removeDirSafe(extractDir);
    emit({ id: 'platform', phase: 'extract', label: 'Android platform-tools', message: 'Extracting adb and fastboot' });
    extractZipSafe(zipPath, extractDir);
    const files = await walkFiles(extractDir);
    const adbFile = files.find((file) => /[\\/]adb\.exe$/i.test(file));
    if (!adbFile) throw new Error('platform-tools ZIP did not contain adb.exe');
    const sourceDir = path.dirname(adbFile);
    const copied = [];
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const source = path.join(sourceDir, entry.name);
      const destination = path.join(root, 'tools', entry.name);
      if (exists(destination)) {
        copyWithBackup(source, destination);
      } else {
        fs.copyFileSync(source, destination);
      }
      copied.push(entry.name);
    }
    const adbRel = 'tools/adb.exe';
    const fastbootRel = 'tools/fastboot.exe';
    const hashes = {};
    if (exists(path.join(root, adbRel))) hashes[adbRel] = await recordHash(adbRel, path.join(root, adbRel), 'Google platform-tools');
    if (exists(path.join(root, fastbootRel))) {
      hashes[fastbootRel] = await recordHash(fastbootRel, path.join(root, fastbootRel), 'Google platform-tools');
    }
    removeDirSafe(extractDir);
    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* ignore */
    }
    logger.good('download', `platform-tools installed: ${copied.length} files (adb, fastboot, DLLs).`);
    emit({ id: 'platform', phase: 'done', label: 'Android platform-tools', message: 'adb and fastboot are ready' });
    return { ok: true, id: 'platform', copied, hashes };
  }

  async function installSevenZip() {
    const root = workspace();
    const setup = path.join(root, '.setup');
    ensureDir(setup);
    ensureDir(path.join(root, 'tools'));
    const page = await fetchText(URLS.sevenZipPage);
    const extraMatch = page.match(/href="a\/(7z\d+-extra\.7z)"/i);
    const extraName = extraMatch ? extraMatch[1] : '7z2301-extra.7z';
    const extraUrl = new URL(`/a/${extraName}`, URLS.sevenZipBase).toString();
    const archive = path.join(setup, '7zip-extra.7z');
    const extractDir = path.join(setup, '7zip-extra');
    emit({ id: 'sevenzip', phase: 'download', label: '7-Zip', message: `Downloading ${extraName}` });
    await httpDownload(extraUrl, archive, {
      onProgress: (progress) => emit({ id: 'sevenzip', phase: 'download', label: '7-Zip', ...progress }),
    });
    removeDirSafe(extractDir);
    await extract7z(archive, extractDir, '7-Zip');
    const files = await walkFiles(extractDir);
    const candidates = files.filter((file) => /[\\/]7za\.exe$/i.test(file));
    if (candidates.length === 0) throw new Error('7-Zip extra archive did not contain 7za.exe');
    const preferred =
      candidates.find((file) => /[\\/]x64[\\/]7za\.exe$/i.test(file)) ||
      candidates.find((file) => !/[\\/](x86|arm64|arm|ia64)[\\/]/i.test(file)) ||
      candidates[0];
    const destination = path.join(root, 'tools', '7z.exe');
    if (exists(destination)) copyWithBackup(preferred, destination);
    else fs.copyFileSync(preferred, destination);
    const hash = await recordHash('tools/7z.exe', destination, '7-Zip official extra package');
    removeDirSafe(extractDir);
    try {
      fs.unlinkSync(archive);
    } catch {
      /* ignore */
    }
    logger.good('download', `7-Zip installed from ${extraName}.`);
    emit({ id: 'sevenzip', phase: 'done', label: '7-Zip', message: '7z.exe is ready' });
    return { ok: true, id: 'sevenzip', hashes: { 'tools/7z.exe': hash } };
  }

  async function installMagisk() {
    const root = workspace();
    ensureDir(path.join(root, 'tools', 'apks'));
    emit({ id: 'magisk', phase: 'resolve', label: 'Magisk', message: 'Reading latest official release' });
    const release = await fetchJson(URLS.magiskApi);
    const asset =
      pickAsset(release.assets, /^Magisk-v.*\.apk$/i) ||
      pickAsset(release.assets, /^app-debug\.apk$/i) ||
      pickAsset(release.assets, /\.apk$/i);
    if (!asset) throw new Error('No Magisk APK asset found in the latest release.');
    const destination = path.join(root, 'tools', 'apks', 'Magisk.apk');
    emit({ id: 'magisk', phase: 'download', label: 'Magisk', message: `Downloading ${asset.name}`, total: asset.size });
    await httpDownload(asset.browser_download_url, destination, {
      onProgress: (progress) => emit({ id: 'magisk', phase: 'download', label: 'Magisk', ...progress }),
    });
    const hash = await recordHash('tools/apks/Magisk.apk', destination, `${URLS.magiskPage} ${release.tag_name}`);
    logger.good('download', `Magisk ${release.tag_name} installed (${asset.name}).`);
    emit({ id: 'magisk', phase: 'done', label: 'Magisk', message: `Magisk ${release.tag_name} ready` });
    return { ok: true, id: 'magisk', version: release.tag_name, hashes: { 'tools/apks/Magisk.apk': hash } };
  }

  async function installApatch() {
    const root = workspace();
    ensureDir(path.join(root, 'tools', 'apks'));
    emit({ id: 'apatch', phase: 'resolve', label: 'APatch', message: 'Reading latest official release' });
    const release = await fetchJson(URLS.apatchApi);
    const asset = pickAsset(release.assets, /\.apk$/i);
    if (!asset) throw new Error('No APatch APK asset found in the latest release.');
    const destination = path.join(root, 'tools', 'apks', 'Apatch.apk');
    emit({ id: 'apatch', phase: 'download', label: 'APatch', message: `Downloading ${asset.name}`, total: asset.size });
    await httpDownload(asset.browser_download_url, destination, {
      onProgress: (progress) => emit({ id: 'apatch', phase: 'download', label: 'APatch', ...progress }),
    });
    const hash = await recordHash('tools/apks/Apatch.apk', destination, `${URLS.apatchPage} ${release.tag_name}`);
    logger.good('download', `APatch ${release.tag_name} installed (${asset.name}).`);
    emit({ id: 'apatch', phase: 'done', label: 'APatch', message: `APatch ${release.tag_name} ready` });
    return { ok: true, id: 'apatch', version: release.tag_name, hashes: { 'tools/apks/Apatch.apk': hash } };
  }

  async function installKernelPatch() {
    const root = workspace();
    const setup = path.join(root, '.setup');
    ensureDir(setup);
    ensureDir(path.join(root, 'tools', 'apatch_tools'));
    emit({ id: 'kernelpatch', phase: 'resolve', label: 'KernelPatch', message: 'Reading latest official release' });
    const release = await fetchJson(URLS.kernelPatchApi);
    const kpimgAsset = pickAsset(release.assets, /^kpimg-android$/i);
    const toolsAsset = pickAsset(release.assets, /^kptools-msys2-win\.7z$/i) || pickAsset(release.assets, /kptools.*win.*\.7z$/i);
    if (!kpimgAsset) throw new Error('No kpimg-android asset found in KernelPatch releases.');
    if (!toolsAsset) throw new Error('No kptools Windows archive found in KernelPatch releases.');
    const kpimgPath = path.join(root, 'tools', 'apatch_tools', 'kpimg-android');
    emit({ id: 'kernelpatch', phase: 'download', label: 'KernelPatch', message: 'Downloading kpimg-android' });
    await httpDownload(kpimgAsset.browser_download_url, kpimgPath, {
      onProgress: (progress) => emit({ id: 'kernelpatch', phase: 'download', label: 'KernelPatch', ...progress }),
    });
    const archivePath = path.join(setup, 'kptools-win.7z');
    emit({ id: 'kernelpatch', phase: 'download', label: 'KernelPatch', message: 'Downloading kptools for Windows' });
    await httpDownload(toolsAsset.browser_download_url, archivePath, {
      onProgress: (progress) => emit({ id: 'kernelpatch', phase: 'download', label: 'KernelPatch', ...progress }),
    });
    const extractDir = path.join(setup, 'kptools-extract');
    removeDirSafe(extractDir);
    await extract7z(archivePath, extractDir, 'kptools');
    const files = await walkFiles(extractDir);
    const candidates = files.filter((file) => /[\\/]kptools.*\.exe$/i.test(file));
    if (candidates.length === 0) throw new Error('kptools archive did not contain a Windows executable.');
    const preferred =
      candidates.find((file) => /x86[_-]?64/i.test(path.basename(file))) ||
      candidates.find((file) => !/aarch64|arm64/i.test(file)) ||
      candidates[0];
    const destination = path.join(root, 'tools', 'apatch_tools', 'kptools.exe');
    if (exists(destination)) copyWithBackup(preferred, destination);
    else fs.copyFileSync(preferred, destination);
    const hashes = {
      'tools/apatch_tools/kpimg-android': await recordHash(
        'tools/apatch_tools/kpimg-android',
        kpimgPath,
        `${URLS.kernelPatchPage} ${release.tag_name}`,
      ),
      'tools/apatch_tools/kptools.exe': await recordHash(
        'tools/apatch_tools/kptools.exe',
        destination,
        `${URLS.kernelPatchPage} ${release.tag_name}`,
      ),
    };
    removeDirSafe(extractDir);
    try {
      fs.unlinkSync(archivePath);
    } catch {
      /* ignore */
    }
    logger.good('download', `KernelPatch ${release.tag_name} tools installed.`);
    emit({ id: 'kernelpatch', phase: 'done', label: 'KernelPatch', message: 'kptools and kpimg are ready' });
    return { ok: true, id: 'kernelpatch', version: release.tag_name, hashes };
  }

  async function installExternalPack() {
    const root = workspace();
    const setup = path.join(root, '.setup', 'external');
    ensureDir(setup);
    const entryResults = [];
    const errors = [];
    for (const entry of EXTERNAL_PACK) {
      const destinations = entry.destinations.map((rel) => ({ rel, absolute: path.join(root, rel) }));
      const alreadyPresent = destinations.every((destination) => {
        if (!exists(destination.absolute)) return false;
        const stat = fs.statSync(destination.absolute);
        if (stat.size !== entry.bytes) return false;
        const recorded = store.get().hashes?.[destination.rel];
        return recorded?.sha256 === entry.sha256;
      });
      if (alreadyPresent) {
        entryResults.push({ id: entry.id, status: 'present' });
        emit({ id: 'external', phase: 'skip', label: entry.label, message: 'Already present and hash-matched' });
        continue;
      }
      const temp = path.join(setup, `${entry.id}.download`);
      let installed = false;
      let lastError = null;
      for (const url of entry.urls) {
        if (installed) break;
        for (let attempt = 1; attempt <= 3 && !installed; attempt += 1) {
          try {
            emit({
              id: 'external',
              phase: 'download',
              label: entry.label,
              message: `Downloading ${entry.label} (attempt ${attempt}/3)`,
            });
            await httpDownload(url, temp, {
              timeoutMs: 180000,
              onProgress: (progress) =>
                emit({ id: 'external', phase: 'download', label: entry.label, ...progress }),
            });
            const stat = fs.statSync(temp);
            if (stat.size !== entry.bytes) {
              throw new Error(`size mismatch: expected ${entry.bytes}, got ${stat.size}`);
            }
            const hash = await sha256File(temp);
            if (hash !== entry.sha256) {
              throw new Error(`SHA-256 mismatch: expected ${entry.sha256.slice(0, 16)}…, got ${hash.slice(0, 16)}…`);
            }
            installed = true;
          } catch (error) {
            lastError = error;
            try {
              fs.unlinkSync(temp);
            } catch {
              /* ignore */
            }
            logger.warn('download', `${entry.label} attempt ${attempt} failed: ${error.message}`);
            if (attempt < 3) await sleep(1500 * attempt);
          }
        }
      }
      if (!installed) {
        const message = `${entry.label}: ${lastError?.message || 'all sources failed'}`;
        errors.push({ id: entry.id, label: entry.label, error: message });
        logger.error('download', message);
        emit({ id: 'external', phase: 'error', label: entry.label, message });
        continue;
      }
      const hash = entry.sha256;
      for (const destination of destinations) {
        ensureDir(path.dirname(destination.absolute));
        const existed = exists(destination.absolute);
        copyWithBackup(temp, destination.absolute);
        store.update((draft) => {
          draft.hashes[destination.rel] = {
            sha256: hash,
            bytes: entry.bytes,
            at: new Date().toISOString(),
            source: `external:${entry.id} — ${entry.source}`,
          };
          return draft;
        });
        logger.good('download', `${entry.label} → ${destination.rel}${existed ? ' (replaced, backup kept)' : ''}`);
      }
      try {
        fs.unlinkSync(temp);
      } catch {
        /* ignore */
      }
      installed = true;
      entryResults.push({ id: entry.id, status: 'installed', destinations: entry.destinations });
    }
    emit({
      id: 'external',
      phase: errors.length ? 'error' : 'done',
      label: 'External pack',
      message: errors.length ? `${errors.length} file(s) failed` : 'External unlock/Qualcomm pack ready',
    });
    return {
      ok: errors.length === 0,
      installed: entryResults.filter((entry) => entry.status === 'installed').map((entry) => entry.id),
      present: entryResults.filter((entry) => entry.status === 'present').map((entry) => entry.id),
      errors,
      total: EXTERNAL_PACK.length,
    };
  }

  const runners = {
    platform: installPlatformTools,
    sevenzip: installSevenZip,
    magisk: installMagisk,
    apatch: installApatch,
    kernelpatch: installKernelPatch,
  };

  async function install(id) {
    const key = String(id || '');
    if (!DOWNLOADS[key]) throw new Error(`Unknown download: ${id}`);
    if (store.get().demo) throw new Error('Demo mode: downloads are disabled.');
    const runner = runners[key];
    emit({ id: key, phase: 'start', label: DOWNLOADS[key].label, message: 'Starting' });
    try {
      const result = await runner();
      return result;
    } catch (error) {
      logger.error('download', `${DOWNLOADS[key].label}: ${error.message}`);
      emit({ id: key, phase: 'error', label: DOWNLOADS[key].label, message: error.message });
      throw error;
    }
  }

  return { install, installExternalPack, setProgressSink, ensure7zr, httpDownload };
}

module.exports = { createDownloadService, httpDownload, fetchJson, pickAsset };
