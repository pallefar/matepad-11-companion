'use strict';

const path = require('node:path');
const { readJson, writeJsonAtomic } = require('./files');
const { makeDemoState } = require('./demo');
const { normalizeSupportUrl } = require('../core/support');

function defaultWorkspace(home) {
  return path.join(home, 'MatePad11');
}

function defaultState({ home, locale = 'en' }) {
  return {
    version: 1,
    language: String(locale || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en',
    workspace: defaultWorkspace(home),
    toolkitMode: 'build',
    toolkitPath: null,
    method: 'apatch',
    theme: 'dark',
    supportUrl: null,
    demo: false,
    acknowledgements: {
      disclaimer: null,
      unlockWipe: null,
      backup: null,
      backupOverride: null,
    },
    progress: {
      unlock: { steps: {} },
      root: { steps: {} },
    },
    hashes: {},
    build: {
      commit: null,
      builtAt: null,
      dotnet: null,
      sourceFetchedAt: null,
    },
    lastDevice: null,
    updatedAt: null,
  };
}

function mergeState(defaults, loaded) {
  if (!loaded || typeof loaded !== 'object') return defaults;
  const merged = { ...defaults, ...loaded };
  merged.acknowledgements = { ...defaults.acknowledgements, ...(loaded.acknowledgements || {}) };
  merged.progress = {
    unlock: { steps: {} },
    root: { steps: {} },
    ...(loaded.progress || {}),
  };
  merged.progress.unlock = { steps: {}, ...(loaded.progress?.unlock || {}) };
  merged.progress.root = { steps: {}, ...(loaded.progress?.root || {}) };
  merged.build = { ...defaults.build, ...(loaded.build || {}) };
  merged.hashes = { ...(loaded.hashes || {}) };
  merged.demo = false;
  if (!['build', 'existing'].includes(merged.toolkitMode)) merged.toolkitMode = 'build';
  if (!['apatch', 'magisk'].includes(merged.method)) merged.method = 'apatch';
  if (!['en', 'zh'].includes(merged.language)) merged.language = 'en';
  if (!['dark', 'light'].includes(merged.theme)) merged.theme = 'dark';
  try {
    merged.supportUrl = normalizeSupportUrl(merged.supportUrl);
  } catch {
    merged.supportUrl = null;
  }
  return merged;
}

/**
 * Two states live here:
 *  - the real state persisted to userData/state.json
 *  - an in-memory demo state that is reseeded on every launch and never written over
 *    the real workspace, acknowledgements, or progress.
 * Toggling demo changes which state is active; all services go through get().
 */
function createStore({ userData, home, locale }) {
  const file = path.join(userData, 'state.json');
  const defaults = defaultState({ home, locale });
  const loaded = readJson(file, null);
  let real = mergeState(defaults, loaded);
  let demoEnabled = Boolean(loaded?.demoEnabled);
  let demoState = makeDemoState(defaultState({ home, locale }));
  if (demoEnabled) {
    demoState.language = real.language;
    demoState.theme = real.theme;
  }
  let lastSaveError = null;

  function active() {
    return demoEnabled ? demoState : real;
  }

  function withFlag(state) {
    return { ...state, demo: demoEnabled };
  }

  function save() {
    real.updatedAt = new Date().toISOString();
    try {
      writeJsonAtomic(file, { ...real, demo: false, demoEnabled });
      lastSaveError = null;
    } catch (error) {
      lastSaveError = String(error.message || error);
    }
    return { ok: !lastSaveError, error: lastSaveError };
  }

  return {
    file,
    isDemo: () => demoEnabled,
    get() {
      return withFlag(active());
    },
    snapshot() {
      return structuredClone(withFlag(active()));
    },
    set(key, value) {
      active()[key] = value;
      save();
      return active()[key];
    },
    patch(partial) {
      Object.assign(active(), partial);
      save();
      return withFlag(active());
    },
    update(mutator) {
      const draft = structuredClone(active());
      const result = mutator(draft);
      const next = result && typeof result === 'object' ? result : draft;
      if (demoEnabled) demoState = next;
      else real = next;
      save();
      return withFlag(active());
    },
    setLanguage(language) {
      const next = ['en', 'zh'].includes(language) ? language : 'en';
      real.language = next;
      demoState.language = next;
      save();
      return next;
    },
    acknowledgeBackup(record) {
      if (!record || typeof record !== 'object' || !record.path) throw new Error('Missing backup folder.');
      const next = {
        path: String(record.path),
        imageCount: Number(record.imageCount) || 0,
        gptCount: Number(record.gptCount) || 0,
        totalBytes: Number(record.totalBytes) || 0,
        checkedAt: record.checkedAt || new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
        confirmed: true,
      };
      active().acknowledgements.backup = next;
      save();
      return next;
    },
    acknowledgeBackupOverride(phrase) {
      if (String(phrase || '').trim().toUpperCase() !== 'NO BACKUP') {
        throw new Error('Type NO BACKUP exactly to confirm.');
      }
      const next = {
        phrase: 'NO BACKUP',
        confirmedAt: new Date().toISOString(),
        confirmed: true,
      };
      active().acknowledgements.backupOverride = next;
      save();
      return next;
    },
    setSupportUrl(value) {
      const next = normalizeSupportUrl(value);
      real.supportUrl = next;
      demoState.supportUrl = next;
      save();
      return next;
    },
    setTheme(theme) {
      const next = theme === 'light' ? 'light' : 'dark';
      real.theme = next;
      demoState.theme = next;
      save();
      return next;
    },
    setDemo(enabled) {
      demoEnabled = Boolean(enabled);
      if (demoEnabled) demoState = makeDemoState(defaultState({ home, locale }));
      if (demoEnabled) {
        demoState.language = real.language;
        demoState.theme = real.theme;
      }
      save();
      return demoEnabled;
    },
    resetProgress() {
      active().progress = { unlock: { steps: {} }, root: { steps: {} } };
      active().acknowledgements.unlockWipe = null;
      active().acknowledgements.backup = null;
      active().acknowledgements.backupOverride = null;
      save();
    },
    getLastSaveError() {
      return lastSaveError;
    },
  };
}

module.exports = { createStore, defaultState, defaultWorkspace, mergeState };
