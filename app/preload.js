'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

const api = {
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  snapshot: () => invoke('app:snapshot'),
  bootstrap: () => invoke('app:bootstrap'),
  setLanguage: (language) => invoke('app:set-language', { language }),
  setTheme: (theme) => invoke('app:set-theme', { theme }),
  setDemo: (enabled) => invoke('app:set-demo', { enabled }),
  setMethod: (method) => invoke('app:set-method', { method }),
  chooseWorkspace: () => invoke('app:set-workspace'),
  useExisting: () => invoke('app:use-existing'),
  openWorkspace: () => invoke('app:open-workspace'),
  openFolder: (kind) => invoke('app:open-folder', { kind }),
  openPath: (target) => invoke('app:open-path', { target }),
  revealPath: (target) => invoke('app:reveal-path', { target }),
  openUserData: () => invoke('app:open-user-data'),
  openExternal: (url) => invoke('app:open-external', { url }),
  refresh: () => invoke('app:refresh'),
  refreshDevice: () => invoke('app:refresh-device'),
  systemCheck: () => invoke('app:system-check'),
  chooseBackup: () => invoke('app:choose-backup'),
  recordBackup: (path) => invoke('app:record-backup', { path }),
  detectEdl: () => invoke('app:detect-edl'),
  installDownload: (id) => invoke('app:install-download', { id }),
  installExternalPack: () => invoke('app:install-external'),
  importDialog: (mode) => invoke('app:import-dialog', { mode }),
  importPaths: (paths, role) => invoke('app:import-paths', { paths, role }),
  build: (forceSource) => invoke('app:build', { forceSource: Boolean(forceSource) }),
  cancelBuild: () => invoke('app:cancel-build'),
  launchToolkit: () => invoke('app:launch-toolkit'),
  deviceAction: (action, kind) => invoke('app:device-action', { action, kind }),
  guideStep: (flow, stepId, done, complete) => invoke('app:guide-step', { flow, stepId, done, complete }),
  ackDisclaimer: (accepted) => invoke('app:ack-disclaimer', { accepted }),
  ackWipe: (phrase, backup) => invoke('app:ack-wipe', { phrase, backup }),
  resetProgress: () => invoke('app:reset-progress'),
  hashItem: (id) => invoke('app:hash-item', { id }),
  exportDiagnostics: () => invoke('app:export-diagnostics'),
  clearLogs: () => invoke('app:clear-logs'),
  onEvent: (callback) => {
    const listener = (_event, message) => {
      try {
        callback(message);
      } catch (error) {
        console.error('renderer event handler failed', error);
      }
    };
    ipcRenderer.on('app:event', listener);
    return () => ipcRenderer.removeListener('app:event', listener);
  },
};

contextBridge.exposeInMainWorld('companion', api);
