'use strict';

const path = require('node:path');
const fs = require('node:fs');
const packager = require('@electron/packager');

const appDir = path.resolve(__dirname, '..');
const outRoot = path.resolve(appDir, '..', 'dist');
const platform = process.argv[2] || 'win32';
const arch = process.argv[3] || 'x64';
const excludeTop = new Set([
  'test',
  'scripts',
  'screens',
  'build',
  'docs',
  'ref',
  '_packtest',
  '.demo-profile',
  '.git',
  'dist',
]);

function ignore(filePath) {
  // electron-packager passes a path relative to the app dir, but with a leading
  // slash (e.g. "/screens/e2e/01.png"), so path.relative() would escape.
  const rel = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return false;
  const top = rel.split('/')[0];
  if (excludeTop.has(top)) return true;
  if (rel === 'package-lock.json') return true;
  if (rel.endsWith('.DS_Store')) return true;
  return false;
}

(async () => {
  const out = platform === 'darwin' ? path.join('/tmp', 'mp-macpkg') : outRoot;
  if (platform === 'darwin') fs.rmSync(out, { recursive: true, force: true });
  const paths = await packager({
    dir: appDir,
    name: 'MatePad 11 Companion',
    platform,
    arch,
    electronVersion: '33.4.11',
    out,
    overwrite: true,
    prune: true,
    asar: true,
    ...(platform === 'win32' ? { icon: path.join(appDir, 'build', 'icon.ico') } : {}),
    appCopyright: 'Copyright 2026 MatePad 11 Companion contributors. MIT licensed.',
    ignore,
    quiet: false,
  });
  console.log('PACKAGED', paths.join('\n'));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
