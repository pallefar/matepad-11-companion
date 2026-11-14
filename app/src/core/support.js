'use strict';

const MAX_SUPPORT_URL = 500;

function normalizeSupportUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length > MAX_SUPPORT_URL) throw new Error('Support URL is too long.');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Enter a valid http:// or https:// URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Support URL must use http:// or https://.');
  if (url.username || url.password) throw new Error('Support URL must not contain credentials.');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Plain http is only allowed for localhost; use https for a remote support link.');
  }
  return url.toString();
}

module.exports = { normalizeSupportUrl, MAX_SUPPORT_URL };
