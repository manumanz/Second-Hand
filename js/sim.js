/* SECOND HAND — the physics of a pocket: cloth walls, an owner you never see
   (felt only as gravity and jolts), the rummaging hand, and the hole. */
(function () {
  'use strict';
  const SH = window.SH;
  const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

  const W = 900, H = 1150;
  SH.WORLD = { W, H };

  /* pocket silhouette — quadratic beziers, shared with the renderer */
  const mouthL = { x: 255, y: 95 }, mouthR = { x: 645, y: 95 };
  const cL = { x: 98, y: 620 }, cR = { x: 802, y: 620 };
  const bL = { x: 350, y: 1010 }, bR = { x: 550, y: 1010 };
  const bC = { x: 450, y: 1072 };
  function qbez(a, c, b, t) {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }
  SH.pocketPoint = function (side, t) {
    return side === 'L' ? qbez(mouthL, cL, bL, t) : qbez(mouthR, cR, bR, t);
  };
  SH.pocketBottom = function (t) { return qbez(bL, bC, bR, t); };
  SH.pocketMouth = { l: mouthL, r: mouthR };

  const HOLE_T = 0.84;                       // where on the right seam the hole lives
  const HOLE_R_BY_DAY = [5, 9, 11, 13, 15, 18, 21];

  const sim = SH.Sim = {
    engine: null, world: null,
    g: null,                                  // stranger/game state
    t: 0, dur: 0, done: true, dayIdx: 0,
    act: null, actName: 'still',
    segments: [], segIdx: 0, segT: 0,
    drops: [], hands: [], di: 0, hi: 0,
    hand: null, holeC: null, holeR: 0,
    dayLost: 0, swayNow: 0, lightLevel: 0.8, lightCol: 'warm',
    joltTimer: 0, coinTimer: 0, events: [],
    threadTwitch: 0, ripple: 0, mend: 0,
    pointer: { x: 0, y: 0, down: false, worldOK: false },
  };

  sim.effHoleR = function () { return sim.holeR * (1 - 0.5 * sim.mend); };

  /* the dark corner: a lint-drift low on the left where the fingers never think to check */
  sim.hideC = { x: 284, y: 890 };
  sim.isHidden = function (it) {
    if (!it || !it.body) return false;
    return Math.hypot(it.body.position.x - sim.hideC.x, it.body.position.y - sim.hideC.y) < 95;
  };

  /* activity table — how the unseen owner's movement reaches us */
  const ACT = SH.ACT = {
    still:   { swayA: .04, swayF: .35, jolt: 0,    joltEvery: 0,   gA: 0,    light: .8,  intensity: .05 },
    walk:    { swayA: .17, swayF: 1.7, jolt: .9,   joltEvery: .58, gA: 0,    light: .95, intensity: .45 },
    brisk:   { swayA: .23, swayF: 2.1, jolt: 1.4,  joltEvery: .45, gA: 0,    light: 1,   intensity: .65 },
    run:     { swayA: .3,  swayF: 2.6, jolt: 2.6,  joltEvery: .36, gA: 0,    light: 1,   intensity: 1 },
    sit:     { swayA: .02, swayF: .3,  jolt: 0,    joltEvery: 0,   gA: .6,   light: .55, intensity: .08 },
    bus:     { swayA: .05, swayF: .9,  jolt: .28,  joltEvery: .1,  gA: .12,  light: .7,  intensity: .3 },
    pace:    { swayA: .2,  swayF: 2.2, jolt: 1.0,  joltEvery: .5,  gA: 0,    light: .85, intensity: .55, flip: 3.5 },
    perform: { swayA: .13, swayF: 2.4, jolt: 1.5,  joltEvery: .5,  gA: 0,    light: 1,   intensity: .7, coinRain: true },
    night:   { swayA: .015, swayF: .2, jolt: 0,    joltEvery: 0,   gA: .06,  light: .14, intensity: 0, blue: true },
  };

  sim.init = function (g) {
    sim.g = g;
    const engine = sim.engine = Engine.create();
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    sim.world = engine.world;

    // pocket walls as chains of static segments
    const wallOpts = { isStatic: true, friction: 0.55, restitution: 0.05 };
    const addChain = pts => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const seg = Bodies.rectangle(mx, my, len + 8, 30, wallOpts);
        Body.setAngle(seg, ang);
        Composite.add(sim.world, seg);
      }
    };
    const N = 22;
    const lpts = [], rpts = [], bpts = [];
    for (let i = 0; i <= N; i++) { lpts.push(SH.pocketPoint('L', i / N)); rpts.push(SH.pocketPoint('R', i / N)); }
    for (let i = 0; i <= 8; i++) bpts.push(SH.pocketBottom(i / 8));
    addChain(lpts); addChain(rpts); addChain(bpts);
    // funnel guards above the mouth so drops find their way in
    addChain([{ x: 120, y: -140 }, { x: mouthL.x - 4, y: mouthL.y - 6 }]);
    addChain([{ x: 780, y: -140 }, { x: mouthR.x + 4, y: mouthR.y - 6 }]);

    const hp = SH.pocketPoint('R', HOLE_T);
    sim.holeC = { x: hp.x, y: hp.y };
    sim.holeR = HOLE_R_BY_DAY[0];

    Events.on(engine, 'collisionStart', ev => {
      for (const pair of ev.pairs) {
        const va = pair.bodyA.velocity, vb = pair.bodyB.velocity;
        const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
        if (rel > 1.2) sim.events.push({ type: 'thump', mag: Math.min(1, rel / 9) });
      }
    });
  };

  /* spawn an item at the pocket mouth */
  sim.spawnItem = function (type, opts) {
    const g = sim.g;
    const x = SH.rf(g.rng, 380, 520), y = -40;
    const it = SH.makeItem(sim.world, type, x, y, g.rng, opts);
    if (it) {
      g.items.push(it);
      sim.events.push({ type: 'spawn', label: it.label });
    }
    return it;
  };

  /* ---------------- day control ---------------- */
  sim.startDay = function (dayResolved, dayIdx, segments, durSec) {
    sim.dayIdx = dayIdx;
    sim.t = 0; sim.dur = durSec; sim.done = false;
    sim.segments = segments; sim.segIdx = 0; sim.segT = 0;
    sim.drops = dayResolved.drops; sim.di = 0;
    sim.hands = dayResolved.hands; sim.hi = 0;
    sim.dayLost = 0;
    sim.holeR = HOLE_R_BY_DAY[dayIdx];
    sim.setSeg(0);
  };

  sim.setSeg = function (i) {
    sim.segIdx = i; sim.segT = 0;
    const s = sim.segments[Math.min(i, sim.segments.length - 1)];
    sim.actName = s.act;
    sim.act = ACT[s.act];
    sim.events.push({ type: 'act', act: s.act });
  };

  /* ---------------- the hand ---------------- */
  function startHand(ev) {
    const g = sim.g;
    let target = null;
    if (ev.action !== 'give') {
      const cands = g.items.filter(it =>
        it.type === ev.seek && it.fate === 'in-pocket' && it.body && !it.def.chain &&
        !sim.isHidden(it)); // buried in the lint corner = invisible to the fingers
      if (ev.wantLucky) {
        target = cands.find(it => it.opts.lucky) || cands[0] || null;
      } else if (cands.length) {
        target = cands[SH.ri(g.rng, 0, cands.length - 1)];
      }
    }
    sim.hand = {
      ev, target, phase: 'enter', pt: 0,
      x: target ? target.body.position.x : SH.rf(sim.g.rng, 380, 520),
      y: -60, grabbed: null, constraint: null, wiggleSeed: SH.rf(sim.g.rng, 0, 100),
      palm: null, searched: false,
    };
    const palm = Bodies.circle(sim.hand.x, sim.hand.y, 32, { isStatic: true, friction: 0.4 });
    palm.plugin.isPalm = true;
    Composite.add(sim.world, palm);
    sim.hand.palm = palm;
    sim.events.push({ type: 'rustle' });
    sim.events.push({ type: 'handStart', ev });
  }

  function endHand(result) {
    const h = sim.hand, g = sim.g, ev = h.ev;
    if (h.constraint) { Composite.remove(sim.world, h.constraint); h.constraint = null; }
    if (result === 'took' && h.grabbed) {
      Composite.remove(sim.world, h.grabbed.body);
      h.grabbed.fate = 'taken';
      if (ev.flag) g.flags[ev.flag] = true;
    } else if (result === 'returned') {
      if (ev.flag && h.grabbed) g.flags[ev.flag] = true; // e.g. cave1 — they used it and put it back
    } else if (result === 'miss') {
      if (ev.missFlag) g.flags[ev.missFlag] = true;
    }
    const label = h.grabbed ? h.grabbed.label :
      (SH.ITEM_DEFS[ev.seek] ? SH.ITEM_DEFS[ev.seek].label : 'something');
    sim.events.push({ type: 'handEnd', result, ev, label });
    if (h.palm) Composite.remove(sim.world, h.palm);
    sim.hand = null;
  }

  function updateHand(dt) {
    const h = sim.hand;
    if (!h) return;
    const ev = h.ev;
    h.pt += dt;
    const wig = (SH.noise1(h.pt * 2.1 + h.wiggleSeed) - 0.5) * 26;

    const targetLive = () =>
      h.target && h.target.fate === 'in-pocket' && h.target.body && !sim.isHidden(h.target);

    const targetX = () => {
      if (h.grabbed || ev.action === 'give') return h.x;
      if (targetLive())
        return h.x + (h.target.body.position.x - h.x) * 0.06; // lazy tracking: pushable away
      return h.x + (SH.noise1(h.pt * 0.8 + h.wiggleSeed) - 0.5) * 3;
    };

    switch (h.phase) {
      case 'enter': {
        h.x = targetX();
        const targY = (ev.action === 'give') ? 620 :
          targetLive() ? Math.min(920, h.target.body.position.y - 26) : 780;
        h.y += Math.min(260 * dt, Math.max(30 * dt, (targY - h.y) * 1.6 * dt));
        if (h.y >= targY - 4) { h.phase = (ev.action === 'give') ? 'deposit' : 'grab'; h.pt = 0; }
        break;
      }
      case 'grab': {
        h.x = targetX() + wig * 0.4;
        if (targetLive())
          h.y += (Math.min(920, h.target.body.position.y - 26) - h.y) * 2.2 * dt;
        if (h.pt > 0.55) {
          const reach = h.searched ? 130 : 95;
          let got = null;
          if (targetLive()) {
            const d = Math.hypot(h.target.body.position.x - h.x, h.target.body.position.y - h.y);
            if (d < reach) got = h.target;
          }
          if (got) {
            h.grabbed = got;
            h.constraint = Constraint.create({
              bodyA: h.palm, pointA: { x: 0, y: 26 }, bodyB: got.body,
              stiffness: 0.12, damping: 0.12, length: 6,
            });
            Composite.add(sim.world, h.constraint);
            h.phase = 'lift'; h.pt = 0;
          } else if (!h.searched) {
            h.searched = true; h.phase = 'search'; h.pt = 0;
          } else {
            h.phase = 'exit'; h.pt = 0; h.result = 'miss';
          }
        }
        break;
      }
      case 'search': { // rummage around, stirring everything
        h.x += Math.sin(h.pt * 5.2) * 130 * dt + wig * dt * 8;
        h.y += Math.cos(h.pt * 3.1) * 60 * dt;
        h.y = Math.min(950, Math.max(500, h.y));
        h.x = Math.min(700, Math.max(200, h.x));
        if (targetLive()) {
          h.x += (h.target.body.position.x - h.x) * 2.4 * dt;
          h.y += (Math.min(930, h.target.body.position.y - 20) - h.y) * 1.8 * dt;
        }
        if (h.pt > 1.6) { h.phase = 'grab'; h.pt = 0.4; }
        break;
      }
      case 'lift': {
        const keeps = ev.action === 'take' && !ev.returns;
        const upY = keeps ? -80 : 170;
        h.y += (upY - h.y) * 1.4 * dt;
        h.x += (450 - h.x) * 0.6 * dt;
        if (keeps && h.y < -30) { endHand('took'); return; }
        if (!keeps && h.y < 185) {
          h.phase = 'hold'; h.pt = 0;
          h.holdFor = (ev.action === 'peeklong') ? 2.6 : (ev.returns ? 3.1 : 1.2);
        }
        break;
      }
      case 'hold': {
        h.x += wig * dt * 1.5;
        if (h.pt > h.holdFor) { h.phase = 'lower'; h.pt = 0; }
        break;
      }
      case 'lower': {
        h.y += (560 - h.y) * 1.6 * dt;
        if (h.y > 545) {
          if (h.constraint) { Composite.remove(sim.world, h.constraint); h.constraint = null; }
          h.result = ev.returns ? 'returned' : 'peeked';
          h.phase = 'exit'; h.pt = 0;
        }
        break;
      }
      case 'deposit': {
        if (!h.deposited) {
          h.deposited = true;
          const it = sim.spawnItem(ev.seek, ev.opts);
          if (it) {
            Body.setPosition(it.body, { x: h.x, y: h.y + 30 });
            Body.setVelocity(it.body, { x: 0, y: 1 });
          }
        }
        if (h.pt > 0.5) { h.phase = 'exit'; h.pt = 0; h.result = 'gave'; }
        break;
      }
      case 'exit': {
        h.y -= 340 * dt;
        h.x += (450 - h.x) * 0.5 * dt;
        if (h.y < -90) { endHand(h.result === 'miss' ? 'miss' : (h.result || 'peeked')); return; }
        break;
      }
    }
    if (h && h.palm) Body.setPosition(h.palm, { x: h.x, y: h.y });
  }

  /* ---------------- the hole ---------------- */
  function updateHole(dt) {
    const g = sim.g;
    sim.threadTwitch = Math.max(0, sim.threadTwitch - dt * 1.4);
    for (const it of g.items) {
      if (it.fate !== 'in-pocket' || !it.body || it.def.chain) continue;
      if (it.slipping) {
        it.slipT += dt;
        const dir = { x: 0.55, y: 0.85 };
        Body.setVelocity(it.body, { x: dir.x * 60 * dt + it.body.velocity.x * 0.9, y: dir.y * 80 * dt + it.body.velocity.y });
        if (it.slipT > 0.9 || it.body.position.y > sim.holeC.y + 130) {
          Composite.remove(sim.world, it.body);
          it.fate = 'lost';
          it.body = null;
          sim.dayLost++;
          if (it.type === g.arc.keyType) g.flags[it.type + 'Lost'] = true;
          sim.events.push({ type: 'gone', label: it.label });
          sim.threadTwitch = 1;
        }
        continue;
      }
      const holeR = sim.effHoleR();
      if (it.passSize > holeR) continue;
      // grabbed items don't slip
      if (sim.hand && sim.hand.grabbed === it) continue;
      const d = Math.hypot(it.body.position.x - sim.holeC.x, it.body.position.y - sim.holeC.y);
      // the hole breathes in: small things nearby feel a gentle, insistent pull
      if (d < holeR + 75 && d > 1) {
        const pull = 60 * (1 - d / (holeR + 75)) * (1 - 0.7 * sim.mend);
        const dx = (sim.holeC.x - it.body.position.x) / d, dy = (sim.holeC.y - it.body.position.y) / d;
        Body.setVelocity(it.body, {
          x: it.body.velocity.x + dx * pull * dt,
          y: it.body.velocity.y + dy * pull * dt,
        });
      }
      if (d < holeR + 12) {
        // it still has to work through the fraying threads — a chance to intervene
        it.holeTime = (it.holeTime || 0) + dt;
        if (it.holeTime > 0.2) {
          sim.threadTwitch = Math.max(sim.threadTwitch, 0.35);
          if (!it.holeWarned) { it.holeWarned = true; sim.events.push({ type: 'holeNear', label: it.label }); }
        }
        if (it.holeTime > 0.7) {
          it.slipping = true; it.slipT = 0;
          it.body.collisionFilter.mask = 0;
          sim.threadTwitch = 1;
          sim.events.push({ type: 'slip' });
        }
      } else if (it.holeTime) {
        it.holeTime = Math.max(0, it.holeTime - dt * 2);
      }
    }
  }

  /* find the item under/near a world point (for hover labels + examining) */
  sim.itemAt = function (wx, wy) {
    if (!sim.g) return null;
    let best = null, bd = 52;
    for (const it of sim.g.items) {
      if (it.fate !== 'in-pocket') continue;
      const bodies = it.def.chain ? it.bodies : (it.body ? [it.body] : []);
      for (const b of bodies) {
        const d = Math.hypot(b.position.x - wx, b.position.y - wy);
        if (d < bd) { bd = d; best = it; }
      }
    }
    return best;
  };

  /* ---------------- pointer input: grip, tug, mend ---------------- */
  let lastP = null;
  sim.calmNow = function () {
    return 0.18 + 0.82 * (1 - Math.min(1, (sim.act ? sim.act.intensity : 0)));
  };

  sim.gripAt = function (wx, wy) {
    // press near a thing = the pocket's ghost takes hold of it
    sim.dragIt = sim.itemAt(wx, wy);
  };
  sim.releaseGrip = function () { sim.dragIt = null; };

  sim.pointerMove = function (wx, wy, down) {
    const p = sim.pointer;
    p.x = wx; p.y = wy;
    if (down && p.down && lastP) {
      const dx = wx - lastP.x, dy = wy - lastP.y;
      const mag = Math.hypot(dx, dy);
      const calm = sim.calmNow();
      // rubbing across the hole pulls its threads tighter
      if (mag > 0.01) {
        const dh = Math.hypot(wx - sim.holeC.x, wy - sim.holeC.y);
        if (dh < sim.holeR + 55) {
          const before = sim.mend;
          sim.mend = Math.min(1, sim.mend + Math.min(mag, 30) * 0.0011 * calm);
          if (before < 0.35 && sim.mend >= 0.35) sim.events.push({ type: 'mended' });
          sim.threadTwitch = Math.max(sim.threadTwitch, 0.25);
        }
        sim.ripple = Math.min(1, sim.ripple + mag * 0.015 * calm);
      }
    }
    lastP = { x: wx, y: wy };
    p.down = down;
    if (!down) sim.dragIt = null;
  };

  /* called every physics tick: the gripped item is tugged toward the pointer */
  function updateGrip(dt) {
    const it = sim.dragIt;
    if (!it || it.fate !== 'in-pocket' || !sim.pointer.down) { if (!sim.pointer.down) sim.dragIt = null; return; }
    if (sim.hand && sim.hand.grabbed === it) return; // the fingers win a tug-of-war
    const calm = sim.calmNow();
    const bodies = it.def.chain ? [it.bodies[0], it.bodies[it.bodies.length - 1]] : [it.body];
    const b = bodies[0];
    if (!b) return;
    const dx = sim.pointer.x - b.position.x, dy = sim.pointer.y - b.position.y;
    const d = Math.hypot(dx, dy);
    if (d > 260) { sim.dragIt = null; return; } // torn loose
    // follow the cursor: strong and direct at rest, mushy while they move
    const maxSpeed = 1.5 + 10.5 * calm;
    let vx = dx * 6 * dt * 60 * 0.12, vy = dy * 6 * dt * 60 * 0.12;
    const vm = Math.hypot(vx, vy);
    if (vm > maxSpeed) { vx *= maxSpeed / vm; vy *= maxSpeed / vm; }
    Body.setVelocity(b, { x: vx, y: vy });
    sim.nudgeCount = (sim.nudgeCount || 0) + 1;
    sim.ripple = Math.max(sim.ripple, 0.25);
  }

  /* ---------------- main update ---------------- */
  sim.update = function (dt) {
    if (sim.done && !sim.hand) return;
    const g = sim.g;
    sim.t += dt;
    sim.segT += dt;
    sim.ripple = Math.max(0, sim.ripple - dt * 2);
    sim.mend = Math.max(0, sim.mend - dt * 0.012); // the mend frays back, slowly

    // advance schedule segments
    const seg = sim.segments[Math.min(sim.segIdx, sim.segments.length - 1)];
    if (sim.segT > seg.dur && sim.segIdx < sim.segments.length - 1) sim.setSeg(sim.segIdx + 1);
    const a = sim.act;
    const motion = g.motion, wx = g.weather[sim.dayIdx];

    // sway → gravity direction (the owner, felt)
    const flip = a.flip ? (Math.floor(sim.t / a.flip) % 2 ? -1 : 1) : 1;
    const sway = Math.sin(sim.t * a.swayF * Math.PI * 2) * a.swayA * motion.sway * wx.sway * flip
      + (SH.noise1(sim.t * 0.3) - 0.5) * 0.06;
    sim.swayNow = sway;
    const gA = a.gA * (a.gA > 0.5 ? (g.seed % 2 ? 1 : -1) : 1) + sway;
    sim.engine.gravity.x = Math.sin(gA);
    sim.engine.gravity.y = Math.cos(gA);

    // light level for the renderer
    sim.lightLevel = a.light * wx.light;
    sim.lightCol = a.blue ? 'blue' : 'warm';

    // step jolts
    if (a.joltEvery > 0) {
      sim.joltTimer -= dt * motion.speed;
      if (sim.joltTimer <= 0) {
        sim.joltTimer = a.joltEvery * SH.rf(g.rng, 0.85, 1.15);
        const J = a.jolt * motion.jolt;
        for (const it of g.items) {
          const bodies = it.def.chain ? it.bodies : (it.body ? [it.body] : []);
          for (const b of bodies) {
            if (!b || it.fate !== 'in-pocket') continue;
            Body.setVelocity(b, {
              x: b.velocity.x + SH.rf(g.rng, -0.6, 0.6) * J,
              y: b.velocity.y - SH.rf(g.rng, 0.5, 1.1) * J,
            });
          }
        }
        if (J > 1.2) sim.events.push({ type: 'step', mag: Math.min(1, J / 3) });
      }
    }

    // busking: coins rain in
    if (a.coinRain) {
      sim.coinTimer -= dt;
      if (sim.coinTimer <= 0) {
        sim.coinTimer = SH.rf(g.rng, 2.2, 4.5);
        sim.spawnItem('coin');
        sim.events.push({ type: 'thump', mag: 0.5 });
      }
    }

    // scheduled drops
    while (sim.di < sim.drops.length && sim.drops[sim.di].f * sim.dur <= sim.t) {
      const d = sim.drops[sim.di++];
      sim.spawnItem(d.type, d.opts);
    }
    // scheduled hand events (one at a time)
    if (!sim.hand && sim.hi < sim.hands.length && sim.hands[sim.hi].f * sim.dur <= sim.t) {
      startHand(sim.hands[sim.hi++]);
    }
    updateGrip(dt);
    updateHand(dt);
    updateHole(dt);

    Engine.update(sim.engine, Math.min(dt, 0.033) * 1000);

    if (sim.t >= sim.dur && !sim.hand) {
      // flush any hand events that never fired (e.g. day ended early)
      while (sim.hi < sim.hands.length) {
        const ev = sim.hands[sim.hi++];
        if (ev.missFlag) g.flags[ev.missFlag] = true;
      }
      sim.done = true;
      g.lostYesterday = sim.dayLost;
    }
  };
})();
