'use strict';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function allowed(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) return true;
  return entry.count < MAX_ATTEMPTS;
}

function recordFailure(ip) {
  if (attempts.size > 5000) {
    for (const [key, entry] of attempts) if (entry.resetAt < Date.now()) attempts.delete(key);
  }
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clear(ip) {
  attempts.delete(ip);
}

module.exports = { allowed, recordFailure, clear };
