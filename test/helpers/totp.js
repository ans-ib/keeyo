'use strict';

const crypto = require('node:crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function totpCode(secretB32, offsetSteps = 0) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secretB32) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps));
  const mac = crypto.createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const off = mac[19] & 0x0f;
  const code = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(code % 1e6).padStart(6, '0');
}

module.exports = { totpCode };
