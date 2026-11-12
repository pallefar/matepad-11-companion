'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/state');

function tempEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-state-'));
  return {
    dir,
    userData: path.join(dir, 'userData'),
    home: path.join(dir, 'home'),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('demo mode is an in-memory overlay and never overwrites the real state', () => {
  const env = tempEnv();
  fs.mkdirSync(env.userData, { recursive: true });
  fs.mkdirSync(env.home, { recursive: true });
  try {
    const store = createStore({ userData: env.userData, home: env.home, locale: 'en' });
    const realWorkspace = store.get().workspace;
    assert.equal(store.isDemo(), false);

    store.setDemo(true);
    assert.equal(store.isDemo(), true);
    assert.equal(store.get().workspace, 'C:\\MatePad11');
    store.update((draft) => {
      draft.workspace = 'C:\\DemoOnly';
      draft.acknowledgements.disclaimer = 'demo';
      return draft;
    });
    assert.equal(store.get().workspace, 'C:\\DemoOnly');

    store.setDemo(false);
    assert.equal(store.isDemo(), false);
    assert.equal(store.get().workspace, realWorkspace);
    assert.equal(store.get().acknowledgements.disclaimer, null);
  } finally {
    env.cleanup();
  }
});

test('language and guide progress persist across a reload', () => {
  const env = tempEnv();
  fs.mkdirSync(env.userData, { recursive: true });
  fs.mkdirSync(env.home, { recursive: true });
  try {
    const store = createStore({ userData: env.userData, home: env.home, locale: 'en' });
    store.setLanguage('zh');
    store.update((draft) => {
      draft.progress.unlock.steps.branch = true;
      draft.acknowledgements.disclaimer = '2026-01-01T00:00:00.000Z';
      return draft;
    });
    const reloaded = createStore({ userData: env.userData, home: env.home, locale: 'en' });
    assert.equal(reloaded.get().language, 'zh');
    assert.equal(reloaded.get().progress.unlock.steps.branch, true);
    assert.equal(reloaded.get().acknowledgements.disclaimer, '2026-01-01T00:00:00.000Z');
  } finally {
    env.cleanup();
  }
});

test('resetProgress clears guide state and the wipe acknowledgement only', () => {
  const env = tempEnv();
  fs.mkdirSync(env.userData, { recursive: true });
  fs.mkdirSync(env.home, { recursive: true });
  try {
    const store = createStore({ userData: env.userData, home: env.home, locale: 'en' });
    store.update((draft) => {
      draft.progress.root.completed = true;
      draft.acknowledgements.unlockWipe = '2026-01-02T00:00:00.000Z';
      draft.acknowledgements.disclaimer = '2026-01-01T00:00:00.000Z';
      return draft;
    });
    store.resetProgress();
    assert.equal(store.get().progress.root.completed, undefined);
    assert.equal(store.get().acknowledgements.unlockWipe, null);
    assert.equal(store.get().acknowledgements.disclaimer, '2026-01-01T00:00:00.000Z');
  } finally {
    env.cleanup();
  }
});

test('theme defaults to dark, validates input, and persists across reload', () => {
  const env = tempEnv();
  fs.mkdirSync(env.userData, { recursive: true });
  fs.mkdirSync(env.home, { recursive: true });
  try {
    const store = createStore({ userData: env.userData, home: env.home, locale: 'en' });
    assert.equal(store.get().theme, 'dark');
    assert.equal(store.setTheme('light'), 'light');
    assert.equal(store.get().theme, 'light');
    const reloaded = createStore({ userData: env.userData, home: env.home, locale: 'en' });
    assert.equal(reloaded.get().theme, 'light');
    assert.equal(reloaded.setTheme('sepia'), 'dark');
    assert.equal(reloaded.get().theme, 'dark');
  } finally {
    env.cleanup();
  }
});

test('theme changes while demo is enabled update the real preference too', () => {
  const env = tempEnv();
  fs.mkdirSync(env.userData, { recursive: true });
  fs.mkdirSync(env.home, { recursive: true });
  try {
    const store = createStore({ userData: env.userData, home: env.home, locale: 'en' });
    store.setTheme('light');
    store.setDemo(true);
    assert.equal(store.get().theme, 'light');
    store.setTheme('dark');
    assert.equal(store.get().theme, 'dark');
    store.setDemo(false);
    assert.equal(store.get().theme, 'dark');
  } finally {
    env.cleanup();
  }
});
