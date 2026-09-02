import { domainOf, esc, hashHue } from '../lib/dom.js';

export function serviceIconHTML(svc, cls = '') {
  const name = svc.name || '?';
  const icon = svc.icon || '';
  const initial = name.trim().charAt(0) || '?';
  const hue = hashHue(initial.toLowerCase());
  const letter = esc(initial.toUpperCase());
  const letterStyle = `background:hsl(${hue} 48% 72%);color:rgba(20,18,10,0.8)`;

  if (icon.startsWith('data:') || icon.startsWith('https://')) {
    return `<span class="svc-icon img ${cls}"><img src="${esc(icon)}" alt="" loading="lazy"></span>`;
  }
  if (icon === 'favicon' && svc.url) {
    const domain = domainOf(svc.url);
    if (domain) {
      return `<span class="svc-icon ${cls}" style="${letterStyle}">${letter}<img class="fav" alt=""
        src="https://icons.duckduckgo.com/ip3/${esc(domain)}.ico" loading="lazy"></span>`;
    }
  }
  if (icon && icon !== 'favicon') {
    return `<span class="svc-icon emoji ${cls}">${esc(icon)}</span>`;
  }
  return `<span class="svc-icon ${cls}" style="${letterStyle}">${letter}</span>`;
}
