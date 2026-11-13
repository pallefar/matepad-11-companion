'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareVersions,
  isNewer,
  pickReleaseAssets,
  releaseInfo,
  isTrustedReleaseUrl,
} = require('../src/core/update');

const release = {
  tag_name: 'v1.5.1',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/pallefar/matepad-11-companion/releases/tag/v1.5.1',
  published_at: '2026-11-14T00:00:00Z',
  body: 'Fixes',
  assets: [
    {
      name: 'MatePad-11-Companion-1.5.1-win-x64.zip',
      browser_download_url: 'https://github.com/pallefar/matepad-11-companion/releases/download/v1.5.1/MatePad-11-Companion-1.5.1-win-x64.zip',
      size: 100,
      digest: 'sha256:abc',
    },
    {
      name: 'MatePad-11-Companion-1.5.1-win-x64.zip.sha256',
      browser_download_url: 'https://github.com/pallefar/matepad-11-companion/releases/download/v1.5.1/MatePad-11-Companion-1.5.1-win-x64.zip.sha256',
      size: 100,
    },
  ],
};

test('compares numeric versions correctly', () => {
  assert.equal(compareVersions('1.5.1', '1.5.0'), 1);
  assert.equal(compareVersions('v1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.5.0', 'v1.5.0'), 0);
  assert.equal(isNewer('1.5.1', '1.5.0'), true);
  assert.equal(isNewer('1.5.0', '1.5.0'), false);
});

test('selects the Windows ZIP and SHA-256 assets', () => {
  assert.equal(isTrustedReleaseUrl(release.html_url), true);
  assert.equal(isTrustedReleaseUrl('https://evil.example/x'), false);
  const selected = pickReleaseAssets(release);
  assert.equal(selected.error, null);
  assert.equal(selected.zip.name, 'MatePad-11-Companion-1.5.1-win-x64.zip');
  assert.equal(selected.sha.name, 'MatePad-11-Companion-1.5.1-win-x64.zip.sha256');
});

test('builds release info and marks Windows install support', () => {
  const info = releaseInfo(release, '1.5.0', 'win32', true);
  assert.equal(info.latest, '1.5.1');
  assert.equal(info.available, true);
  assert.equal(info.installSupported, true);
  assert.equal(info.asset.digest, 'sha256:abc');
  const mac = releaseInfo(release, '1.5.0', 'darwin', false);
  assert.equal(mac.installSupported, false);
});

test('rejects a release without a trusted Windows ZIP', () => {
  const bad = { ...release, assets: [{ name: 'other.zip', browser_download_url: 'https://example.com/other.zip' }] };
  const selected = pickReleaseAssets(bad);
  assert.equal(selected.zip, null);
  assert.match(selected.error, /No Windows app ZIP/);
});
