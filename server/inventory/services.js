'use strict';

const { db } = require('../db');
const { ApiError } = require('../lib/errors');
const { str } = require('../lib/validate');

const COLUMNS = 'id, name, url, icon, notes, created_at AS createdAt';

const ICON_DATA_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const ICON_URL_RE = /^https:\/\/(cdn\.jsdelivr\.net\/gh\/(selfhst\/icons|homarr-labs\/dashboard-icons)\/(png|svg|webp)\/[A-Za-z0-9._-]+\.(png|svg|webp)|icons\.duckduckgo\.com\/ip3\/[A-Za-z0-9.-]+\.ico)$/;
const MAX_ICON_DATA = 120000;
const MAX_EMOJI = 8;

function sanitizeIcon(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ApiError(400, 'Invalid icon');
  const icon = value.trim();
  if (!icon || icon === 'favicon') return icon;
  if (icon.startsWith('data:')) {
    if (icon.length > MAX_ICON_DATA) throw new ApiError(400, 'Icon image is too large');
    if (!ICON_DATA_RE.test(icon)) throw new ApiError(400, 'Icon must be a PNG, JPEG, WebP, GIF or SVG image');
    return icon;
  }
  if (/^https?:/i.test(icon)) {
    if (icon.length > 300 || !ICON_URL_RE.test(icon)) throw new ApiError(400, 'Icon must come from selfh.st, Dashboard Icons or DuckDuckGo');
    return icon;
  }
  if (icon.length > MAX_EMOJI) throw new ApiError(400, 'Icon must be an emoji, an upload or a catalog icon');
  return icon;
}

function sanitize(body) {
  return {
    name: str(body.name, { required: true, label: 'Service name', max: 120 }),
    url: str(body.url, { label: 'URL', max: 300 }),
    icon: sanitizeIcon(body.icon),
    notes: str(body.notes, { label: 'notes', max: 2000 }),
  };
}

function get(userId, id) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM services WHERE user_id = ? AND id = ?`).get(userId, id);
  if (!row) throw new ApiError(404, 'Service not found');
  return row;
}

function list(userId) {
  return db.prepare(`SELECT ${COLUMNS} FROM services WHERE user_id = ? ORDER BY LOWER(name)`).all(userId);
}

function nameOf(userId, id) {
  const row = db.prepare('SELECT name FROM services WHERE user_id = ? AND id = ?').get(userId, id);
  return row ? row.name : '(deleted service)';
}

function findByName(userId, name) {
  return db.prepare('SELECT id FROM services WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name) || null;
}

function insert(userId, s) {
  const info = db.prepare('INSERT INTO services (user_id, name, url, icon, notes) VALUES (?, ?, ?, ?, ?)')
    .run(userId, s.name, s.url, s.icon, s.notes);
  return Number(info.lastInsertRowid);
}

function create(userId, body) {
  const s = sanitize(body);
  if (findByName(userId, s.name)) throw new ApiError(400, `A service named "${s.name}" already exists`);
  return get(userId, insert(userId, s));
}

function findOrCreate(userId, body) {
  const s = sanitize(body);
  const existing = findByName(userId, s.name);
  return existing ? existing.id : insert(userId, s);
}

function update(userId, id, body) {
  get(userId, id);
  const s = sanitize(body);
  db.prepare('UPDATE services SET name = ?, url = ?, icon = ?, notes = ? WHERE user_id = ? AND id = ?')
    .run(s.name, s.url, s.icon, s.notes, userId, id);
  return get(userId, id);
}

function remove(userId, id) {
  get(userId, id);
  db.prepare('DELETE FROM services WHERE user_id = ? AND id = ?').run(userId, id);
}

module.exports = { COLUMNS, sanitize, get, list, nameOf, insert, create, findOrCreate, update, remove };
