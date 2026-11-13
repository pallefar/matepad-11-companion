'use strict';

const REPO = 'pallefar/matepad-11-companion';
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASE_PREFIX = `https://github.com/${REPO}/releases/download/`;

function parseVersion(value) {
  const text = String(value || '').trim().replace(/^v/i, '');
  const [core, ...pre] = text.split('-');
  const parts = core.split('.').map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return { parts: parts.slice(0, 3), pre: pre.join('-') || null };
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] > right.parts[index]) return 1;
    if (left.parts[index] < right.parts[index]) return -1;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre.localeCompare(right.pre);
}

function isNewer(latest, current) {
  return compareVersions(latest, current) > 0;
}

function isTrustedReleaseUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(`/${REPO}/releases/`);
  } catch {
    return false;
  }
}

function isTrustedAssetUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(`/${REPO}/releases/download/`);
  } catch {
    return false;
  }
}

function pickReleaseAssets(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const zip = assets.find((asset) => /^MatePad-11-Companion-[\d.]+-win-x64\.zip$/i.test(asset.name || ''));
  const sha = assets.find((asset) => /^MatePad-11-Companion-[\d.]+-win-x64\.zip\.sha256$/i.test(asset.name || ''));
  if (!zip) return { zip: null, sha: sha || null, error: 'No Windows app ZIP asset named MatePad-11-Companion-<version>-win-x64.zip.' };
  if (!isTrustedAssetUrl(zip.browser_download_url) || (sha && !isTrustedAssetUrl(sha.browser_download_url))) {
    return { zip: null, sha: null, error: 'Release asset URL is not under github.com/pallefar/matepad-11-companion.' };
  }
  return { zip, sha: sha || null, error: null };
}

function releaseInfo(release, currentVersion, platform = process.platform, packaged = false) {
  if (!release || release.draft || release.prerelease) throw new Error('Latest release is not a published release.');
  const latest = String(release.tag_name || '').replace(/^v/i, '');
  if (!latest) throw new Error('Release has no tag.');
  const selected = pickReleaseAssets(release);
  return {
    current: String(currentVersion || '0.0.0'),
    latest,
    available: isNewer(latest, currentVersion),
    releaseUrl: isTrustedReleaseUrl(release.html_url) ? release.html_url : `https://github.com/${REPO}/releases`,
    notes: String(release.body || '').slice(0, 6000),
    publishedAt: release.published_at || null,
    asset: selected.zip
      ? {
          name: selected.zip.name,
          url: selected.zip.browser_download_url,
          size: selected.zip.size,
          digest: selected.zip.digest || null,
        }
      : null,
    shaAsset: selected.sha
      ? { name: selected.sha.name, url: selected.sha.browser_download_url, size: selected.sha.size }
      : null,
    assetError: selected.error,
    installSupported: platform === 'win32' && Boolean(packaged),
    repo: REPO,
  };
}

module.exports = {
  REPO,
  RELEASE_API,
  RELEASE_PREFIX,
  parseVersion,
  compareVersions,
  isNewer,
  isTrustedReleaseUrl,
  isTrustedAssetUrl,
  pickReleaseAssets,
  releaseInfo,
};
