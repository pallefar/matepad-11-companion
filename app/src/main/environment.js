'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { runCapture } = require('./shell');
const { freeSpace, exists } = require('./files');
const { parseDotnetSdks } = require('../core/parse');
const { makeDemoEnvironment } = require('./demo');

function archLabel() {
  if (process.arch === 'x64') return 'x64';
  if (process.arch === 'arm64') return 'arm64';
  return process.arch;
}

function windowsLabel(release) {
  const parts = String(release || '').split('.').map(Number);
  const build = parts[2] || 0;
  if (build >= 22000) return 'Windows 11';
  if (build >= 17763) return 'Windows 10';
  return `Windows ${release}`;
}

function platformLabel() {
  if (process.platform === 'win32') return windowsLabel(os.release());
  if (process.platform === 'darwin') return `macOS ${os.release()}`;
  return `${os.type()} ${os.release()}`;
}

async function whichBinary(name) {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = await runCapture(command, [name], { timeoutMs: 4000 });
  if (result.code !== 0) return null;
  const first = result.combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first || null;
}

function findToolkit(workspace, preferredPath) {
  const candidates = [];
  if (preferredPath) candidates.push(preferredPath);
  candidates.push(path.join(workspace, 'MatePadToolbox.exe'));
  candidates.push(path.join(workspace, 'publish', 'MatePadToolbox.exe'));
  for (const candidate of candidates) {
    if (candidate && exists(candidate)) {
      return { present: true, path: candidate, exe: candidate };
    }
  }
  // A built toolkit may put the exe one level down; keep this shallow and explicit.
  for (const entry of ['publish', 'bin', '.']) {
    const dir = path.join(workspace, entry);
    try {
      const names = fs.readdirSync(dir);
      const exe = names.find((name) => /^MatePadToolbox.*\.exe$/i.test(name));
      if (exe) {
        const full = path.join(dir, exe);
        return { present: true, path: full, exe: full };
      }
    } catch {
      /* ignore */
    }
  }
  return { present: false, path: null, exe: null };
}

function findCsproj(root) {
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && /MatePadToolbox\.csproj$/i.test(entry.name)) {
        return path.join(dir, entry.name);
      }
      if (entry.isDirectory() && depth < 4 && !['bin', 'obj', 'node_modules', '.git'].includes(entry.name)) {
        stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
      }
    }
  }
  return null;
}

function findAdb(workspace, isWindows) {
  const candidates = isWindows
    ? [path.join(workspace, 'tools', 'adb.exe')]
    : [path.join(workspace, 'tools', 'adb.exe'), path.join(workspace, 'tools', 'adb')];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

function findFastboot(workspace, isWindows) {
  const candidates = isWindows
    ? [path.join(workspace, 'tools', 'fastboot.exe')]
    : [path.join(workspace, 'tools', 'fastboot.exe'), path.join(workspace, 'tools', 'fastboot')];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

async function inspectDotnet(workspace) {
  const local = process.platform === 'win32'
    ? path.join(workspace, '.dotnet', 'dotnet.exe')
    : path.join(workspace, '.dotnet', 'dotnet');
  let dotnetPath = exists(local) ? local : null;
  let source = dotnetPath ? 'workspace' : null;
  if (!dotnetPath) {
    dotnetPath = await whichBinary(process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
    if (dotnetPath) source = 'PATH';
  }
  if (!dotnetPath) {
    return { found: false, path: null, versions: [], has8: false, source: null };
  }
  const result = await runCapture(dotnetPath, ['--list-sdks'], {
    timeoutMs: 12000,
    env: { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
  });
  const parsed = parseDotnetSdks(result.combined);
  return {
    found: true,
    path: dotnetPath,
    versions: parsed.versions,
    has8: parsed.has8,
    source,
    error: result.code === 0 ? null : result.error || result.combined.slice(0, 400),
  };
}

function createEnvironmentService({ store, logger }) {
  let cache = null;
  let cachedAt = 0;

  async function get({ force = false } = {}) {
    const state = store.get();
    if (state.demo) return makeDemoEnvironment();
    const now = Date.now();
    if (!force && cache && now - cachedAt < 15000) return cache;

    const workspace = state.workspace;
    const isWindows = process.platform === 'win32';
    const space = freeSpace(workspace);
    const powershellPath = isWindows
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : null;
    const powershell = isWindows
      ? { found: exists(powershellPath), path: powershellPath }
      : { found: false, path: null };
    const dotnet = isWindows || !isWindows ? await inspectDotnet(workspace) : null;
    const toolkit = findToolkit(workspace, state.toolkitPath);
    const sourceRoot = path.join(workspace, '.setup', 'src');
    const csproj = findCsproj(sourceRoot);
    const adbLocal = findAdb(workspace, isWindows);
    const fastbootLocal = findFastboot(workspace, isWindows);
    const systemAdb = await whichBinary(isWindows ? 'adb.exe' : 'adb');
    const systemFastboot = await whichBinary(isWindows ? 'fastboot.exe' : 'fastboot');
    const adbPath = isWindows ? adbLocal || systemAdb : systemAdb || adbLocal;
    const fastbootPath = isWindows ? fastbootLocal || systemFastboot : systemFastboot || fastbootLocal;

    const env = {
      isWindows,
      platform: process.platform,
      release: os.release(),
      platformLabel: platformLabel(),
      arch: archLabel(),
      freeBytes: space.freeBytes,
      totalBytes: space.totalBytes,
      powershell,
      dotnet,
      toolkit: {
        present: toolkit.present,
        path: toolkit.path,
        exe: toolkit.exe,
        sourcePresent: Boolean(csproj),
        csproj,
        sourceRoot,
        sourceUrl: 'https://github.com/run2000s/MatePad11_Tool_Kit_GUI',
        commit: state.build?.commit || null,
      },
      adbPath,
      fastbootPath,
      localAdbPath: adbLocal,
      localFastbootPath: fastbootLocal,
      systemAdb,
      systemFastboot,
      demo: false,
    };
    cache = env;
    cachedAt = now;
    return env;
  }

  return { get, clear: () => { cache = null; cachedAt = 0; } };
}

module.exports = { createEnvironmentService, findToolkit, findCsproj, platformLabel };
