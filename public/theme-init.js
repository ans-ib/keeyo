// Applied before first paint to avoid a theme flash. External file (not inline)
// so the strict Content-Security-Policy can stay free of 'unsafe-inline' scripts.
(function () {
  'use strict';
  try {
    var t = localStorage.getItem('keeyo-theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) { /* storage unavailable — default theme */ }
})();
