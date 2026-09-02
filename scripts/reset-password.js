'use strict';

const [, , username, password] = process.argv;

if (!username || !password || password.length < 8) {
  console.error('Usage: node scripts/reset-password.js <username> <new-password(min 8 chars)>');
  process.exit(1);
}

const { db } = require('../server/db');
const { hashPassword } = require('../server/lib/password');

const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username.toLowerCase());
if (!user) {
  console.error(`No user named "${username}"`);
  process.exit(1);
}

db.prepare("UPDATE users SET password_hash = ?, totp_secret = '', totp_counter = 0 WHERE id = ?").run(hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
const removed = db.prepare('DELETE FROM login_credentials WHERE user_id = ?').run(user.id).changes;
const tokens = db.prepare('DELETE FROM access_tokens WHERE user_id = ?').run(user.id).changes;

console.log(`Password reset for "${user.username}". All sessions signed out, ${removed} sign-in key(s) removed, authenticator app and recovery codes cleared, ${tokens} access token(s) revoked.`);
