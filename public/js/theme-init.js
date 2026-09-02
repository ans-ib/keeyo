(function () {
  'use strict';
  try {
    var stored = localStorage.getItem('keeyo-theme');
    if (stored === 'night' || stored === 'blueprint' || stored === 'phosphor') stored = 'dark';
    if (stored === 'register' || stored === 'mist') stored = 'light';
    if (stored !== 'light' && stored !== 'dark') stored = 'system';
    var dark = stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.dataset.theme = 'dark';
    localStorage.removeItem('keeyo-skin');
  } catch (e) {}
})();
