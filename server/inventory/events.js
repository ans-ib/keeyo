'use strict';

const { db } = require('../db');

const KEEP_PER_KEY = 200;
const MAX_DETAIL = 300;

function log(userId, keyId, kind, detail = '') {
  db.prepare('INSERT INTO events (user_id, key_id, kind, detail) VALUES (?, ?, ?, ?)')
    .run(userId, keyId, kind, String(detail).slice(0, MAX_DETAIL));
  db.prepare('DELETE FROM events WHERE key_id = ? AND id NOT IN (SELECT id FROM events WHERE key_id = ? ORDER BY id DESC LIMIT ?)')
    .run(keyId, keyId, KEEP_PER_KEY);
}

function listForKey(keyId) {
  return db.prepare('SELECT id, kind, detail, created_at AS createdAt FROM events WHERE key_id = ? ORDER BY id DESC LIMIT ?')
    .all(keyId, KEEP_PER_KEY);
}

module.exports = { log, listForKey };
