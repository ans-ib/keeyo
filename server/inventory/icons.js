'use strict';

const config = require('../config');
const { ApiError } = require('../lib/errors');

const CACHE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const MAX_RESULTS = 48;

const SOURCES = {
  selfhst: {
    index: 'https://cdn.jsdelivr.net/gh/selfhst/icons/index.json',
    parse: (json) => json
      .filter((entry) => entry && entry.Reference && entry.PNG === 'Yes')
      .map((entry) => ({ name: String(entry.Name), slug: String(entry.Reference) })),
    url: (slug) => `https://cdn.jsdelivr.net/gh/selfhst/icons/png/${slug}.png`,
  },
  dashboard: {
    index: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/tree.json',
    parse: (json) => (json.png || [])
      .map((file) => String(file).replace(/\.png$/i, ''))
      .map((slug) => ({ name: slug.replace(/-/g, ' '), slug })),
    url: (slug) => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${slug}.png`,
  },
};

const cache = new Map();

async function loadIndex(source) {
  const cached = cache.get(source);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.entries;
  if (config.registry.offline) throw new ApiError(503, 'Icon search is disabled while KEEYO_OFFLINE is set');
  const def = SOURCES[source];
  const res = await fetch(def.index, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new ApiError(502, `Icon catalog returned HTTP ${res.status}`);
  const entries = def.parse(await res.json());
  cache.set(source, { fetchedAt: Date.now(), entries });
  return entries;
}

function score(entry, q) {
  const slug = entry.slug.toLowerCase();
  const name = entry.name.toLowerCase();
  if (slug === q || name === q) return 0;
  if (slug.startsWith(q) || name.startsWith(q)) return 1;
  if (slug.includes(q) || name.includes(q)) return 2;
  return -1;
}

async function search(source, query) {
  if (!SOURCES[source]) throw new ApiError(400, 'Unknown icon source');
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const entries = await loadIndex(source);
  return entries
    .map((entry) => ({ entry, rank: score(entry, q) }))
    .filter((hit) => hit.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.entry.slug.length - b.entry.slug.length)
    .slice(0, MAX_RESULTS)
    .map(({ entry }) => ({ name: entry.name, slug: entry.slug, url: SOURCES[source].url(entry.slug) }));
}

module.exports = { SOURCES: Object.keys(SOURCES), search };
