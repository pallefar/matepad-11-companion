'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ensureDir, exists, extractZipSafe, removeDirSafe, writeTextAtomic } = require('./files');
const { runProcess, runCapture, ProcessRegistry } = require('./shell');
const { httpDownload, fetchJson } = require('./downloads');
const { dotnetPublishArgs, dotnetInstallArgs, formatCommand } = require('../core/commands');
const { URLS } = require('../core/sources');

const BUILD_TIMEOUT_MS = 25 * 60 * 1000;

function createBuilderService({ store, logger, environment }) {
  const registry = new ProcessRegistry();
  let running = false;
  let progressSink = null;
  let lastResult = null;

  function setProgressSink(sink) {
    progressSink = typeof sink === 'function' ? sink : null;
  }

  function emit(payload) {
    if (progressSink) {
      try {
        progressSink(payload);
      } catch {
        /* ignore */
      }
    }
  }

  function guard() {
    const state = store.get();
    if (state.demo) throw new Error('Demo mode: build actions are disabled.');
    if (process.platform !== 'win32') {
      throw new Error(
        'The WinUI toolkit can only be built on Windows: its XAML compiler is a Windows executable. Run the companion on your Windows PC for this step.',
      );
    }
    if (!state.workspace) throw new Error('Choose a workspace first.');
    ensureDir(state.workspace);
    return state.workspace;
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
        if (entry.isDirectory() && depth < 5 && !['bin', 'obj', '.git'].includes(entry.name)) {
          stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
      }
    }
    return null;
  }

  async function fetchSource({ force = false } = {}) {
    const root = guard();
    const setup = path.join(root, '.setup');
    const srcDir = path.join(setup, 'src');
    if (!force && exists(srcDir) && findCsproj(srcDir)) {
      return { csproj: findCsproj(srcDir), commit: store.get().build?.commit || null, reused: true };
    }
    ensureDir(setup);
    emit({ phase: 'source', message: 'Reading the upstream repository metadata' });
    let commit = null;
    try {
      const info = await fetchJson(URLS.upstreamLatestCommit, { timeoutMs: 15000 });
      commit = info?.sha || null;
    } catch (error) {
      logger.warn('build', `Could not read the latest commit (${error.message}); the source ZIP will still be downloaded.`);
    }
    const zipPath = path.join(setup, 'source.zip');
    emit({ phase: 'source', message: 'Downloading the upstream source ZIP' });
    await httpDownload(URLS.upstream.sourceZip, zipPath, {
      onProgress: (progress) =>
        emit({ phase: 'source', message: 'Downloading the upstream source ZIP', ...progress }),
    });
    const extractDir = path.join(setup, 'src-extract');
    removeDirSafe(extractDir);
    emit({ phase: 'source', message: 'Extracting the source' });
    extractZipSafe(zipPath, extractDir);
    let entries = [];
    try {
      entries = fs.readdirSync(extractDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      entries = [];
    }
    let candidateRoot = entries.length === 1 ? path.join(extractDir, entries[0].name) : extractDir;
    if (!findCsproj(candidateRoot)) candidateRoot = extractDir;
    const csproj = findCsproj(candidateRoot);
    if (!csproj) throw new Error('The upstream source ZIP did not contain MatePadToolbox.csproj.');
    removeDirSafe(srcDir);
    try {
      fs.renameSync(candidateRoot, srcDir);
    } catch (error) {
      throw new Error(`Could not place the source in the workspace: ${error.message}`);
    }
    removeDirSafe(extractDir);
    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* ignore */
    }
    store.update((draft) => {
      draft.build.commit = commit;
      draft.build.sourceFetchedAt = new Date().toISOString();
      return draft;
    });
    logger.good('build', `Upstream source ready${commit ? ` at ${commit.slice(0, 8)}` : ''}: ${path.relative(root, csproj)}`);
    return { csproj, commit, reused: false };
  }

  async function ensureDotnet() {
    const root = guard();
    emit({ phase: 'dotnet', message: 'Checking for the .NET 8 SDK' });
    const env = await environment.get({ force: true });
    if (env.dotnet?.found && env.dotnet.has8) {
      logger.good('build', `.NET 8 found: ${env.dotnet.path} (${env.dotnet.versions.join(', ')})`);
      return env.dotnet.path;
    }
    const installDir = path.join(root, '.dotnet');
    const scriptPath = path.join(root, '.setup', 'dotnet-install.ps1');
    const localDotnet = path.join(installDir, 'dotnet.exe');
    if (exists(localDotnet)) {
      const probe = await runCapture(localDotnet, ['--list-sdks'], { timeoutMs: 12000 });
      if (probe.code === 0) {
        logger.info('build', `Using the workspace-local .NET SDK: ${localDotnet}`);
        return localDotnet;
      }
    }
    ensureDir(path.join(root, '.setup'));
    emit({ phase: 'dotnet', message: 'Downloading the official dotnet-install script' });
    await httpDownload(URLS.dotnetInstallScript, scriptPath, {
      onProgress: (progress) =>
        emit({ phase: 'dotnet', message: 'Downloading the official dotnet-install script', ...progress }),
    });
    const powershell = env.powershell?.found ? env.powershell.path : 'powershell.exe';
    const args = dotnetInstallArgs(scriptPath, installDir);
    emit({ phase: 'dotnet', message: 'Installing .NET 8 SDK into the workspace (no admin required)' });
    logger.info('build', `Installing .NET 8 SDK: ${formatCommand(powershell, args)}`);
    const result = await registry.run('build', powershell, args, {
      timeoutMs: 20 * 60 * 1000,
      onLine: (line) => {
        logger.info('build', `[dotnet-install] ${line}`);
        emit({ phase: 'dotnet', message: line.slice(0, 180) });
      },
    });
    if (!exists(localDotnet)) {
      throw new Error(`.NET install did not produce ${localDotnet}. ${(result.combined || '').slice(-800)}`);
    }
    logger.good('build', `.NET SDK installed: ${localDotnet}`);
    environment.clear();
    return localDotnet;
  }

  async function build({ forceSource = false } = {}) {
    if (running) return { ok: false, error: 'A build is already running.' };
    running = true;
    const startedAt = new Date().toISOString();
    try {
      const root = guard();
      const source = await fetchSource({ force: forceSource });
      const dotnet = await ensureDotnet();
      const args = dotnetPublishArgs(source.csproj, root);
      const commandLine = formatCommand(dotnet, args);
      emit({ phase: 'publish', message: 'Running dotnet publish (this can take 5–15 minutes)', command: commandLine });
      logger.info('build', `Publishing: ${commandLine}`);
      const result = await registry.run('build', dotnet, args, {
        cwd: root,
        timeoutMs: BUILD_TIMEOUT_MS,
        env: {
          DOTNET_CLI_TELEMETRY_OPTOUT: '1',
          DOTNET_NOLOGO: '1',
          DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
        },
        onLine: (line) => {
          logger.info('build', line);
          if (/error|failed|warning/i.test(line)) emit({ phase: 'publish', message: line.slice(0, 240) });
        },
      });
      if (result.code !== 0 || result.timedOut) {
        const error = result.timedOut
          ? 'The build timed out after 25 minutes.'
          : `dotnet publish exited with code ${result.code}.`;
        logger.error('build', `${error} See the build log for the failing line.`);
        lastResult = { ok: false, error, startedAt, finishedAt: new Date().toISOString(), command: commandLine };
        emit({ phase: 'error', message: error });
        return { ...lastResult, logTail: logger.snapshot(400).filter((entry) => entry.source === 'build').slice(-60) };
      }
      const exe = path.join(root, 'MatePadToolbox.exe');
      if (!exists(exe)) {
        const error = 'Build finished but MatePadToolbox.exe was not produced in the workspace root.';
        logger.error('build', error);
        lastResult = { ok: false, error, startedAt, finishedAt: new Date().toISOString(), command: commandLine };
        return lastResult;
      }
      await finalizeWorkspace({ root, source, dotnet, commandLine });
      store.update((draft) => {
        draft.toolkitMode = 'build';
        draft.toolkitPath = exe;
        draft.build.commit = source.commit || draft.build.commit;
        draft.build.builtAt = new Date().toISOString();
        return draft;
      });
      environment.clear();
      logger.good('build', `Toolkit built: ${exe}`);
      emit({ phase: 'done', message: 'The toolkit is ready to launch' });
      lastResult = {
        ok: true,
        exe,
        startedAt,
        finishedAt: new Date().toISOString(),
        command: commandLine,
        logTail: logger.snapshot(400).filter((entry) => entry.source === 'build').slice(-40),
      };
      return lastResult;
    } catch (error) {
      logger.error('build', error.message);
      emit({ phase: 'error', message: error.message });
      lastResult = { ok: false, error: error.message, startedAt, finishedAt: new Date().toISOString() };
      return lastResult;
    } finally {
      running = false;
    }
  }

  async function finalizeWorkspace({ root, source, dotnet, commandLine }) {
    const srcRoot = path.dirname(source.csproj);
    const licenseCandidates = [path.join(srcRoot, 'LICENSE'), path.join(root, '.setup', 'src', 'LICENSE')];
    for (const license of licenseCandidates) {
      if (exists(license)) {
        try {
          fs.copyFileSync(license, path.join(root, 'LICENSE-MatePad11-ToolBox.txt'));
          break;
        } catch {
          /* ignore */
        }
      }
    }
    const readme = path.join(root, '.setup', 'src', 'README.md');
    if (exists(readme)) {
      try {
        ensureDir(path.join(root, 'docs'));
        fs.copyFileSync(readme, path.join(root, 'docs', 'UPSTREAM-README.md'));
      } catch {
        /* ignore */
      }
    }
    const info = [
      'MatePad 11 Companion — toolkit build record',
      '',
      `built: ${new Date().toISOString()}`,
      `source: ${URLS.upstream.repo}`,
      `commit: ${source.commit || 'unknown'}`,
      `license: ${URLS.upstream.license}`,
      `dotnet: ${dotnet}`,
      `command: ${commandLine}`,
      '',
      'This directory contains a locally built copy of the upstream MatePadToolbox.',
      'The companion did not bundle or redistribute this binary. The upstream source is GPL-3.0-or-later.',
      'No proprietary Qualcomm, Huawei, driver, or unlock image files are included by the companion.',
      '',
    ].join('\n');
    writeTextAtomic(path.join(root, 'BUILD-INFO.txt'), info);
    // Record the SDK version for the UI without blocking the build handler.
    const probe = await runCapture(dotnet, ['--version'], { timeoutMs: 10000 });
    store.update((draft) => {
      draft.build.dotnet = (probe.combined || '').trim().split(/\r?\n/)[0] || null;
      return draft;
    });
  }

  function cancel() {
    const cancelled = registry.cancel('build');
    if (cancelled) logger.warn('build', 'Build cancellation requested.');
    return { ok: cancelled };
  }

  async function validateExisting(dir) {
    const root = path.resolve(String(dir || ''));
    if (!exists(root)) return { ok: false, error: 'That folder does not exist.' };
    const exe = path.join(root, 'MatePadToolbox.exe');
    if (!exists(exe)) {
      return {
        ok: false,
        error: 'Select the folder that directly contains MatePadToolbox.exe (not its parent or publish subfolder).',
      };
    }
    const warnings = [];
    for (const rel of ['tools/adb.exe', 'tools/fastboot.exe', 'tools/7z.exe']) {
      if (!exists(path.join(root, rel))) warnings.push(`${rel} is missing; the tool pack step will fill it.`);
    }
    store.update((draft) => {
      draft.workspace = root;
      draft.toolkitMode = 'existing';
      draft.toolkitPath = exe;
      draft.hashes = {};
      return draft;
    });
    environment.clear();
    logger.good('workspace', `Existing toolkit selected: ${exe}`);
    return { ok: true, exe, warnings, workspace: root };
  }

  async function launch() {
    const state = store.get();
    if (state.demo) throw new Error('Demo mode: the real toolkit cannot be launched.');
    if (process.platform !== 'win32') throw new Error('The upstream toolkit is a Windows application.');
    const exe = state.toolkitPath || path.join(state.workspace, 'MatePadToolbox.exe');
    if (!exists(exe)) throw new Error('Toolkit executable not found. Build it or select an existing folder first.');
    const child = spawn(exe, [], {
      cwd: path.dirname(exe),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    logger.good('toolkit', `Launched ${exe}`);
    return { ok: true, exe };
  }

  return {
    build,
    cancel,
    fetchSource,
    ensureDotnet,
    validateExisting,
    launch,
    setProgressSink,
    isRunning: () => running,
    lastResult: () => lastResult,
  };
}

module.exports = { createBuilderService };
