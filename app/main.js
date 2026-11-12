'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeTheme } = require('electron');
const { createStore } = require('./src/main/state');
const { Logger } = require('./src/main/log');
const { createEnvironmentService } = require('./src/main/environment');
const { createInventoryService } = require('./src/main/inventory-service');
const { createDeviceService } = require('./src/main/device');
const { createChecksService } = require('./src/main/checks');
const { createEdlService } = require('./src/main/edl');
const { createDownloadService } = require('./src/main/downloads');
const { createImportService } = require('./src/main/importer');
const { createBuilderService } = require('./src/main/builder');
const { createIpc } = require('./src/main/ipc');
const { seedDemoLogsIfNeeded } = require('./src/main/demo-logs');
const { ensureDir } = require('./src/main/files');

const VERSION = '1.4.0';
const APP_NAME = 'MatePad 11 Companion';

function parseArgs(argv) {
  const args = { demo: false, screenshot: null, screenshotDir: null, profile: null, width: 1440, height: 900, dev: false, lang: null };
  for (const raw of argv) {
    if (raw === '--demo') args.demo = true;
    else if (raw === '--dev') args.dev = true;
    else if (raw.startsWith('--lang=')) args.lang = raw.slice('--lang='.length);
    else if (raw.startsWith('--profile=')) args.profile = raw.slice('--profile='.length);
    else if (raw.startsWith('--screenshot=')) args.screenshot = raw.slice('--screenshot='.length);
    else if (raw.startsWith('--screenshot-dir=')) args.screenshotDir = raw.slice('--screenshot-dir='.length);
    else if (raw.startsWith('--width=')) args.width = Number(raw.slice('--width='.length)) || 1440;
    else if (raw.startsWith('--height=')) args.height = Number(raw.slice('--height='.length)) || 900;
  }
  return args;
}

const args = parseArgs(process.argv.slice(1));
if (args.profile) {
  app.setPath('userData', path.resolve(args.profile));
}
app.setName(APP_NAME);
app.disableHardwareAcceleration();
if (process.platform === 'win32') app.setAppUserModelId('com.matepad11.companion');

const gotLock = args.screenshot ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
}

let mainWindow = null;
let services = null;
let quittingForScreenshot = false;

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', visible: Boolean(args.dev) },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const window = new BrowserWindow({
    width: args.width,
    height: args.height,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0B0C0F' : '#F4F1EA',
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true,
    },
  });
  window.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  window.once('ready-to-show', () => {
    if (!args.screenshot) window.show();
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) services?.logger.error('renderer', message);
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  window.webContents.on('did-finish-load', () => {
    if (services) {
      services.ipc
        .bootstrap()
        .catch((error) => {
          services.logger.error('app', `Bootstrap failed: ${error.message}`);
        })
        .finally(() => {
          if (args.screenshot) {
            captureScreens(window).catch((error) => {
              console.error(error);
              app.exit(1);
            });
          }
        });
    }
  });
  if (args.dev) window.webContents.openDevTools({ mode: 'detach' });
  return window;
}

async function waitForRendererReady(window, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = await window.webContents.executeJavaScript('Boolean(window.__companionReady)');
      if (ready) return true;
    } catch {
      /* the document may still be loading */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function captureScreens(window) {
  const dir = path.resolve(args.screenshotDir || path.join(__dirname, '..', 'screens'));
  ensureDir(dir);
  const wanted = String(args.screenshot || 'all');
  const all = ['overview', 'prepare', 'tools', 'device', 'unlock', 'root', 'console', 'settings'];
  const views = wanted === 'all' ? all : wanted.split(',').map((view) => view.trim()).filter(Boolean);
  const ready = await waitForRendererReady(window);
  if (!ready) {
    console.error('Renderer never signalled ready');
    app.exit(1);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  for (const view of views) {
    if (!all.includes(view)) continue;
    await window.webContents.executeJavaScript(`window.__companionSetView(${JSON.stringify(view)})`);
    await new Promise((resolve) => setTimeout(resolve, 480));
    const image = await window.webContents.capturePage();
    const png = image.resize({ width: args.width, height: args.height, quality: 'best' }).toPNG();
    const file = path.join(dir, `${view}.png`);
    fs.writeFileSync(file, png);
    console.log(`captured ${view} -> ${file}`);
  }
  quittingForScreenshot = true;
  app.quit();
}

app.whenReady().then(async () => {
  buildMenu();
  const userData = app.getPath('userData');
  ensureDir(userData);
  const store = createStore({ userData, home: app.getPath('home'), locale: app.getLocale() });
  if (args.demo && !store.isDemo()) store.setDemo(true);
  if (args.lang && ['en', 'zh'].includes(args.lang)) store.setLanguage(args.lang);
  nativeTheme.themeSource = store.get().theme === 'light' ? 'light' : 'dark';

  const logger = new Logger({ version: VERSION });
  logger.attachFile(path.join(userData, 'logs'));

  const environment = createEnvironmentService({ store, logger });
  const inventoryService = createInventoryService({ store, logger });
  const deviceService = createDeviceService({ store, logger, environment });
  const checksService = createChecksService({ store, logger, environment });
  const edlService = createEdlService({ store, logger });
  const downloadService = createDownloadService({ store, logger });
  const importService = createImportService({ store, logger });
  const builderService = createBuilderService({ store, logger, environment });
  const ipc = createIpc({
    ipcMain,
    app,
    dialog,
    store,
    logger,
    environment,
    inventoryService,
    deviceService,
    checksService,
    edlService,
    downloadService,
    importService,
    builderService,
    version: VERSION,
  });
  services = { store, logger, environment, inventoryService, deviceService, checksService, edlService, downloadService, importService, builderService, ipc };
  seedDemoLogsIfNeeded(store, logger);
  logger.info('app', `${APP_NAME} ${VERSION} starting on ${process.platform}`);

  mainWindow = createWindow();
  if (args.screenshot) mainWindow.hide();
});

app.on('window-all-closed', () => {
  if (quittingForScreenshot) return;
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

process.on('uncaughtException', (error) => {
  try {
    services?.logger.error('app', `Uncaught: ${error.stack || error.message}`);
  } catch {
    /* ignore */
  }
  console.error(error);
});

module.exports = { parseArgs };
