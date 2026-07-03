/* SECOND HAND — seeded randomness + tiny value noise */
(function () {
  'use strict';
  const SH = (window.SH = window.SH || {});

  SH.hashStr = function (s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  };

  SH.mulberry32 = function (a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  SH.pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  SH.ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  SH.rf = (r, a, b) => a + r() * (b - a);
  SH.shuffle = (r, arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // permutation table for boil / drift noise
  const P = new Uint8Array(512);
  (function () {
    const r = SH.mulberry32(1337);
    for (let i = 0; i < 256; i++) P[i] = Math.floor(r() * 256);
    for (let i = 0; i < 256; i++) P[256 + i] = P[i];
  })();
  function fade(t) { return t * t * (3 - 2 * t); }

  SH.noise1 = function (x) {
    const xi = Math.floor(x) & 255, xf = x - Math.floor(x);
    const a = P[xi] / 255, b = P[xi + 1] / 255;
    return a + fade(xf) * (b - a); // 0..1
  };

  SH.noise2 = function (x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const h = (i, j) => P[(P[(xi + i) & 255] + yi + j) & 255] / 255;
    const u = fade(xf), v = fade(yf);
    return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) +
           (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
  };

  SH.seedToId = function (seed) {
    const s = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return s.slice(0, 4) + '-' + s.slice(4);
  };

  SH.idToSeed = function (id) {
    const s = String(id).replace(/[^0-9a-fA-F]/g, '');
    if (!s.length) return null;
    return parseInt(s.slice(0, 8), 16) >>> 0;
  };
})();
