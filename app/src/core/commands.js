'use strict';

const path = require('node:path');

function dotnetPublishArgs(csprojPath, outDir) {
  return [
    'publish',
    csprojPath,
    '-c',
    'Release',
    '-p:Platform=x64',
    '-r',
    'win-x64',
    '--self-contained',
    'true',
    '-o',
    outDir,
    '--nologo',
  ];
}

function dotnetInstallArgs(scriptPath, installDir) {
  return [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-Channel',
    '8.0',
    '-InstallDir',
    installDir,
    '-NoPath',
  ];
}

function quoteForDisplay(value) {
  const text = String(value);
  if (!/\s/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function formatCommand(command, args = []) {
  return [command, ...args].map(quoteForDisplay).join(' ');
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return '—';
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[index]}`;
}

function maskSerial(serial) {
  const text = String(serial || '');
  if (text.length <= 4) return text;
  return `${'•'.repeat(Math.min(6, text.length - 4))}${text.slice(-4)}`;
}

function shellQuote(filePath) {
  return `'${String(filePath).replace(/'/g, `'\\''`)}'`;
}

function isSubPath(parent, child) {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  return childResolved === parentResolved || childResolved.startsWith(parentResolved + path.sep);
}

function publishCommandForDisplay(csprojPath, outDir, dotnetPath = 'dotnet') {
  return formatCommand(dotnetPath, dotnetPublishArgs(csprojPath, outDir));
}

module.exports = {
  dotnetPublishArgs,
  dotnetInstallArgs,
  quoteForDisplay,
  formatCommand,
  formatBytes,
  maskSerial,
  shellQuote,
  isSubPath,
  publishCommandForDisplay,
};
