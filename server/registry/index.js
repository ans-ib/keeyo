'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const sources = require('./sources');

const CACHE_FILE = path.join(config.dataDir, 'registry-cache.json');
const { offline, refreshDays } = config.registry;
const CHECK_INTERVAL_MS = 6 * 3600 * 1000;

let registry = { fetchedAt: null, entries: {}, sources: [] };
let refreshing = null;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (raw && raw.entries) registry = raw;
  } catch {
    registry = { fetchedAt: null, entries: {}, sources: [] };
  }
}

function isStale() {
  if (!registry.fetchedAt) return true;
  return Date.now() - new Date(registry.fetchedAt).getTime() > refreshDays * 86400000;
}

async function fetchAll() {
  const entries = {};
  const loaded = [];
  try {
    Object.assign(entries, await sources.fetchCommunity());
    loaded.push('community');
  } catch (err) {
    console.warn('Registry: community fetch failed:', err.message);
  }
  try {
    const mds = await sources.fetchMds();
    for (const [id, entry] of Object.entries(mds)) {
      entries[id] = { name: entry.name, icon: entry.icon || (entries[id] && entries[id].icon) || '' };
    }
    loaded.push('fido-mds');
  } catch (err) {
    console.warn('Registry: FIDO MDS fetch failed:', err.message);
  }
  if (loaded.length === 0) throw new Error('Could not reach any registry source — check the server\'s internet access');
  return { fetchedAt: new Date().toISOString(), entries, sources: loaded };
}

function refresh() {
  if (offline) return Promise.reject(new Error('Registry updates are disabled (KEEYO_OFFLINE is set)'));
  if (refreshing) return refreshing;
  refreshing = fetchAll()
    .then((fresh) => {
      registry = fresh;
      try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(registry));
      } catch (err) {
        console.warn('Registry: could not write cache file:', err.message);
      }
      console.log(`Registry: ${Object.keys(registry.entries).length} devices loaded from ${registry.sources.join(' + ')}`);
      return status();
    })
    .finally(() => { refreshing = null; });
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
    offline,
    refreshing: !!refreshing,
  };
}

function init() {
  load();
  if (!offline && isStale()) refresh().catch((err) => console.warn('Registry:', err.message));
  const timer = setInterval(() => {
    if (!offline && isStale()) refresh().catch(() => {});
  }, CHECK_INTERVAL_MS);
  timer.unref();
}

module.exports = { init, refresh, lookup, status };
