import { $, esc } from './lib/dom.js';
import { KIND_LABEL, STATUS_LABEL, regsForKey, serviceById, state } from './state.js';
import { barcodeSVG, qrSVG, tagNo } from './ui/key-art.js';

export function printTag(key) {
  const url = `${location.origin}/#/keys/${key.id}`;
  $('#print-root').innerHTML = `
    <div class="print-tag">
      <div class="pt-head">
        <span class="pt-hole"></span>
        <span class="pt-brand">KEEYO · EQUIPMENT REGISTER</span>
        <span class="pt-no">${tagNo(key.id)}</span>
      </div>
      <div class="pt-body">
        <div class="pt-info">
          <div class="pt-name">${esc(key.name)}</div>
          <div class="pt-model">${esc([key.vendor, key.model].filter(Boolean).join(' / ') || 'model unknown')}</div>
          ${key.serial ? `<div class="pt-model">SN ${esc(key.serial)}</div>` : ''}
          <div class="pt-barcode">${barcodeSVG(key.id, 110, 22)}</div>
        </div>
        <div class="pt-qr">${qrSVG(url)}</div>
      </div>
      <div class="pt-foot">${esc(url)}</div>
    </div>`;
  window.print();
}

export function printRegister() {
  const rows = [];
  for (const k of state.keys) {
    const regs = regsForKey(k.id);
    if (!regs.length) rows.push({ k, r: null, svc: null });
    for (const r of regs) rows.push({ k, r, svc: serviceById(r.serviceId) });
  }
  $('#print-root').innerHTML = `
    <div class="print-register">
      <h1>KEEYO — EQUIPMENT REGISTER</h1>
      <div class="pr-meta">${state.keys.length} keys · ${state.registrations.length} registrations ·
        printed ${esc(new Date().toLocaleDateString())} · holder: ${esc(state.me.username)}</div>
      <table>
        <thead><tr><th>Tag</th><th>Key</th><th>Model</th><th>Status</th><th>Service</th><th>Type</th><th>Account</th></tr></thead>
        <tbody>
          ${rows.map(({ k, r, svc }) => `
            <tr>
              <td>${tagNo(k.id)}</td>
              <td>${esc(k.name)}</td>
              <td>${esc([k.vendor, k.model].filter(Boolean).join(' '))}</td>
              <td>${esc(STATUS_LABEL[k.status])}</td>
              <td>${r ? esc(svc ? svc.name : '(deleted)') : '—'}</td>
              <td>${r ? esc(KIND_LABEL[r.kind]) + (r.revoked ? ' · revoked' : '') : ''}</td>
              <td>${r ? esc(r.account) : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  window.print();
}

export function exportCSV() {
  const head = ['tag', 'key', 'vendor', 'model', 'serial', 'status', 'service', 'kind', 'account', 'totp_app', 'revoked'];
  const lines = [head];
  for (const k of state.keys) {
    const regs = regsForKey(k.id);
    if (!regs.length) lines.push([tagNo(k.id), k.name, k.vendor, k.model, k.serial, k.status, '', '', '', '', '']);
    for (const r of regs) {
      const svc = serviceById(r.serviceId);
      lines.push([tagNo(k.id), k.name, k.vendor, k.model, k.serial, k.status,
        svc ? svc.name : '', r.kind, r.account, r.totpApp, r.revoked ? 'yes' : 'no']);
    }
  }
  const csv = lines.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `keeyo-register-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
