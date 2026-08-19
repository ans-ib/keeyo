'use strict';

// Live AAGUID registry for "Detect my key".
//
// Sources, merged (later wins):
//   1. Community passkey registry (passkeydeveloper/passkey-authenticator-aaguids)
//   2. FIDO Alliance Metadata Service (MDS) — the official registry vendors
//      publish their certified authenticators to.
//
// The MDS blob is a JWT; we decode its payload without verifying the signature
// because the data is only used to *name* keys in the UI, never for security
// decisions. The merged map is cached on disk and refreshed automatically, so
// newly released devices are recognized without updating Keeyo.

const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./db');

const CACHE_FILE = path.join(DATA_DIR, 'registry-cache.json');
const MDS_URL = process.env.MDS_URL || 'https://mds3.fidoalliance.org/';
const COMMUNITY_URL = process.env.AAGUID_COMMUNITY_URL
  || 'https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/main/combined_aaguid.json';
const REFRESH_DAYS = Number(process.env.REGISTRY_REFRESH_DAYS || 7);
const OFFLINE = process.env.KEEYO_OFFLINE === '1' || process.env.KEEYO_OFFLINE === 'true';

let registry = { fetchedAt: null, entries: {}, sources: [] };
let refreshing = null;

const AAGUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Only strict base64 image data URIs are passed to the browser.
const ICON_RE = /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function cleanIcon(icon) {
  return typeof icon === 'string' && ICON_RE.test(icon) ? icon : '';
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (raw && raw.entries) registry = raw;
  } catch { /* no cache yet */ }
}

function isStale() {
  if (!registry.fetchedAt) return true;
  return Date.now() - new Date(registry.fetchedAt).getTime() > REFRESH_DAYS * 86400000;
}

async function fetchCommunity() {
  const res = await fetch(COMMUNITY_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`community registry returned HTTP ${res.status}`);
  const json = await res.json();
  const out = {};
  for (const [id, entry] of Object.entries(json)) {
    const aaguid = String(id).toLowerCase();
    if (!AAGUID_RE.test(aaguid) || !entry || !entry.name) continue;
    out[aaguid] = { name: String(entry.name).trim(), icon: cleanIcon(entry.icon_light) };
  }
  return out;
}

async function fetchMds() {
  const res = await fetch(MDS_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`FIDO MDS returned HTTP ${res.status}`);
  const jwt = (await res.text()).trim();
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('unexpected FIDO MDS format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const out = {};
  for (const entry of payload.entries || []) {
    const ms = entry.metadataStatement;
    if (!entry.aaguid || !ms || !ms.description) continue;
    const aaguid = String(entry.aaguid).toLowerCase();
    if (!AAGUID_RE.test(aaguid)) continue;
    out[aaguid] = { name: String(ms.description).trim(), icon: cleanIcon(ms.icon) };
  }
  return out;
}

async function refresh() {
  if (OFFLINE) throw new Error('Registry updates are disabled (KEEYO_OFFLINE is set)');
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const entries = {};
    const sources = [];
    try {
      Object.assign(entries, await fetchCommunity());
      sources.push('community');
    } catch (err) {
      console.warn('Registry: community fetch failed:', err.message);
    }
    try {
      const mds = await fetchMds();
      for (const [id, e] of Object.entries(mds)) {
        entries[id] = { name: e.name, icon: e.icon || (entries[id] && entries[id].icon) || '' };
      }
      sources.push('fido-mds');
    } catch (err) {
      console.warn('Registry: FIDO MDS fetch failed:', err.message);
    }
    if (sources.length === 0) throw new Error('Could not reach any registry source — check the server\'s internet access');
    registry = { fetchedAt: new Date().toISOString(), entries, sources };
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(registry));
    } catch (err) {
      console.warn('Registry: could not write cache file:', err.message);
    }
    console.log(`Registry: ${Object.keys(entries).length} devices loaded from ${sources.join(' + ')}`);
    return status();
  })().finally(() => { refreshing = null; });
  return refreshing;
}

function lookup(aaguid) {
  return registry.entries[String(aaguid).toLowerCase()] || null;
}

function status() {
  return {
    count: Object.keys(registry.entries).length,
    fetchedAt: registry.fetchedAt,
    sources: registry.sources,
    stale: isStale(),
    offline: OFFLINE,
    refreshing: !!refreshing,
  };
}

function init() {
  load();
  if (!OFFLINE && isStale()) refresh().catch((err) => console.warn('Registry:', err.message));
  const timer = setInterval(() => {
    if (!OFFLINE && isStale()) refresh().catch(() => {});
  }, 6 * 3600 * 1000);
  timer.unref();
}

module.exports = { init, refresh, lookup, status };
