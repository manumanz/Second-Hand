/* SECOND HAND — pocket objects: physics factories + boiling-line procedural drawing.
   Nothing here is a sprite. Every outline is re-drawn each frame with noise. */
(function () {
  'use strict';
  const SH = window.SH;
  const { Bodies, Body, Composite, Constraint } = Matter;

  /* ---------- geometry helpers (base points; boiled at draw time) ---------- */
  function ptsCircle(r, n) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return p;
  }
  function ptsRRect(w, h, cr) {
    // sample a rounded rectangle perimeter
    const p = [];
    const hw = w / 2, hh = h / 2;
    const corners = [
      [hw - cr, hh - cr, 0], [-hw + cr, hh - cr, Math.PI / 2],
      [-hw + cr, -hh + cr, Math.PI], [hw - cr, -hh + cr, -Math.PI / 2],
    ];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 3; i++) {
        const a = a0 + (i / 3) * (Math.PI / 2);
        p.push([cx + Math.cos(a) * cr, cy + Math.sin(a) * cr]);
      }
    }
    return p;
  }
  function subdiv(verts, per) {
    const p = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      for (let j = 0; j < per; j++) {
        const t = j / per;
        p.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return p;
  }

  /* material tints: near-silhouette fills + rim colours */
  const MATS = {
    metal:  { fill: '#171412', rim: null, glint: true },
    gold:   { fill: '#2a2010', rim: '#ffd27a', glint: true, minRim: 0.3 },
    paper:  { fill: '#241d13', rim: null, glint: false },
    plastic:{ fill: '#1b1512', rim: null, glint: false },
    cloth:  { fill: '#1d1712', rim: null, glint: false },
    organic:{ fill: '#20180f', rim: null, glint: false },
  };
  SH.MATS = MATS;

  /* ---------- item catalogue ----------
     passSize: max hole radius needed to slip through (px). big = never fits. */
  const DEFS = {};
  SH.ITEM_DEFS = DEFS;

  function def(type, o) { DEFS[type] = o; }

  const RECT = (w, h, opt) => (x, y) =>
    Bodies.rectangle(x, y, w, h, Object.assign({ friction: 0.4, frictionAir: 0.012, restitution: 0.12, density: 0.0016 }, opt));
  const CIRC = (r, opt) => (x, y) =>
    Bodies.circle(x, y, r, Object.assign({ friction: 0.35, frictionAir: 0.012, restitution: 0.2, density: 0.002 }, opt));

  def('coin', {
    label: 'a coin', mat: 'metal', passSize: 13,
    make: CIRC(14, { density: 0.004, restitution: 0.3 }),
    geom: r => ({ outline: ptsCircle(14, 18), scratches: [[SH.rf(r, -6, 6), SH.rf(r, -6, 6), SH.rf(r, 3, 9)], [SH.rf(r, -6, 6), SH.rf(r, -6, 6), SH.rf(r, 2, 7)]] }),
    detail(ctx, g) {
      ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, Math.PI * 2); ctx.stroke();
      for (const [sx, sy, sr] of g.scratches) { ctx.beginPath(); ctx.arc(sx, sy, sr, 0.3, 1.9); ctx.stroke(); }
    },
  });

  def('key', {
    label: 'a door key', mat: 'metal', passSize: 15,
    make: RECT(52, 14, { density: 0.005 }),
    geom: () => ({
      outline: subdiv([[-26, -4], [2, -4], [2, -7], [8, -7], [8, -4], [14, -4], [14, -8], [19, -8], [19, -4], [26, -4], [26, 4], [-14, 4], [-14, 7], [-26, 7]], 2),
      bow: ptsCircle(8, 12),
    }),
    detail(ctx, g, boilPath) {
      ctx.save(); ctx.translate(-20, 0); boilPath(g.bow, 40); ctx.stroke(); ctx.restore();
    },
  });

  def('lighter', {
    label: 'a lighter', mat: 'plastic', passSize: 16,
    make: RECT(20, 34),
    geom: () => ({ outline: ptsRRect(20, 34, 4) }),
    detail(ctx) {
      ctx.beginPath(); ctx.moveTo(-10, -11); ctx.lineTo(10, -11); ctx.stroke();
      ctx.beginPath(); ctx.arc(3, -14, 3.5, 0, Math.PI * 2); ctx.stroke();
    },
  });

  def('letter', {
    label: 'the letter', mat: 'paper', passSize: 18,
    make: RECT(44, 30, { density: 0.0009 }),
    geom: () => ({ outline: ptsRRect(44, 30, 2) }),
    detail(ctx) {
      ctx.beginPath(); ctx.moveTo(-22, -2); ctx.lineTo(22, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, 6); ctx.lineTo(12, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, 10); ctx.lineTo(6, 10); ctx.stroke();
    },
  });

  def('note', {
    label: 'a folded note', mat: 'paper', passSize: 18,
    make: RECT(40, 28, { density: 0.0009 }),
    geom: () => ({ outline: ptsRRect(40, 28, 2) }),
    detail(ctx) { ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke(); },
  });

  def('receipt', {
    label: 'a receipt', mat: 'paper', passSize: 12,
    make: RECT(24, 54, { density: 0.0007, frictionAir: 0.03 }),
    geom: r => ({ outline: subdiv([[-12, -27], [12, -27], [10, -9], [12, 9], [10, 27], [-12, 27], [-10, 9], [-12, -9]], 2), n: SH.ri(r, 3, 5) }),
    detail(ctx, g) {
      for (let i = 0; i < g.n; i++) { const y = -18 + i * 9; ctx.beginPath(); ctx.moveTo(-7, y); ctx.lineTo(7, y); ctx.stroke(); }
    },
  });

  def('ring', {
    label: 'the ring', mat: 'gold', passSize: 8,
    make: CIRC(9, { density: 0.006, restitution: 0.4 }),
    geom: () => ({ outline: ptsCircle(9, 16), inner: ptsCircle(5.5, 12) }),
    detail(ctx, g, boilPath) { boilPath(g.inner, 90); ctx.stroke(); },
  });

  def('ringbox', {
    label: 'a small box', mat: 'cloth', passSize: 22,
    make: RECT(34, 30, { density: 0.0025 }),
    geom: () => ({ outline: ptsRRect(34, 30, 6) }),
    detail(ctx) { ctx.beginPath(); ctx.moveTo(-17, -4); ctx.lineTo(17, -4); ctx.stroke(); },
  });

  def('ticket', {
    label: 'the ticket', mat: 'paper', passSize: 16,
    make: RECT(46, 26, { density: 0.0009 }),
    geom: () => ({ outline: ptsRRect(46, 26, 2) }),
    detail(ctx) {
      ctx.beginPath(); ctx.moveTo(10, -13); ctx.lineTo(10, 13); ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(-18, -3); ctx.lineTo(2, -3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-18, 3); ctx.lineTo(-4, 3); ctx.stroke();
    },
  });

  def('busticket', {
    label: 'a bus ticket', mat: 'paper', passSize: 14,
    make: RECT(36, 20, { density: 0.0008 }),
    geom: () => ({ outline: ptsRRect(36, 20, 2) }),
    detail(ctx) { ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke(); },
  });

  def('pick', {
    label: 'a guitar pick', mat: 'plastic', passSize: 9,
    make: (x, y) => Bodies.polygon(x, y, 3, 13, { friction: 0.4, frictionAir: 0.015, restitution: 0.25, density: 0.0012 }),
    geom: () => ({ outline: subdiv([[13, 0], [-6.5, 11.3], [-6.5, -11.3]], 6) }),
    detail(ctx, g, boilPath, it) {
      if (it.opts && it.opts.lucky) { ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke(); }
    },
  });

  def('photo', {
    label: 'a photograph', mat: 'paper', passSize: 17,
    make: RECT(38, 30, { density: 0.001 }),
    geom: () => ({ outline: ptsRRect(38, 30, 1.5), inner: ptsRRect(30, 22, 1) }),
    detail(ctx, g, boilPath) {
      boilPath(g.inner, 70); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(-4, 0); ctx.lineTo(0, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 8); ctx.lineTo(6, 1); ctx.lineTo(10, 8); ctx.stroke();
    },
  });

  def('gum', {
    label: 'gum', mat: 'paper', passSize: 12,
    make: RECT(28, 16, { density: 0.001 }),
    geom: () => ({ outline: ptsRRect(28, 16, 3) }),
    detail(ctx) { ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-6, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(6, 8); ctx.stroke(); },
  });

  def('cigpack', {
    label: 'a crumpled packet', mat: 'paper', passSize: 24,
    make: RECT(36, 46, { density: 0.0012 }),
    geom: r => {
      const base = ptsRRect(36, 46, 4);
      // pre-crumple: dent the outline permanently
      const rr = r || Math.random;
      return { outline: base.map(([x, y]) => [x + SH.rf(rr, -2.5, 2.5), y + SH.rf(rr, -2.5, 2.5)]) };
    },
    detail(ctx) {
      ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(4, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -14); ctx.lineTo(-2, 8); ctx.stroke();
    },
  });

  def('treat', {
    label: 'a cat treat', mat: 'organic', passSize: 8,
    make: CIRC(8, { density: 0.001 }),
    geom: () => ({ outline: subdiv([[8, 0], [4, 6], [-3, 7], [-8, 2], [-7, -4], [-1, -8], [6, -5]], 3) }),
    detail() {},
  });

  def('tag', {
    label: 'the collar tag', mat: 'metal', passSize: 10,
    make: CIRC(11, { density: 0.004, restitution: 0.3 }),
    geom: () => ({ outline: ptsCircle(11, 16), hole: ptsCircle(2.5, 8) }),
    detail(ctx, g, boilPath) {
      ctx.save(); ctx.translate(0, -6); boilPath(g.hole, 55); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(5, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(4, 6); ctx.stroke();
    },
  });

  def('stamps', {
    label: 'two stamps', mat: 'paper', passSize: 9,
    make: RECT(20, 16, { density: 0.0007 }),
    geom: () => {
      const p = [];
      const n = 26, hw = 10, hh = 8;
      // perforated edge: scalloped rectangle
      const per = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      const base = subdiv(per, 7);
      for (let i = 0; i < base.length; i++) {
        const [x, y] = base[i];
        const s = (i % 2 === 0) ? 0.9 : 1.08;
        p.push([x * s, y * s]);
      }
      return { outline: p };
    },
    detail(ctx) { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); },
  });

  def('napkin', {
    label: 'a napkin', mat: 'paper', passSize: 16,
    make: RECT(34, 30, { density: 0.0006, frictionAir: 0.03 }),
    geom: r => {
      const rr = r || Math.random;
      const base = ptsRRect(34, 30, 5);
      return { outline: base.map(([x, y]) => [x + SH.rf(rr, -1.5, 1.5), y + SH.rf(rr, -1.5, 1.5)]) };
    },
    detail(ctx) { ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(8, -4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(4, 2); ctx.stroke(); },
  });

  def('bottlecap', {
    label: 'a bottle cap', mat: 'metal', passSize: 10,
    make: CIRC(10, { density: 0.003, restitution: 0.35 }),
    geom: () => {
      const p = [];
      const n = 32;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 10 + ((i % 2) ? -1.4 : 0.6);
        p.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return { outline: p };
    },
    detail(ctx) { ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.stroke(); },
  });

  def('seedpacket', {
    label: 'a seed packet', mat: 'paper', passSize: 18,
    make: RECT(30, 40, { density: 0.0008 }),
    geom: () => ({ outline: ptsRRect(30, 40, 2) }),
    detail(ctx) {
      ctx.beginPath(); ctx.arc(0, -4, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, 14); ctx.stroke();
    },
  });

  def('sachet', {
    label: 'a sugar sachet', mat: 'paper', passSize: 11,
    make: RECT(24, 16, { density: 0.0008 }),
    geom: () => ({ outline: ptsRRect(24, 16, 2) }),
    detail(ctx) { ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-12, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(12, 8); ctx.stroke(); },
  });

  def('eraser', {
    label: 'an eraser', mat: 'plastic', passSize: 12,
    make: RECT(26, 14, { density: 0.0015, friction: 0.7, restitution: 0.05 }),
    geom: () => ({ outline: ptsRRect(26, 14, 4) }),
    detail() {},
  });

  def('usb', {
    label: 'a usb stick', mat: 'plastic', passSize: 12,
    make: RECT(28, 12, { density: 0.002 }),
    geom: () => ({ outline: subdiv([[-14, -6], [6, -6], [6, -4], [14, -4], [14, 4], [6, 4], [6, 6], [-14, 6]], 2) }),
    detail(ctx) { ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(14, 0); ctx.stroke(); },
  });

  def('pencap', {
    label: 'a pen cap', mat: 'plastic', passSize: 10,
    make: RECT(9, 30, { density: 0.0012 }),
    geom: () => ({ outline: subdiv([[-4.5, -15], [4.5, -15], [4.5, 12], [0, 15], [-4.5, 12]], 3) }),
    detail(ctx) { ctx.beginPath(); ctx.moveTo(4.5, -12); ctx.lineTo(8, 2); ctx.stroke(); },
  });

  def('twine', {
    label: 'a length of twine', mat: 'organic', passSize: 14,
    make: CIRC(12, { density: 0.0008, frictionAir: 0.02 }),
    geom: r => {
      const rr = r || Math.random;
      const p = [];
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        p.push([Math.cos(a) * (11 + SH.rf(rr, -2, 2)), Math.sin(a) * (10 + SH.rf(rr, -2, 2))]);
      }
      return { outline: p };
    },
    detail(ctx) {
      ctx.beginPath(); ctx.arc(0, 0, 7, 0.5, 2.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(1, 1, 4, 2.8, 5.2); ctx.stroke();
    },
  });

  def('earbuds', {
    label: 'the earbuds', mat: 'plastic', passSize: 999, chain: true,
    make: null, geom: () => ({}), detail() {},
  });

  /* ---------- lore: what a thing is, and what it betrays ---------- */
  const LORE = {
    coin:       { desc: 'cold, round, honest. money for small errands.', read: 'they pay with coins. coin people are either careful or broke — often both.' },
    key:        { desc: 'brass, worn smooth from years of use.', read: 'keys only ride in pockets while they still open something. this one still does. watch it.' },
    lighter:    { desc: 'cheap plastic, half full, polished by a thumb.', read: 'a fire they keep choosing to carry. notice how often the fingers visit it.' },
    letter:     { desc: 'folded four times. the folds are soft — it has been carried for weeks.', read: 'words that were never sent, in very careful handwriting. the heaviest kind of paper there is.' },
    note:       { desc: 'a scrap of paper, folded once, pressed flat.', read: 'people write lists when they want life to feel tidier.' },
    receipt:    { desc: 'shop paper, already fading.', read: 'one coffee. always just one. people with someone waiting at home buy two.' },
    ring:       { desc: 'gold. a size that is not theirs.', read: 'not worn — carried. that means a question is being practised. keep this one where you can see it.' },
    ringbox:    { desc: 'a small velvet box, lighter than it looks.', read: 'boxes like this hold exactly one future.' },
    ticket:     { desc: 'one way. 06:12, friday. checked and checked again.', read: 'a return ticket is a habit. a one-way ticket is a decision. this is a decision.' },
    busticket:  { desc: 'creased, stamped twice.', read: 'the same route, over and over. some place in this city keeps pulling them back.' },
    pick:       { desc: 'a guitar pick, worn dull at the tip.', read: 'worn picks belong to players who really play. there are a thousand songs in this one.' },
    photo:      { desc: 'two people on a wall, squinting at an old sun.', read: 'photos in frames are finished stories. photos in pockets are not. this one rides in a pocket.' },
    gum:        { desc: 'mint. the serious kind.', read: 'gum turns up in pockets when something else is being given up.' },
    cigpack:    { desc: 'crushed — on purpose, by a whole fist.', read: 'crushed, but not thrown away. kept. a trophy or a temptation — same shape either way.' },
    treat:      { desc: 'fish-shaped. smelly. slightly furry now.', read: 'somebody small and whiskered has opinions about this person.' },
    tag:        { desc: 'an engraved pet tag. a name, and a phone number.', read: 'the number is not theirs. the cat, right now, is. this tag is a decision waiting to happen.' },
    stamps:     { desc: 'two stamps, bought one at a time, kept flat.', read: 'you don’t buy stamps unless a letter is nearly brave enough to go.' },
    napkin:     { desc: 'folded twice. the pen pressed hard.', read: 'a phone number on a napkin is a door left open.' },
    bottlecap:  { desc: 'bent once, kept anyway.', read: 'souvenirs from good nights last longer than the nights.' },
    seedpacket: { desc: 'marigold seeds. half the packet gone.', read: 'people who plant things expect to still be here when they grow. patient people.' },
    sachet:     { desc: 'brown sugar, a little stuck together.', read: 'a bit of borrowed sweetness from a counter they stand behind all day.' },
    eraser:     { desc: 'worn perfectly round.', read: 'someone here still fixes their mistakes by hand.' },
    usb:        { desc: 'eight gigabytes of maybe.', read: 'it holds everything or nothing. they never check which.' },
    pencap:     { desc: 'chewed. thoughtfully.', read: 'thinkers chew. the pen itself is long gone; the thinking carried on.' },
    twine:      { desc: 'green garden string, about a hand long.', read: 'people who carry string believe things can be held together.' },
    earbuds:    { desc: 'self-tangling, like all cords.', read: 'the knots are a diary of every restless hour.' },
  };
  /* what the same things confess under moonlight — a second layer,
     only readable when the coat hangs and the light turns blue */
  const NIGHT = {
    coin:       'it landed tails up. they would call that unlucky — and keep it anyway.',
    key:        'it stays warm long after the hand is gone. doors miss people too.',
    lighter:    'shake it: nearly empty. so is the reason for keeping it.',
    letter:     'held up to the moon, one line shows through the paper: “i should have said this years ago.”',
    note:       'on the back, fainter: a name, crossed out twice.',
    receipt:    'on the back, a doodle — two stick people under one umbrella.',
    ring:       'inside the band there is already an engraving: a date, eight months from now.',
    ringbox:    'the velvet is worn at one corner. opened and shut a hundred nervous times.',
    ticket:     'the fold runs right through the word “depart”.',
    busticket:  'route 9. the last stop is the sea.',
    pick:       'tooth-marks along the flat edge. stage fright, chewed on.',
    photo:      'look closer: a third shadow at the edge. someone held the camera. someone always does.',
    gum:        'the packet is nearly finished. counting pieces is how they count the days.',
    cigpack:    'one cigarette left inside. kept, like a question they don’t want answered.',
    treat:      'crumbs deep in my seams. this is not the first pocketful. the cat has a routine now.',
    tag:        'moonlight comes through the little hole and makes a tiny zero on the fabric. that number still answers.',
    stamps:     'second class. they are not in a hurry — they are scared.',
    napkin:     'under the number, pressed hard then given up: half the first letter of a name.',
    bottlecap:  'the underside says WINNER. some prizes are private.',
    seedpacket: '“plant by late spring,” it says. they are already late. they will plant anyway.',
    sachet:     'not stolen — counted. exactly one a day. a tiny theft everyone allows.',
    eraser:     'it smells like a classroom that closed twenty years ago.',
    usb:        'a peeling label: “…final_FINAL_v3”. some old files are better left alone.',
    pencap:     'the clip is snapped off. fidgeted past saving.',
    twine:      'knotted at one end to remember something. the something is forgotten. the knot still tries.',
    earbuds:    'at night the tangle loosens itself, just a little. even knots rest.',
  };
  for (const t in LORE) if (DEFS[t]) Object.assign(DEFS[t], LORE[t]);
  for (const t in NIGHT) if (DEFS[t]) DEFS[t].night = NIGHT[t];

  /* ---------- factory ---------- */
  let nextId = 1;
  SH.makeItem = function (world, type, x, y, rng, opts) {
    const d = DEFS[type];
    if (!d) return null;
    const it = {
      id: nextId++, type, label: d.label, mat: d.mat, passSize: d.passSize,
      fate: 'in-pocket', opts: opts || {}, seedv: SH.rf(rng, 0, 100),
      geom: d.geom(rng), def: d,
    };
    if (d.chain) {
      // earbud cord: chain of links with a bud at each end
      const links = [];
      const n = 12;
      const group = Body.nextGroup(true);
      for (let i = 0; i < n; i++) {
        const r = (i === 0 || i === n - 1) ? 7 : 3.5;
        const b = Bodies.circle(x + (i - n / 2) * 8, y, r, {
          friction: 0.3, frictionAir: 0.03, restitution: 0.1,
          density: (i === 0 || i === n - 1) ? 0.002 : 0.0008,
          collisionFilter: { group },
        });
        b.plugin.item = it;
        links.push(b);
        Composite.add(world, b);
      }
      for (let i = 0; i < n - 1; i++) {
        Composite.add(world, Constraint.create({
          bodyA: links[i], bodyB: links[i + 1],
          length: 9, stiffness: 0.9, damping: 0.1,
        }));
      }
      it.bodies = links;
      it.body = links[0];
    } else {
      const b = d.make(x, y);
      b.plugin.item = it;
      Body.setAngularVelocity(b, SH.rf(rng, -0.15, 0.15));
      Body.setVelocity(b, { x: SH.rf(rng, -1.5, 1.5), y: SH.rf(rng, 0.5, 2) });
      Composite.add(world, b);
      it.body = b;
    }
    return it;
  };
})();
