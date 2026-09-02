'use strict';

const COLUMNS = [
  ['keys', 'image', "image TEXT NOT NULL DEFAULT ''"],
  ['keys', 'credential_id', "credential_id TEXT NOT NULL DEFAULT ''"],
  ['keys', 'public_key', "public_key TEXT NOT NULL DEFAULT ''"],
  ['keys', 'credential_alg', 'credential_alg INTEGER NOT NULL DEFAULT -7'],
  ['keys', 'secret', "secret TEXT NOT NULL DEFAULT ''"],
  ['registrations', 'revoked', 'revoked INTEGER NOT NULL DEFAULT 0'],
  ['keys', 'verified_at', "verified_at TEXT NOT NULL DEFAULT ''"],
  ['keys', 'prf_enabled', 'prf_enabled INTEGER NOT NULL DEFAULT 0'],
  ['users', 'totp_secret', "totp_secret TEXT NOT NULL DEFAULT ''"],
  ['users', 'totp_counter', 'totp_counter INTEGER NOT NULL DEFAULT 0'],
  ['sessions', 'via', "via TEXT NOT NULL DEFAULT 'password'"],
  ['users', 'email', "email TEXT NOT NULL DEFAULT ''"],
];

function ensureColumn(db, table, column, ddl) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existing.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function migrate(db) {
  for (const [table, column, ddl] of COLUMNS) ensureColumn(db, table, column, ddl);
}

module.exports = { migrate };
