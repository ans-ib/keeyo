import { state } from '../state.js';

export async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body ? 'POST' : 'GET') };
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.body);
  }
  if (opts.keepalive) init.keepalive = true;
  const res = await fetch('/api' + path, init);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && state.me) {
      state.me = null;
      document.dispatchEvent(new Event('keeyo:signed-out'));
    }
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}
