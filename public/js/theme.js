export const THEMES = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'system', name: 'System' },
];

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function currentTheme() {
  let stored = null;
  try { stored = localStorage.getItem('keeyo-theme'); } catch {}
  return THEMES.some((t) => t.id === stored) ? stored : 'system';
}

function paint(id) {
  const dark = id === 'dark' || (id === 'system' && media.matches);
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

export function applyTheme(id) {
  document.documentElement.classList.add('theme-anim');
  setTimeout(() => document.documentElement.classList.remove('theme-anim'), 400);
  try { localStorage.setItem('keeyo-theme', id); } catch {}
  paint(id);
}

media.addEventListener('change', () => {
  if (currentTheme() === 'system') paint('system');
});
