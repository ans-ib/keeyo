// Applied before first paint to avoid a theme flash. External file (not inline)
// so the strict Content-Security-Policy can stay free of 'unsafe-inline' scripts.
(function () {
  'use strict';
  try {
    var t = localStorage.getItem('keeyo-theme');
    // legacy values from the light/dark era
    if (t === 'light') t = 'register';
    if (t === 'dark') t = 'night';
    if (t === 'night' || t === 'blueprint' || t === 'phosphor' || t === 'mist') {
      document.documentElement.dataset.theme = t;
    }
    var s = localStorage.getItem('keeyo-skin');
    if (s === 'soft') document.documentElement.dataset.skin = 'soft';
  } catch (e) { /* storage unavailable — default appearance */ }
})();
