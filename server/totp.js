'use strict';

// Minimal RFC 6238 TOTP (HMAC-SHA1, 30-second steps, 6 digits) on node:crypto,
// zero dependencies. This backs Keeyo's own sign-in second factor only — the
// per-service TOTP entries users track in their inventory are names, never
// seeds, and never touch this module.

const crypto = require('node:crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // accept the previous/next step to absorb clock drift

function b32encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(str).toUpperCase().replace(/[\s=-]/g, '')) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return b32encode(crypto.randomBytes(20));
}

function hotp(secretBuf, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

// Returns the matching time-step counter, or null if the code is wrong.
// Callers must persist the returned counter and pass it back as lastCounter —
// counters at or below it are refused, which makes every code single-use
// (RFC 6238 section 5.2).
function verifyCode(secretB32, code, lastCounter = 0) {
  const cleaned = String(code == null ? '' : code).replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(cleaned)) return null;
  let secret;
  try {
    secret = b32decode(secretB32);
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let offset = -WINDOW; offset <= WINDOW; offset++) {
    const counter = now + offset;
    if (counter <= lastCounter) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, counter)), Buffer.from(cleaned))) return counter;
  }
  return null;
}

function otpauthURL(username, secretB32) {
  return `otpauth://totp/Keeyo:${encodeURIComponent(username)}?secret=${secretB32}&issuer=Keeyo&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

module.exports = { generateSecret, verifyCode, otpauthURL };
