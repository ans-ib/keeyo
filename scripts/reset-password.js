'use strict';

// Emergency password reset — run on the server (or inside the container):
//   node scripts/reset-password.js <username> <new-password>
//   docker exec -it keeyo node scripts/reset-password.js admin newpass123
//
// Resets the password, signs out all of the user's sessions, and removes
// their sign-in security keys (so a lost second factor can't lock them out).

const [, , username, password] = process.argv;

if (!username || !password || password.length < 8) {
  console.error('Usage: node scripts/reset-password.js <username> <new-password(min 8 chars)>');
  process.exit(1);
}

const { db } = require('../server/db');
const auth = require('../server/auth');

const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username.toLowerCase());
if (!user) {
  console.error(`No user named "${username}"`);
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
const removed = db.prepare('DELETE FROM login_credentials WHERE user_id = ?').run(user.id).changes;

console.log(`Password reset for "${user.username}". All sessions signed out, ${removed} sign-in key(s) removed.`);
