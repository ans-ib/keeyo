import { catalogModel } from '../catalog.js';

export function keyArt(key, size = 100) {
  const color = key.color || 'var(--accent)';
  const model = catalogModel(key);
  const nfc = !!(model && model.nfc);
  const ink = 'var(--text)';
  const body = 'var(--panel)';
  const metal = 'var(--panel-2)';
  const gold = 'var(--gold)';
  const ff = key.formFactor || 'usb-a';

  const nfcArcs = nfc
    ? `<g stroke="${color}" stroke-width="2.2" fill="none" opacity="0.9" stroke-linecap="round">
         <path d="M50 14 a9 9 0 0 1 7 9"/><path d="M50 6 a17 17 0 0 1 14 17"/></g>`
    : '';

  let inner = '';
  let vb = '0 0 64 132';
  let w = Math.round(size * (64 / 132));
  let h = size;

  if (ff === 'usb-a' || ff === 'usb-c') {
    const connector = ff === 'usb-a'
      ? `<rect x="20" y="102" width="24" height="27" fill="${metal}" stroke="${ink}" stroke-width="2"/>
         <rect x="25" y="109" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>
         <rect x="34" y="109" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>`
      : `<rect x="23" y="102" width="18" height="26" rx="8" fill="${metal}" stroke="${ink}" stroke-width="2"/>
         <rect x="27" y="109" width="10" height="4" rx="2" fill="none" stroke="${ink}" stroke-width="1.3"/>`;
    inner = `
      <rect x="12" y="2" width="40" height="102" rx="8" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <line x1="32" y1="8" x2="32" y2="98" stroke="${ink}" stroke-width="1" stroke-dasharray="3 5" opacity="0.28"/>
      <circle cx="32" cy="18" r="7" fill="var(--bg)" stroke="${color}" stroke-width="3"/>
      <circle cx="32" cy="60" r="12" fill="none" stroke="${gold}" stroke-width="2.6"/>
      <circle cx="32" cy="60" r="4" fill="${gold}"/>
      ${connector}${nfcArcs}`;
  } else if (ff === 'nano-a' || ff === 'nano-c') {
    const connector = ff === 'nano-a'
      ? `<rect x="20" y="52" width="24" height="32" fill="${metal}" stroke="${ink}" stroke-width="2"/>
         <rect x="25" y="59" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>
         <rect x="34" y="59" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>`
      : `<rect x="23" y="52" width="18" height="32" rx="8" fill="${metal}" stroke="${ink}" stroke-width="2"/>`;
    inner = `
      ${connector}
      <rect x="15" y="84" width="34" height="24" rx="5" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <circle cx="32" cy="96" r="6.5" fill="none" stroke="${gold}" stroke-width="2.4"/>
      <circle cx="32" cy="96" r="2" fill="${gold}"/>
      <circle cx="32" cy="96" r="10.5" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.7"/>`;
  } else if (ff === 'dual') {
    inner = `
      <rect x="23" y="2" width="18" height="22" rx="8" fill="${metal}" stroke="${ink}" stroke-width="2"/>
      <rect x="12" y="22" width="40" height="86" rx="8" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <line x1="32" y1="28" x2="32" y2="102" stroke="${ink}" stroke-width="1" stroke-dasharray="3 5" opacity="0.28"/>
      <circle cx="32" cy="52" r="12" fill="none" stroke="${gold}" stroke-width="2.6"/>
      <circle cx="32" cy="52" r="4" fill="${gold}"/>
      <circle cx="32" cy="88" r="7" fill="var(--bg)" stroke="${color}" stroke-width="3"/>
      <rect x="25" y="108" width="14" height="22" rx="5" fill="${metal}" stroke="${ink}" stroke-width="2"/>
      ${nfcArcs}`;
  } else if (ff === 'card') {
    vb = '0 0 132 84';
    w = size;
    h = Math.round(size * (84 / 132));
    inner = `
      <rect x="2" y="2" width="128" height="80" rx="6" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <rect x="14" y="16" width="24" height="18" fill="${gold}" stroke="${ink}" stroke-width="1.5"/>
      <rect x="14" y="52" width="62" height="16" fill="var(--bg)" stroke="${ink}" stroke-width="1.5"/>
      <circle cx="110" cy="26" r="9" fill="none" stroke="${color}" stroke-width="2.6"/>`;
  } else {
    inner = `
      <circle cx="32" cy="30" r="17" fill="${body}" stroke="${color}" stroke-width="4"/>
      <circle cx="32" cy="30" r="7" fill="var(--bg)" stroke="${ink}" stroke-width="2"/>
      <path d="M32 47v72m0-20h15m-15-18h15" stroke="${ink}" stroke-width="6" stroke-linecap="square" fill="none"/>`;
  }

  return `<svg viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
}

export function barcodeSVG(id, width = 72, height = 16) {
  let seed = (id * 2654435761) >>> 0;
  const bars = [];
  let x = 0;
  while (x < width - 3) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bw = 1 + (seed % 3);
    if ((seed >> 4) % 3 !== 0) bars.push(`<rect x="${x}" y="0" width="${bw}" height="${height}" fill="currentColor"/>`);
    x += bw + 1;
  }
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${bars.join('')}</svg>`;
}

export const tagNo = (id) => `KY-${String(id).padStart(3, '0')}`;

export function qrSVG(text) {
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 0 });
  } catch {
    return '';
  }
}

export function keyVisual(key, size) {
  if (key.image) return `<img class="key-photo" src="${key.image}" alt="" style="max-height:${size}px;max-width:${size}px">`;
  return keyArt(key, size);
}
