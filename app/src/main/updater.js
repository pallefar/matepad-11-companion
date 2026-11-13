'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { RELEASE_API, releaseInfo } = require('../core/update');
const { ensureDir } = require('./files');

const USER_AGENT = 'MatePad-11-Companion-Updater';

function request(url, { redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' } },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirects < 6) {
          res.resume();
          resolve(request(new URL(res.headers.location, url).toString(), { redirects: redirects + 1 }));
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`GitHub request failed (${status}).`));
          return;
        }
        resolve(res);
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error('GitHub request timed out.')));
    req.on('error', reject);
  });
}

async function requestJson(url) {
  const res = await request(url);
  let body = '';
  for await (const chunk of res) {
    body += chunk;
    if (body.length > 2 * 1024 * 1024) throw new Error('GitHub response was too large.');
  }
  return JSON.parse(body);
}

async function requestText(url) {
  const res = await request(url);
  let body = '';
  for await (const chunk of res) body += chunk;
  return body;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadFile(url, dest, onProgress) {
  const res = await request(url);
  const totalHeader = Number(res.headers['content-length']);
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
  const hash = crypto.createHash('sha256');
  let received = 0;
  ensureDir(path.dirname(dest));
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.on('data', (chunk) => {
      hash.update(chunk);
      received += chunk.length;
      if (typeof onProgress === 'function') onProgress({ received, total });
    });
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.pipe(out);
  });
  return { sha256: hash.digest('hex'), bytes: received };
}

function expectedDigest(info) {
  const digest = String(info.asset?.digest || '');
  const match = digest.match(/^sha256:([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

function helperScript() {
  return String.raw`param(
  [int]$ProcessId,
  [string]$Zip,
  [string]$Target,
  [string]$Exe
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'matepad-update.log'
try { Start-Transcript -Path $log -Append | Out-Null } catch {}
$backup = $null
$staging = $null
try {
  Wait-Process -Id $ProcessId -Timeout 120 -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 700
  $staging = Join-Path $env:TEMP ('matepad-update-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  Expand-Archive -LiteralPath $Zip -DestinationPath $staging -Force
  $source = Get-ChildItem -LiteralPath $staging -Directory | Select-Object -First 1
  if (-not $source) { throw 'The update archive does not contain an app folder.' }
  $backup = $Target + '.backup-' + (Get-Date -Format 'yyyyMMddHHmmss')
  Move-Item -LiteralPath $Target -Destination $backup -Force
  Move-Item -LiteralPath $source.FullName -Destination $Target -Force
  Start-Process -FilePath $Exe -WorkingDirectory $Target
  Start-Sleep -Seconds 8
  Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue
} catch {
  Add-Content -Path $log -Value ('Update failed: ' + $_.Exception.Message) -ErrorAction SilentlyContinue
  if ($backup -and (Test-Path -LiteralPath $backup)) {
    if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue }
    Move-Item -LiteralPath $backup -Destination $Target -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $Exe) { Start-Process -FilePath $Exe -WorkingDirectory $Target -ErrorAction SilentlyContinue }
  if ($staging) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
} finally {
  try { Stop-Transcript | Out-Null } catch {}
}
`;
}

function createUpdaterService({ app, logger, isDemo }) {
  let cached = null;
  let cachedAt = 0;
  let progress = null;
  let progressSink = null;

  function currentVersion() {
    return app.getVersion();
  }

  function setProgressSink(sink) {
    progressSink = sink;
  }

  function emitProgress(payload) {
    progress = payload;
    if (typeof progressSink === 'function') progressSink(payload);
  }

  async function check({ force = false } = {}) {
    const now = Date.now();
    if (!force && cached && now - cachedAt < 5 * 60 * 1000) return cached;
    const release = await requestJson(RELEASE_API);
    const info = releaseInfo(release, currentVersion(), process.platform, app.isPackaged);
    info.checkedAt = new Date().toISOString();
    cached = info;
    cachedAt = now;
    logger.info('update', `Current ${info.current}; latest ${info.latest}; ${info.available ? 'update available' : 'up to date'}.`);
    return info;
  }

  async function install() {
    if (!app.isPackaged || process.platform !== 'win32') {
      return {
        ok: false,
        supported: false,
        releaseUrl: cached?.releaseUrl || 'https://github.com/pallefar/matepad-11-companion/releases/latest',
        reason: 'In-app self-update is supported in the packaged Windows build. Use the release page here.',
      };
    }
    const info = await check({ force: true });
    if (!info.available) return { ok: false, upToDate: true, releaseUrl: info.releaseUrl };
    if (!info.asset) throw new Error(info.assetError || 'No update asset was found.');
    const work = path.join(app.getPath('temp'), 'matepad-update', info.latest);
    ensureDir(work);
    const zipPath = path.join(work, info.asset.name);
    logger.info('update', `Downloading ${info.asset.name}...`);
    const downloaded = await downloadFile(info.asset.url, zipPath, (current) => {
      emitProgress({
        phase: 'download',
        received: current.received,
        total: current.total,
        percent: current.total ? Math.round((current.received / current.total) * 100) : null,
      });
    });
    let expected = expectedDigest(info);
    if (!expected && info.shaAsset) {
      const text = await requestText(info.shaAsset.url);
      const match = text.match(/\b([a-f0-9]{64})\b/i);
      if (match) expected = match[1].toLowerCase();
    }
    if (!expected) throw new Error('The release has no verifiable SHA-256 digest.');
    if (downloaded.sha256.toLowerCase() !== expected) {
      fs.rmSync(zipPath, { force: true });
      throw new Error('Update hash did not match the GitHub release digest. Download cancelled.');
    }
    emitProgress({ phase: 'verified', percent: 100, received: downloaded.bytes, total: downloaded.bytes });
    const scriptPath = path.join(work, 'install-update.ps1');
    fs.writeFileSync(scriptPath, `\uFEFF${helperScript()}`, 'utf8');
    const target = path.dirname(app.getPath('exe'));
    const exe = app.getPath('exe');
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (!fs.existsSync(powershell)) throw new Error('Windows PowerShell was not found; update cannot start.');
    const child = spawn(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ProcessId', String(process.pid), '-Zip', zipPath, '-Target', target, '-Exe', exe],
      { detached: true, windowsHide: true, stdio: 'ignore' },
    );
    child.unref();
    logger.good('update', `Update ${info.latest} downloaded and verified; restarting through the updater.`);
    return { ok: true, restarting: true, version: info.latest, target };
  }

  return {
    check,
    install,
    currentVersion,
    getCached: () => cached,
    getProgress: () => progress,
    setProgressSink,
  };
}

module.exports = { createUpdaterService, helperScript, downloadFile };
