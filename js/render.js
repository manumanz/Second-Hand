/* SECOND HAND — rendering: a hand-drawn world seen by candlelight through fabric.
   No sprites. Procedural weave, one swinging shaft of light, boiling outlines,
   rim-lit silhouettes, lint, grain. */
(function () {
  'use strict';
  const SH = window.SH;
  const { W, H } = { W: 900, H: 1150 };

  const R = SH.Render = {};
  let cv, ctx, weaveCv, grainCv, grainPat = null, vgGrad = null;
  let lint = [], sparkles = [];
  let T = 0;

  const WARM = [232, 180, 107], BLUE = [122, 142, 196];

  R.init = function (canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
    R.resize();
    window.addEventListener('resize', R.resize);
    makeGrain();
  };

  R.resize = function () {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / W, vh / H) * 0.98;
    const dpr = 1; // fixed backing store; the aesthetic is soft and grainy anyway
    cv.width = vw * dpr; cv.height = vh * dpr;
    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
    SH.view = { s: s * dpr, ox: (vw * dpr - W * s * dpr) / 2, oy: (vh * dpr - H * s * dpr) / 2, dpr };
    vgGrad = null;
  };

  R.toWorld = function (cx, cy) {
    const v = SH.view;
    return { x: (cx * v.dpr - v.ox) / v.s, y: (cy * v.dpr - v.oy) / v.s };
  };

  /* ---------------- textures, per stranger ---------------- */
  R.makeTextures = function (g) {
    const r = SH.mulberry32(g.seed ^ 0x9e3779b9);
    weaveCv = document.createElement('canvas');
    weaveCv.width = W; weaveCv.height = H;
    const w = weaveCv.getContext('2d');
    w.fillStyle = '#0f0b06';
    w.fillRect(0, 0, W, H);
    // horizontal weft
    for (let y = 0; y < H; y += 3) {
      const a = 0.03 + SH.noise2(y * 0.05, 7.7) * 0.05;
      w.strokeStyle = 'rgba(190,160,110,' + a.toFixed(3) + ')';
      w.beginPath();
      for (let x = 0; x <= W; x += 30) {
        const yy = y + SH.noise2(x * 0.02, y * 0.13) * 2.2;
        if (x === 0) w.moveTo(x, yy); else w.lineTo(x, yy);
      }
      w.stroke();
    }
    // vertical warp, fainter
    for (let x = 0; x < W; x += 5) {
      const a = 0.015 + SH.noise2(x * 0.04, 3.3) * 0.03;
      w.strokeStyle = 'rgba(150,120,80,' + a.toFixed(3) + ')';
      w.beginPath(); w.moveTo(x, 0); w.lineTo(x + SH.rf(r, -3, 3), H); w.stroke();
    }
    // wear patches
    for (let i = 0; i < 9; i++) {
      const px = SH.rf(r, 60, W - 60), py = SH.rf(r, 120, H - 80), pr = SH.rf(r, 50, 160);
      const gr = w.createRadialGradient(px, py, 0, px, py, pr);
      const dark = r() < 0.5;
      gr.addColorStop(0, dark ? 'rgba(0,0,0,.16)' : 'rgba(220,190,140,.045)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      w.fillStyle = gr;
      w.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    // lint field
    lint = [];
    for (let i = 0; i < 44; i++) {
      lint.push({
        x: SH.rf(r, 180, 720), y: SH.rf(r, 120, 1020),
        vx: 0, vy: 0, r: SH.rf(r, 0.7, 2.1), ph: SH.rf(r, 0, 100),
        fiber: r() < 0.25,
      });
    }
    sparkles = [];
  };

  function makeGrain() {
    grainCv = document.createElement('canvas');
    grainCv.width = 220; grainCv.height = 220;
    const g = grainCv.getContext('2d');
    const im = g.createImageData(220, 220);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = 100 + Math.random() * 90 | 0;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 26;
    }
    g.putImageData(im, 0, 0);
  }

  /* ---------------- light shaft ---------------- */
  function lightDir() {
    const sway = SH.Sim.swayNow || 0;
    const a = Math.PI / 2 + sway * 0.55;
    return { x: Math.cos(a), y: Math.sin(a), a };
  }
  function lightRGB() {
    return SH.Sim.lightCol === 'blue' ? BLUE : WARM;
  }
  R.exposure = function (px, py) {
    const O = { x: 450, y: 88 };
    const d = lightDir();
    const vx = px - O.x, vy = py - O.y;
    const along = vx * d.x + vy * d.y;
    if (along < 0) return 0;
    const lat = Math.abs(vx * d.y - vy * d.x);
    const halfw = 95 + along * 0.34;
    const e = Math.max(0, 1 - lat / halfw) * Math.max(0.08, 1 - along / 1000);
    return e * (SH.Sim.lightLevel || 0.5);
  };

  function pocketPath(c) {
    c.beginPath();
    c.moveTo(SH.pocketMouth.l.x, SH.pocketMouth.l.y);
    for (let i = 0; i <= 24; i++) { const p = SH.pocketPoint('L', i / 24); c.lineTo(p.x, p.y); }
    for (let i = 0; i <= 8; i++) { const p = SH.pocketBottom(i / 8); c.lineTo(p.x, p.y); }
    for (let i = 24; i >= 0; i--) { const p = SH.pocketPoint('R', i / 24); c.lineTo(p.x, p.y); }
    c.closePath();
  }

  function drawShaft(alphaMul, clip) {
    const O = { x: 450, y: 88 };
    const d = lightDir();
    const [cr, cg, cb] = lightRGB();
    const L = 980;
    const w0 = 58, w1 = w0 + L * 0.23;
    const px = -d.y, py = d.x;
    const p1 = { x: O.x - px * w0, y: O.y - py * w0 };
    const p2 = { x: O.x + px * w0, y: O.y + py * w0 };
    const p3 = { x: O.x + d.x * L + px * w1, y: O.y + d.y * L + py * w1 };
    const p4 = { x: O.x + d.x * L - px * w1, y: O.y + d.y * L - py * w1 };
    const grd = ctx.createLinearGradient(O.x, O.y, O.x + d.x * L, O.y + d.y * L);
    const a0 = 0.14 * (SH.Sim.lightLevel || 0.5) * alphaMul;
    grd.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a0.toFixed(3) + ')');
    grd.addColorStop(0.55, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (a0 * 0.4).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
    ctx.save();
    if (clip) { pocketPath(ctx); ctx.clip(); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------------- boiling outline helper ---------------- */
  R.boilPath = function (c, pts, seedv, amp) {
    amp = amp || 1.3;
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const n1 = SH.noise2(i * 0.71 + seedv, T * 1.7) - 0.5;
      const n2 = SH.noise2(i * 0.53 + seedv + 40, T * 1.7) - 0.5;
      const x = pts[i][0] + n1 * 2 * amp, y = pts[i][1] + n2 * 2 * amp;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
  };

  /* ---------------- pocket + hole ---------------- */
  function drawPocket() {
    // interior slightly lifted from the surrounding coat-dark
    ctx.save();
    pocketPath(ctx);
    ctx.fillStyle = 'rgba(235,205,160,.045)';
    ctx.fill();
    ctx.restore();

    // seams: double stitch line, hand-wobbled
    const seamPt = (side, t) => side === 'B' ? SH.pocketBottom(t) : SH.pocketPoint(side, t);
    for (const side of ['L', 'R', 'B']) {
      for (const off of [0, 7]) {
        ctx.strokeStyle = off ? 'rgba(190,160,110,.10)' : 'rgba(190,160,110,.16)';
        ctx.lineWidth = off ? 1 : 1.6;
        ctx.setLineDash(off ? [5, 6] : []);
        ctx.beginPath();
        const steps = side === 'B' ? 10 : 30;
        for (let i = 0; i <= steps; i++) {
          const p = seamPt(side, i / steps);
          const n = SH.noise2(i * 0.9 + (side === 'L' ? 0 : side === 'R' ? 50 : 90), T * 0.8) - 0.5;
          const dx = side === 'B' ? 0 : (side === 'L' ? 1 : -1) * (off + 4);
          const dy = side === 'B' ? -(off + 4) : 0;
          const x = p.x + dx + n * 2, y = p.y + dy + n * 2;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // mouth lip
    const [cr, cg, cb] = lightRGB();
    ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.22 * (SH.Sim.lightLevel || 0.5)).toFixed(3) + ')';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = SH.pocketMouth.l.x; x <= SH.pocketMouth.r.x; x += 12) {
      const y = SH.pocketMouth.l.y + (SH.noise2(x * 0.02, T * 0.9) - 0.5) * 4;
      if (x === SH.pocketMouth.l.x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawHideCorner() {
    const sim = SH.Sim;
    if (!sim.hideC) return;
    const { x, y } = sim.hideC;
    // a drift of shadow and lint the light never quite reaches
    const gr = ctx.createRadialGradient(x, y, 8, x, y, 105);
    gr.addColorStop(0, 'rgba(0,0,0,.5)');
    gr.addColorStop(0.7, 'rgba(0,0,0,.28)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - 105, y - 105, 210, 210);
    // resident lint tufts
    ctx.strokeStyle = 'rgba(120,100,70,.22)';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r0 = 20 + (i * 13) % 55;
      const lx = x + Math.cos(a) * r0, ly = y + Math.sin(a) * r0 * 0.7;
      const n = SH.noise2(i * 5.1, T * 0.4) - 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx + 5 + n * 4, ly - 4, lx + 10 + n * 6, ly + 2 + n * 3);
      ctx.stroke();
    }
  }

  function drawHole() {
    const sim = SH.Sim;
    if (!sim.holeC) return;
    const { x, y } = sim.holeC;
    const hr = sim.effHoleR ? sim.effHoleR() : sim.holeR;
    const tw = sim.threadTwitch || 0;
    const mend = sim.mend || 0;
    // the void
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, hr + 3, hr * 0.8 + 2, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#020101';
    ctx.fill();
    // fraying threads
    for (let i = 0; i < 8; i++) {
      const a = 0.5 + (i / 8) * Math.PI * 2;
      const n = SH.noise2(i * 3.1, T * (1.2 + tw * 5)) - 0.5;
      const len = hr * 0.9 + 5 + n * 6 + tw * 7;
      const bx = x + Math.cos(a) * hr * 0.8, by = y + Math.sin(a) * hr * 0.65;
      ctx.strokeStyle = 'rgba(190,160,110,' + (0.14 + tw * 0.2).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        bx + Math.cos(a + n) * len * 0.6, by + Math.sin(a + n) * len * 0.6,
        bx + Math.cos(a + n * 2.2) * len, by + Math.sin(a + n * 2.2) * len + tw * 3);
      ctx.stroke();
    }
    // popped stitches
    ctx.strokeStyle = 'rgba(190,160,110,.2)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x - hr - 8 - i * 7, y - 4 + i * 5, 2.5, 0.4, 2.6);
      ctx.stroke();
    }
    // a gum patch: pale, stubborn, temporary
    if (sim.gumPatch > 0) {
      const ga = Math.min(0.55, sim.gumPatch / 12);
      ctx.fillStyle = 'rgba(214,200,178,' + ga.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(x, y, sim.holeR + 7, sim.holeR * 0.75 + 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,135,110,' + (ga * 0.8).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // mended threads: taut cross-stitches drawn over the gap
    if (mend > 0.05) {
      ctx.strokeStyle = 'rgba(201,180,99,' + (0.15 + mend * 0.4).toFixed(3) + ')';
      ctx.lineWidth = 1.1;
      const n = Math.round(mend * 5);
      for (let i = 0; i < n; i++) {
        const o = (i - n / 2) * 6;
        ctx.beginPath();
        ctx.moveTo(x - hr - 2 + o, y - hr * 0.7);
        ctx.lineTo(x + 2 + o, y + hr * 0.75);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------------- the thimble ---------------- */
  function drawThimble() {
    const sim = SH.Sim;
    if (!sim.thimbleC) return;
    const { x, y } = sim.thimbleC;
    const e = R.exposure(x, y);
    const busy = !!sim.reading;
    const glow = busy ? (0.35 + Math.sin(T * 9) * 0.15) : 0.12 + e * 0.3;
    // a little nest of thread it sits in
    ctx.strokeStyle = 'rgba(190,160,110,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y + 8, 20, 3.3, 6.1); ctx.stroke();
    // the thimble: a small brass dome, dimpled
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 10);
    ctx.quadraticCurveTo(x - 12, y - 12, x, y - 14);
    ctx.quadraticCurveTo(x + 12, y - 12, x + 11, y + 10);
    ctx.closePath();
    ctx.fillStyle = '#3a2f1c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,196,120,' + glow.toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    for (let i = 0; i < 5; i++) { // dimples
      ctx.beginPath();
      ctx.arc(x - 6 + i * 3, y - 5 + (i % 2) * 3.5, 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    // reading in progress: a closing ring of gold
    if (busy) {
      const prog = Math.min(1, sim.reading.t / 2.2);
      ctx.strokeStyle = 'rgba(232,196,120,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
    }
  }

  /* ---------------- items ---------------- */
  function drawItem(it) {
    const sim = SH.Sim;
    if (it.fate !== 'in-pocket' || (!it.body && !it.bodies)) return;
    const [cr, cg, cb] = lightRGB();

    if (it.def.chain) { drawRope(it, cr, cg, cb); return; }

    const b = it.body;
    const e0 = R.exposure(b.position.x, b.position.y);
    const mat = SH.MATS[it.mat];
    const e = Math.max(mat.minRim || 0, e0);

    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);

    // silhouette (damaged things boil harder — water-stained, chewed at)
    const amp = it.damaged ? 3.4 : undefined;
    R.boilPath(ctx, it.geom.outline, it.seedv, amp);
    ctx.fillStyle = mat.fill;
    ctx.fill();
    if (it.damaged) {
      ctx.strokeStyle = 'rgba(110,75,45,.4)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // constant outline so shapes read even in the dark
    ctx.strokeStyle = 'rgba(216,201,168,' + (0.14 + e0 * 0.12).toFixed(3) + ')';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // rim light toward the shaft
    if (e > 0.02) {
      const d = lightDir();
      // light direction in local space
      const la = d.a - b.angle;
      const lx = Math.cos(la), ly = Math.sin(la);
      let rad = 10;
      for (const [px, py] of it.geom.outline) rad = Math.max(rad, Math.hypot(px, py));
      const grd = ctx.createLinearGradient(-lx * rad, -ly * rad, lx * rad, ly * rad);
      const rimCol = mat.rim ? hexToRgb(mat.rim) : [cr, cg, cb];
      grd.addColorStop(0, 'rgba(' + rimCol[0] + ',' + rimCol[1] + ',' + rimCol[2] + ',' + Math.min(0.95, e * 1.1).toFixed(3) + ')');
      grd.addColorStop(0.55, 'rgba(' + rimCol[0] + ',' + rimCol[1] + ',' + rimCol[2] + ',0)');
      ctx.strokeStyle = grd;
      ctx.lineWidth = 1.8;
      R.boilPath(ctx, it.geom.outline, it.seedv, amp);
      ctx.stroke();
    }

    // engraved details
    ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.05 + e0 * 0.3).toFixed(3) + ')';
    ctx.lineWidth = 1;
    it.def.detail(ctx, it.geom, (pts, sv) => R.boilPath(ctx, pts, it.seedv + sv, 0.8), it);
    ctx.restore();

    // metal glints
    if (mat.glint && e0 > 0.35) {
      const spin = Math.abs(b.angularVelocity) + Math.hypot(b.velocity.x, b.velocity.y) * 0.08;
      if (spin > 0.12 && Math.random() < 0.1) {
        sparkles.push({ x: b.position.x + (Math.random() - 0.5) * 16, y: b.position.y + (Math.random() - 0.5) * 16, t: 0, gold: it.mat === 'gold' });
      }
    }
  }

  function drawRope(it, cr, cg, cb) {
    const pts = it.bodies.map(b => b.position);
    let esum = 0;
    for (const p of pts) esum += R.exposure(p.x, p.y);
    const e = esum / pts.length;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // cord
    ctx.strokeStyle = '#181310';
    ctx.lineWidth = 4.5;
    ropePath(pts, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.06 + e * 0.5).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ropePath(pts, -1.4);
    ctx.stroke();
    // buds
    for (const i of [0, pts.length - 1]) {
      const p = pts[i];
      const ee = R.exposure(p.x, p.y);
      ctx.beginPath(); ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1512'; ctx.fill();
      ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.08 + ee * 0.6).toFixed(3) + ')';
      ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.restore();
  }
  function ropePath(pts, off) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y + off);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2, yc = (pts[i].y + pts[i + 1].y) / 2 + off;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y + off, xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y + off);
  }

  /* ---------------- the hand ---------------- */
  function drawHand() {
    const h = SH.Sim.hand;
    if (!h) return;
    const thief = !!(h.ev && h.ev.thief);
    const W2 = thief ? 0.62 : 1; // a thief's arm is thin, quick, wrong
    const [cr, cg, cb] = lightRGB();
    const wx = h.x, wy = h.y;
    if (wy < -50) return;
    const topX = 450 + (wx - 450) * 0.3;
    ctx.save();
    // wrist/arm: tapered dark shape from above the mouth down to the palm
    ctx.beginPath();
    const n = (SH.noise1(T * (thief ? 4 : 2) + h.wiggleSeed) - 0.5) * (thief ? 12 : 8);
    ctx.moveTo(topX - 40 * W2, -60);
    ctx.quadraticCurveTo(topX - 34 * W2 + n, wy * 0.4, wx - 26 * W2, wy - 8);
    ctx.quadraticCurveTo(wx, wy + 6, wx + 26 * W2, wy - 8);
    ctx.quadraticCurveTo(topX + 34 * W2 + n, wy * 0.4, topX + 40 * W2, -60);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8,6,4,.96)';
    ctx.fill();
    if (thief) { // a pale, unfamiliar cuff
      ctx.strokeStyle = 'rgba(205,195,175,.3)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(topX - 34 * W2, -20);
      ctx.quadraticCurveTo(topX, -8, topX + 34 * W2, -20);
      ctx.stroke();
    }
    // rim on the lit edge
    ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.25 * (SH.Sim.lightLevel || 0.5)).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(topX - 40 * W2, -60);
    ctx.quadraticCurveTo(topX - 34 * W2 + n, wy * 0.4, wx - 26 * W2, wy - 8);
    ctx.stroke();
    // fingers
    for (let i = 0; i < 4; i++) {
      const fa = -0.55 + i * 0.36 + (SH.noise2(i * 9, T * 2.4 + h.wiggleSeed) - 0.5) * 0.22;
      const fl = 34 + (i === 1 || i === 2 ? 8 : 0);
      const fx = wx + Math.sin(fa) * 14 * W2, fy = wy + 2;
      ctx.strokeStyle = 'rgba(8,6,4,.96)';
      ctx.lineWidth = (9 - i * 0.4) * W2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx + Math.sin(fa) * fl * 0.6, fy + fl * 0.65, fx + Math.sin(fa) * fl, fy + fl);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- lint + sparkles ---------------- */
  function drawLint(dt) {
    const sim = SH.Sim;
    const [cr, cg, cb] = lightRGB();
    const sway = sim.swayNow || 0;
    for (const l of lint) {
      l.vx += (SH.noise2(l.ph, T * 0.5) - 0.5) * 1.1 * dt + sway * 1.6 * dt;
      l.vy += (SH.noise2(l.ph + 30, T * 0.5) - 0.48) * 0.8 * dt;
      l.vx *= 0.985; l.vy *= 0.985;
      l.x += l.vx; l.y += l.vy;
      if (l.x < 180) l.x = 720; if (l.x > 720) l.x = 180;
      if (l.y < 110) l.y = 1000; if (l.y > 1020) l.y = 110;
      const e = R.exposure(l.x, l.y);
      const a = 0.03 + e * 0.5;
      if (l.fiber) {
        ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (a * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.quadraticCurveTo(l.x + 4, l.y + 2, l.x + 7, l.y + 6);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // sparkles
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.t += dt;
      if (s.t > 0.45) { sparkles.splice(i, 1); continue; }
      const a = Math.sin((s.t / 0.45) * Math.PI);
      const c = s.gold ? '255,210,122' : '240,220,180';
      const r0 = 3 + a * 4;
      ctx.strokeStyle = 'rgba(' + c + ',' + (a * 0.9).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x - r0, s.y); ctx.lineTo(s.x + r0, s.y);
      ctx.moveTo(s.x, s.y - r0); ctx.lineTo(s.x, s.y + r0);
      ctx.stroke();
    }
  }

  /* ---------------- the lint-moth ---------------- */
  function drawMoth() {
    const m = SH.Sim.moth;
    if (!m) return;
    const e = R.exposure(m.x, m.y);
    const a = 0.35 + e * 0.55;
    const flap = Math.sin(m.t * 26) * 0.9;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);
    ctx.fillStyle = 'rgba(235,225,200,' + a.toFixed(3) + ')';
    // two flickering wings
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-7 * (0.4 + Math.abs(flap)), -5); ctx.lineTo(-1, -8); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(7 * (0.4 + Math.abs(flap)), -5); ctx.lineTo(1, -8); ctx.closePath();
    ctx.fill();
    // dusty body
    ctx.fillStyle = 'rgba(210,195,165,' + (a * 0.9).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(0, -3, 1.6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------------- cursor ---------------- */
  function drawCursor() {
    const sim = SH.Sim;
    const p = sim.pointer;
    if (!p.worldOK) return;
    const calm = 1 - Math.min(1, sim.act ? sim.act.intensity : 0);
    const hov = sim.itemAt(p.x, p.y);

    // gripped item: a taut thread from cursor to the thing you're tugging
    if (sim.dragIt && sim.dragIt.body && sim.dragIt.fate === 'in-pocket' && p.down) {
      const b = sim.dragIt.body;
      ctx.strokeStyle = 'rgba(232,196,120,.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(b.position.x, b.position.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(232,196,120,.55)';
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    // the ring: bright enough to always find, brighter still when you can act
    const a = (p.down ? 0.55 : 0.3) * (0.55 + calm * 0.45);
    ctx.strokeStyle = 'rgba(232,196,120,' + a.toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (hov ? 15 : 20) + sim.ripple * 26, 0, Math.PI * 2);
    ctx.stroke();
    // dark halo so it reads on lit fabric too
    ctx.strokeStyle = 'rgba(0,0,0,' + (a * 0.6).toFixed(3) + ')';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (hov ? 15 : 20) + sim.ripple * 26 + 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,210,140,' + Math.min(0.9, a * 2.2).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();

    // examination in progress: a slow ring closing around the cursor
    if (sim.examCh) {
      const prog = Math.min(1, sim.examCh.t / 1.1);
      ctx.strokeStyle = 'rgba(201,180,99,.85)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 27, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
    }

    // hover label: identify what the eye has found
    if (hov) {
      const seen = sim.g && sim.g.journal && sim.g.journal[hov.type];
      const txt = hov.label + (sim.isHidden(hov) ? '  ·  hidden from the fingers' : (seen ? '' : '  ·  unexamined'));
      ctx.font = 'italic 17px Georgia, serif';
      const tw = ctx.measureText(txt).width;
      let tx = p.x + 22, ty = p.y - 18;
      if (tx + tw > 880) tx = p.x - 22 - tw;
      ctx.fillStyle = 'rgba(5,3,2,.72)';
      ctx.fillRect(tx - 7, ty - 16, tw + 14, 24);
      ctx.fillStyle = seen ? 'rgba(216,201,168,.92)' : 'rgba(201,180,99,.95)';
      ctx.fillText(txt, tx, ty);
    }
  }

  function hexToRgb(hx) {
    return [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
  }

  /* ---------------- frame ---------------- */
  R.draw = function (dt) {
    T += dt;
    const sim = SH.Sim;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070503';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const v = SH.view;
    ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
    if (sim.crisis && sim.crisis.phase === 'active')
      ctx.translate((Math.random() - 0.5) * (sim.crisis.type === 'wash' ? 10 : 5),
                    (Math.random() - 0.5) * (sim.crisis.type === 'wash' ? 10 : 5));

    if (weaveCv) ctx.drawImage(weaveCv, 0, 0);
    drawPocket();
    drawShaft(0.6, true);
    drawHole();
    drawThimble();
    if (sim.g) for (const it of sim.g.items) drawItem(it);
    drawHideCorner(); // shadow falls OVER whatever is buried there
    drawHand();
    drawMoth();
    drawShaft(0.35, false);
    drawLint(dt);
    drawCursor();

    // grain + vignette, screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (grainCv) {
      if (!grainPat) grainPat = ctx.createPattern(grainCv, 'repeat');
      ctx.save();
      ctx.globalAlpha = 0.5;
      const gx = (Math.random() * 220) | 0, gy = (Math.random() * 220) | 0;
      ctx.translate(-gx, -gy);
      ctx.fillStyle = grainPat;
      ctx.fillRect(0, 0, cv.width + 220, cv.height + 220);
      ctx.restore();
    }
    if (!vgGrad) {
      vgGrad = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.32,
        cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.72);
      vgGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vgGrad.addColorStop(1, 'rgba(0,0,0,.5)');
    }
    ctx.fillStyle = vgGrad;
    ctx.fillRect(0, 0, cv.width, cv.height);
  };
})();
