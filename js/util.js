/* Shared helpers and namespace */
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  G.smooth = (t) => { t = G.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  G.wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  G.dampAngle = (a, b, k, dt) => a + G.wrapAngle(b - a) * (1 - Math.exp(-k * dt));

  // deterministic RNG (mulberry32)
  G.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  G.rand = Math.random; // gameplay randomness (non deterministic)
  G.randRange = (a, b) => a + Math.random() * (b - a);
  G.pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // Make THREE colour handling behave like modern three (sRGB hex -> linear)
  if (window.THREE && THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  G.errors = [];
  window.addEventListener('error', (e) => {
    G.errors.push((e.message || 'error') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno);
  });

  G.$ = (id) => document.getElementById(id);
})();
