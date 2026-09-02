'use strict';

const config = require('../config');
const { AAGUID_RE } = require('../lib/validate');

const ICON_RE = /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function cleanIcon(icon) {
  return typeof icon === 'string' && ICON_RE.test(icon) ? icon : '';
}

async function fetchCommunity() {
  const res = await fetch(config.registry.communityUrl, { redirect: 'follow' });
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
  const res = await fetch(config.registry.mdsUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`FIDO MDS returned HTTP ${res.status}`);
  const jwt = (await res.text()).trim();
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('unexpected FIDO MDS format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const out = {};
  for (const entry of payload.entries || []) {
    const statement = entry.metadataStatement;
    if (!entry.aaguid || !statement || !statement.description) continue;
    const aaguid = String(entry.aaguid).toLowerCase();
    if (!AAGUID_RE.test(aaguid)) continue;
    out[aaguid] = { name: String(statement.description).trim(), icon: cleanIcon(statement.icon) };
  }
  return out;
}

module.exports = { fetchCommunity, fetchMds };
