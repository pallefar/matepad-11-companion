'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { BrowserWindow, shell, nativeTheme } = require('electron');
const { computeReadiness } = require('../core/readiness');
const { evaluateGates, summarizeGates, routeUnlock } = require('../core/parse');
const { groupItems, ITEM_BY_ID } = require('../core/inventory');
const { publicPack } = require('../core/external-pack');
const { DOWNLOADS, URLS, EXTERNAL_ALLOWLIST, SAFETY_COPY, UPSTREAM } = require('../core/sources');
const { ensureDir, exists, sha256File } = require('./files');
const { isSubPath, maskSerial } = require('../core/commands');
const { makeDemoDevice, makeDemoLogs } = require('./demo');
const { exportDiagnostics } = require('./diagnostics');

function createIpc({
  ipcMain,
  app,
  dialog,
  store,
  logger,
  environment,
  inventoryService,
  deviceService,
  edlService,
  downloadService,
  importService,
  builderService,
  version,
}) {
  let lastEdl = null;
  let lastBuildProgress = null;
  let activeDownloads = new Map();
  let bootstrapped = false;
  let snapshotTimer = null;

  function sendToAll(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  logger.setSink((entry) => sendToAll('app:event', { type: 'log', payload: entry }));

  downloadService.setProgressSink((progress) => {
    if (progress.id) activeDownloads.set(progress.id, { ...progress, at: Date.now() });
    sendToAll('app:event', { type: 'download-progress', payload: progress });
  });

  builderService.setProgressSink((progress) => {
    lastBuildProgress = { ...progress, at: Date.now() };
    sendToAll('app:event', { type: 'build-progress', payload: lastBuildProgress });
  });

  function sanitizeDevice(device) {
    if (!device) return null;
    const { serial, ...rest } = device;
    return rest;
  }

  function defaultEdl(env) {
    return {
      supported: Boolean(env.isWindows),
      platform: env.platform,
      ports: [],
      checkedAt: null,
      note: env.isWindows ? null : 'EDL writes require Windows. This is a read-only USB scan.',
    };
  }

  async function getSnapshot() {
    const state = store.snapshot();
    const env = await environment.get();
    const inventory = await inventoryService.scan();
    const device = state.demo ? sanitizeDevice(makeDemoDevice()) : sanitizeDevice(deviceService.getLastDevice());
    const toolkitPresent = Boolean(env.toolkit?.present);
    const readiness = computeReadiness({ env, state, inventory, device, toolkitPresent });
    const gateInput = {
      env,
      device,
      pcFreeBytes: env.freeBytes,
      inventory,
      backupAck: Boolean(state.acknowledgements.unlockWipe),
      toolkitReady: toolkitPresent,
      method: state.method,
    };
    const gates = summarizeGates(evaluateGates(gateInput));
    const rootGateList = [
      ...gates.gates,
      {
        id: 'unlocked',
        label: 'Bootloader unlocked',
        status: readiness.unlocked ? 'pass' : 'fail',
        detail: readiness.unlocked
          ? 'Unlocked — confirmed by fastboot or marked complete.'
          : 'Unlock the bootloader first; root will not boot on a locked device.',
        blocks: !readiness.unlocked,
      },
    ];
    const rootGates = summarizeGates(rootGateList);
    const route = routeUnlock({
      harmonyMajor: device?.os?.major ?? null,
      unlocked: device?.bootloader?.unlocked ?? null,
    });
    const edl = lastEdl || defaultEdl(env);
    return {
      app: {
        name: 'MatePad 11 Companion',
        version,
        platform: process.platform,
        isWindows: env.isWindows,
        demo: Boolean(state.demo),
        host: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : process.platform,
      },
      state: {
        language: state.language,
        workspace: state.workspace,
        toolkitMode: state.toolkitMode,
        toolkitPath: state.toolkitPath,
        method: state.method,
        theme: state.theme || 'dark',
        demo: Boolean(state.demo),
        acknowledgements: state.acknowledgements,
        progress: state.progress,
        hashes: state.hashes,
        build: state.build,
      },
      env,
      inventory,
      inventoryGroups: groupItems(inventory.items),
      device,
      edl,
      fastboot: deviceService.getLastFastboot(),
      readiness: { ...readiness, canUnlock: readiness.canUnlock && gates.canProceed, canRoot: readiness.canRoot && rootGates.canProceed },
      gates,
      rootGates,
      route,
      logs: logger.snapshot(350),
      downloads: DOWNLOADS,
      externalPack: publicPack(),
      urls: URLS,
      upstream: UPSTREAM,
      safety: SAFETY_COPY,
      buildRunning: builderService.isRunning(),
      buildProgress: lastBuildProgress,
      activeDownloads: [...activeDownloads.values()],
      demo: Boolean(state.demo),
    };
  }

  async function broadcastSnapshot() {
    const snapshot = await getSnapshot();
    sendToAll('app:event', { type: 'snapshot', payload: snapshot });
    return snapshot;
  }

  function scheduleSnapshot(delay = 100) {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      broadcastSnapshot().catch((error) => logger.error('ipc', `snapshot failed: ${error.message}`));
    }, delay);
    if (typeof snapshotTimer.unref === 'function') snapshotTimer.unref();
  }

  async function bootstrap() {
    if (bootstrapped) return getSnapshot();
    bootstrapped = true;
    const state = store.get();
    if (state.demo) {
      logger.seed(makeDemoLogs());
      lastEdl = await edlService.detect();
    } else {
      try {
        if (process.platform === 'win32') {
          lastEdl = await edlService.detect();
        }
        await deviceService.refresh();
      } catch (error) {
        logger.warn('app', `Startup device check failed: ${error.message}`);
      }
    }
    logger.info('app', `Workspace: ${state.workspace}`);
    logger.info('app', `Mode: ${state.demo ? 'demo preview' : 'live'} · root method: ${state.method}`);
    const snapshot = await broadcastSnapshot();
    return snapshot;
  }

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload = {}) => {
      try {
        const result = await fn(payload, event);
        scheduleSnapshot();
        return { ok: true, ...(result && typeof result === 'object' ? result : {}) };
      } catch (error) {
        logger.error('ipc', `${channel}: ${error.message}`);
        return { ok: false, error: error.message };
      }
    });
  };

  ipcMain.handle('app:snapshot', async () => getSnapshot());
  ipcMain.handle('app:bootstrap', async () => bootstrap());

  handle('app:set-language', ({ language }) => {
    const next = store.setLanguage(language);
    logger.info('settings', `Language: ${next}`);
    return { language: next };
  });

  handle('app:set-demo', async ({ enabled }) => {
    store.setDemo(Boolean(enabled));
    environment.clear();
    if (store.isDemo()) {
      logger.seed(makeDemoLogs());
      lastEdl = await edlService.detect();
      logger.info('demo', 'Demo preview enabled — no device commands or file writes will run.');
    } else {
      logger.info('demo', 'Demo preview disabled.');
    }
    return { demo: store.isDemo() };
  });

  handle('app:set-theme', ({ theme }) => {
    const next = store.setTheme(theme);
    nativeTheme.themeSource = next;
    const background = next === 'light' ? '#F4F1EA' : '#0B0C0F';
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.setBackgroundColor(background);
        } catch {
          /* Window background is cosmetic */
        }
      }
    }
    logger.info('settings', `Theme: ${next}`);
    return { theme: next };
  });

  handle('app:set-method', ({ method }) => {
    if (!['apatch', 'magisk'].includes(method)) throw new Error('Unknown root method.');
    store.set('method', method);
    logger.info('guide', `Root method: ${method === 'apatch' ? 'APatch' : 'Magisk'}`);
    return { method };
  });

  handle('app:set-workspace', async (_payload, event) => {
    if (store.isDemo()) throw new Error('Demo mode: turn off the preview to change the workspace.');
    const current = store.get().workspace;
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choose a toolkit workspace',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Use this folder',
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const workspace = result.filePaths[0];
    ensureDir(workspace);
    store.update((draft) => {
      draft.workspace = workspace;
      draft.toolkitPath = null;
      draft.toolkitMode = 'build';
      draft.hashes = {};
      return draft;
    });
    environment.clear();
    logger.info('workspace', `Workspace set to ${workspace}`);
    return { workspace };
  });

  handle('app:use-existing', async (_payload, event) => {
    if (store.isDemo()) throw new Error('Demo mode: turn off the preview to select a folder.');
    const current = store.get().workspace;
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Select the folder that contains MatePadToolbox.exe',
      defaultPath: current,
      properties: ['openDirectory'],
      buttonLabel: 'Use this toolkit',
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const validation = await builderService.validateExisting(result.filePaths[0]);
    if (!validation.ok) throw new Error(validation.error);
    return validation;
  });

  handle('app:open-workspace', async () => {
    const state = store.get();
    if (state.demo) throw new Error('Demo mode: no real workspace is open.');
    ensureDir(state.workspace);
    const error = await shell.openPath(state.workspace);
    if (error) throw new Error(error);
    return { path: state.workspace };
  });

  handle('app:open-folder', async ({ kind }) => {
    const state = store.get();
    if (state.demo) throw new Error('Demo mode: no real folder is open.');
    const map = {
      workspace: state.workspace,
      tools: path.join(state.workspace, 'tools'),
      apks: path.join(state.workspace, 'tools', 'apks'),
      ramdisk: path.join(state.workspace, 'ramdisk'),
      unlock: path.join(state.workspace, 'unlock'),
      vbmeta: path.join(state.workspace, 'vbmeta'),
      rawprogram: path.join(state.workspace, 'tools', 'rawprogram'),
      logs: path.join(app.getPath('userData'), 'logs'),
    };
    const target = map[kind];
    if (!target) throw new Error('Unknown folder.');
    ensureDir(target);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { path: target };
  });

  handle('app:open-path', async ({ target }) => {
    const state = store.get();
    if (!target) throw new Error('No path supplied.');
    const allowed = [state.workspace, app.getPath('userData')].filter(Boolean);
    if (!allowed.some((root) => isSubPath(root, target))) throw new Error('Path is outside the workspace.');
    if (!exists(target)) throw new Error('That path does not exist yet.');
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { path: target };
  });

  handle('app:reveal-path', async ({ target }) => {
    const state = store.get();
    if (!target) throw new Error('No path supplied.');
    const allowed = [state.workspace, app.getPath('userData')].filter(Boolean);
    if (!allowed.some((root) => isSubPath(root, target))) throw new Error('Path is outside the workspace.');
    if (!exists(target)) throw new Error('That path does not exist yet.');
    shell.showItemInFolder(target);
    return { path: target };
  });

  handle('app:open-user-data', async () => {
    const target = app.getPath('userData');
    ensureDir(target);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { path: target };
  });

  handle('app:open-external', async ({ url }) => {
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch {
      throw new Error('Invalid link.');
    }
    if (parsed.protocol !== 'https:') throw new Error('Only https links are allowed.');
    const host = parsed.hostname.toLowerCase();
    const allowed = EXTERNAL_ALLOWLIST.some((entry) => host === entry || host.endsWith(`.${entry}`));
    if (!allowed) throw new Error(`Link host is not allowlisted: ${host}`);
    await shell.openExternal(parsed.toString());
    return { url: parsed.toString() };
  });

  handle('app:refresh', async () => {
    environment.clear();
    const state = store.get();
    if (!state.demo) {
      await deviceService.refresh();
      if (process.platform === 'win32') lastEdl = await edlService.detect();
    }
    const snapshot = await broadcastSnapshot();
    return { snapshot };
  });

  handle('app:refresh-device', async () => {
    const device = await deviceService.refresh();
    return { device: sanitizeDevice(device) };
  });

  handle('app:detect-edl', async () => {
    lastEdl = await edlService.detect();
    return { edl: lastEdl };
  });

  handle('app:install-download', async ({ id }) => {
    if (activeDownloads.has(id)) throw new Error('That download is already running.');
    try {
      const result = await downloadService.install(id);
      environment.clear();
      return result;
    } finally {
      activeDownloads.delete(id);
    }
  });

  handle('app:install-external', async () => {
    if (store.isDemo()) throw new Error('Demo mode: turn off the preview to fetch the external pack.');
    const result = await downloadService.installExternalPack();
    environment.clear();
    return result;
  });

  handle('app:import-dialog', async ({ mode = 'zip' }, event) => {
    if (store.isDemo()) throw new Error('Demo mode: importing files is disabled.');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (mode === 'folder') {
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose the tool pack folder',
        properties: ['openDirectory'],
        buttonLabel: 'Import this folder',
      });
      if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
      return importService.importPath(result.filePaths[0], { role: 'toolpack' });
    }
    if (mode === 'ramdisk') {
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose a Magisk-patched ramdisk image',
        properties: ['openFile'],
        filters: [{ name: 'Disk images', extensions: ['img'] }],
        buttonLabel: 'Import image',
      });
      if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
      return importService.importPath(result.filePaths[0], { role: 'ramdisk' });
    }
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose the tool pack ZIP',
      properties: ['openFile'],
      filters: [
        { name: 'ZIP archives', extensions: ['zip'] },
        { name: 'All files', extensions: ['*'] },
      ],
      buttonLabel: 'Import ZIP',
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    return importService.importPath(result.filePaths[0], { role: 'toolpack' });
  });

  handle('app:import-paths', async ({ paths, role = 'toolpack' }) => {
    if (!Array.isArray(paths) || paths.length === 0) throw new Error('No files were dropped.');
    const combined = { ok: true, runs: [] };
    for (const inputPath of paths.slice(0, 20)) {
      combined.runs.push(await importService.importPath(inputPath, { role }));
    }
    return combined;
  });

  handle('app:build', async ({ forceSource = false } = {}) => {
    const result = await builderService.build({ forceSource: Boolean(forceSource) });
    environment.clear();
    return result;
  });

  handle('app:cancel-build', () => builderService.cancel());

  handle('app:launch-toolkit', async () => builderService.launch());

  handle('app:device-action', async ({ action, kind }) => {
    if (store.isDemo()) throw new Error('Demo mode: no device command was run.');
    switch (action) {
      case 'refresh':
        return { device: sanitizeDevice(await deviceService.refresh()) };
      case 'check-fastboot':
        return { fastboot: await deviceService.checkFastboot() };
      case 'verify-root':
        return { root: await deviceService.verifyRoot() };
      case 'reboot-bootloader':
        return { result: await deviceService.reboot('bootloader') };
      case 'reboot-system':
        return { result: await deviceService.reboot('system') };
      case 'reconnect':
        return { result: await deviceService.reconnect() };
      case 'install-apk': {
        const apk = kind === 'magisk'
          ? path.join(store.get().workspace, 'tools', 'apks', 'Magisk.apk')
          : path.join(store.get().workspace, 'tools', 'apks', 'Apatch.apk');
        if (!exists(apk)) throw new Error(`APK not found: ${apk}`);
        return { result: await deviceService.installApk(apk) };
      }
      default:
        throw new Error(`Unknown device action: ${action}`);
    }
  });

  handle('app:guide-step', ({ flow, stepId, done, complete }) => {
    if (!['unlock', 'root'].includes(flow)) throw new Error('Unknown guide flow.');
    if (!stepId || typeof stepId !== 'string') throw new Error('Missing step id.');
    store.update((draft) => {
      draft.progress[flow].steps[stepId] = Boolean(done);
      if (complete) {
        draft.progress[flow].completed = Boolean(done);
        draft.progress[flow].completedAt = done ? new Date().toISOString() : null;
      }
      return draft;
    });
    return { flow, stepId, done: Boolean(done) };
  });

  handle('app:ack-disclaimer', ({ accepted }) => {
    store.update((draft) => {
      draft.acknowledgements.disclaimer = accepted ? new Date().toISOString() : null;
      return draft;
    });
    if (accepted) logger.info('safety', 'Disclaimer acknowledged.');
    return { accepted: Boolean(accepted) };
  });

  handle('app:ack-wipe', ({ phrase, backup }) => {
    if (String(phrase || '').trim().toUpperCase() !== 'WIPE') {
      throw new Error('Type WIPE exactly to acknowledge the data wipe.');
    }
    if (backup !== true) throw new Error('Confirm that you have a backup first.');
    store.update((draft) => {
      draft.acknowledgements.unlockWipe = new Date().toISOString();
      draft.acknowledgements.unlockWipeBackup = true;
      return draft;
    });
    logger.good('safety', 'Unlock data-wipe acknowledgement recorded.');
    return { accepted: true };
  });

  handle('app:reset-progress', () => {
    store.resetProgress();
    logger.warn('settings', 'Guide progress and the wipe acknowledgement were reset.');
    return { ok: true };
  });

  handle('app:hash-item', async ({ id }) => {
    if (!id) throw new Error('No item id.');
    const item = ITEM_BY_ID.get(id);
    if (!item) throw new Error('Unknown item.');
    const state = store.get();
    if (state.demo) throw new Error('Demo mode has no real file to hash.');
    const absolute = item.dynamic === 'ramdisk'
      ? path.join(state.workspace, 'ramdisk', fs.readdirSync(path.join(state.workspace, 'ramdisk')).find((name) => /\.img$/i.test(name)) || '')
      : path.join(state.workspace, item.rel);
    if (!exists(absolute)) throw new Error('File is missing.');
    const sha256 = await sha256File(absolute);
    store.update((draft) => {
      const rel = item.dynamic === 'ramdisk' ? `ramdisk/${path.basename(absolute)}` : item.rel;
      draft.hashes[rel] = {
        sha256,
        bytes: fs.statSync(absolute).size,
        at: new Date().toISOString(),
        source: 'existing file',
      };
      return draft;
    });
    logger.info('inventory', `${path.basename(absolute)} sha256 ${sha256}`);
    return { id, sha256 };
  });

  handle('app:export-diagnostics', async (_payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await exportDiagnostics({
      app,
      dialog: { showSaveDialog: (options) => dialog.showSaveDialog(win, options) },
      logger,
      environment,
      store,
      deviceService,
      inventoryService,
    });
    return result;
  });

  handle('app:clear-logs', () => {
    logger.clear();
    logger.info('console', 'Console cleared.');
    return { ok: true };
  });

  handle('app:copy-workspace-path', () => ({ path: store.get().workspace }));

  return { bootstrap, getSnapshot, broadcastSnapshot, scheduleSnapshot };
}

module.exports = { createIpc };
