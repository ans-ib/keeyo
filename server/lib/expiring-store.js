'use strict';

class ExpiringStore {
  constructor({ ttlMs, maxEntries = 1000 }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.entries.size >= this.maxEntries) this.sweep();
    this.entries.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  }

  peek(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  take(key) {
    const value = this.peek(key);
    this.entries.delete(key);
    return value;
  }

  delete(key) {
    this.entries.delete(key);
  }

  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expires < now) this.entries.delete(key);
  }
}

module.exports = { ExpiringStore };
