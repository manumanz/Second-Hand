/* SECOND HAND — state machine, day scheduler, sound, and UI glue. */
(function () {
  'use strict';
  const SH = window.SH;
  const { ri, rf, pick } = SH;

  /* ---------------- schedule templates: a day in the life, by occupation ---------------- */
  const SCHED = {
    office:    [['still', 6, 10], ['walk', 10, 14], ['bus', 10, 14], ['sit', 14, 20], ['walk', 6, 9], ['sit', 10, 16], ['walk', 8, 12], ['night', 10, 14]],
    barista:   [['walk', 8, 12], ['brisk', 10, 14], ['still', 8, 12], ['walk', 8, 10], ['sit', 8, 12], ['walk', 6, 10], ['night', 10, 14]],
    courier:   [['brisk', 8, 12], ['run', 8, 12], ['sit', 4, 7], ['run', 10, 14], ['walk', 6, 10], ['sit', 6, 10], ['night', 10, 12]],
    student:   [['run', 5, 8], ['bus', 8, 12], ['sit', 16, 22], ['walk', 6, 9], ['sit', 10, 14], ['walk', 8, 12], ['night', 10, 14]],
    bartender: [['sit', 8, 12], ['walk', 8, 12], ['still', 10, 14], ['brisk', 8, 12], ['walk', 10, 14], ['night', 8, 12]],
    gardener:  [['walk', 8, 12], ['still', 10, 14], ['walk', 8, 12], ['sit', 6, 10], ['brisk', 6, 10], ['still', 8, 12], ['night', 10, 12]],
    nurse:     [['night', 8, 10], ['walk', 6, 9], ['bus', 8, 10], ['still', 12, 16], ['brisk', 8, 12], ['still', 8, 12], ['night', 8, 10]],
  };

  function buildSchedule(g, mods) {
    const r = g.rng;
    let segs = SCHED[g.occ.sched].map(([act, a, b]) => ({ act, dur: rf(r, a, b) }));
    if (mods.perform) {
      segs.splice(1, 1, { act: 'perform', dur: rf(r, 14, 18) });
      segs.splice(3, 0, { act: 'perform', dur: rf(r, 10, 14) });
    }
    if (mods.pace) {
      segs.splice(2, 0, { act: 'pace', dur: rf(r, 8, 12) });
      segs.splice(segs.length - 1, 0, { act: 'pace', dur: rf(r, 6, 10) });
    }
    if (mods.frantic) {
      segs.splice(1, 0, { act: 'pace', dur: rf(r, 8, 11) });
      segs.splice(3, 0, { act: 'brisk', dur: rf(r, 6, 9) });
    }
    if (mods.joy || mods.runjoy) segs.splice(2, 0, { act: 'run', dur: rf(r, 6, 9) });
    if (mods.sprint) segs.unshift({ act: 'run', dur: rf(r, 11, 14) });
    if (mods.heavy) segs.splice(1, 0, { act: 'brisk', dur: rf(r, 8, 12) });
    return segs;
  }

  /* ---------------- muffled sound, all synthesized ---------------- */
  const Audio2 = {
    ctx: null, master: null, muted: false, ambGain: null,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        // pocket ambience: brown noise through a heavy lowpass
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 160;
        this.ambGain = this.ctx.createGain();
        this.ambGain.gain.value = 0.05;
        src.connect(lp).connect(this.ambGain).connect(this.master);
        src.start();
      } catch (e) { /* no sound, no problem */ }
    },
    blip(freq, dur, gain, type) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = type || 'sine'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur);
    },
    noiseHit(gain, freq, dur) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const len = Math.max(1, this.ctx.sampleRate * dur | 0);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq;
      const g = this.ctx.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    },
    /* title-screen noir: walking bass, a distant horn, vinyl dust */
    noirInt: null, noirN: 0,
    startNoir() {
      this.init();
      if (this.noirInt || !this.ctx) return;
      this.noirN = 0;
      this.noirInt = setInterval(() => { if (!this.muted) this.noirStep(); }, 700);
    },
    stopNoir() { if (this.noirInt) { clearInterval(this.noirInt); this.noirInt = null; } },
    noirStep() {
      const t = this.ctx.currentTime, n = this.noirN++;
      const bass = [110, 98, 130.81, 110, 146.83, 123.47, 110, 87.31];
      if (n % 2 === 0) {
        const o = this.ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = bass[(n / 2 | 0) % bass.length];
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.1, t);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        o.connect(g2); g2.connect(lp); lp.connect(this.master);
        o.start(t); o.stop(t + 1);
      }
      if (Math.random() < 0.11) {
        const o = this.ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = [233.08, 261.63, 311.13, 349.23][Math.random() * 4 | 0];
        const v = this.ctx.createOscillator(); v.frequency.value = 5.3;
        const vg = this.ctx.createGain(); vg.gain.value = 3.5;
        v.connect(vg); vg.connect(o.frequency);
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.015, t + 0.55);
        g2.gain.linearRampToValueAtTime(0, t + 2.4);
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        o.connect(g2); g2.connect(lp); lp.connect(this.master);
        o.start(t); o.stop(t + 2.5); v.start(t); v.stop(t + 2.5);
      }
      if (Math.random() < 0.5) this.noiseHit(0.004, 3200, 0.02);
    },
    handle(ev) {
      if (ev.type === 'thump') this.noiseHit(0.16 * ev.mag, 240, 0.07);
      else if (ev.type === 'step') this.noiseHit(0.05 * ev.mag, 130, 0.1);
      else if (ev.type === 'rustle') this.noiseHit(0.05, 900, 0.35);
      else if (ev.type === 'slip') this.noiseHit(0.06, 600, 0.2);
      else if (ev.type === 'gone') this.blip(180, 0.5, 0.05);
    },
  };

  /* ---------------- state ---------------- */
  let g = null, state = 'title', dayIdx = 0, resolved = null;
  let timescale = 1, last = 0, epiCards = [], epiIdx = 0;

  const $ = id => document.getElementById(id);
  const cv = $('cv');
  SH.Render.init(cv);

  /* ---------------- toasts: the pocket reacts out loud ---------------- */
  function toast(msg, hint, holdMs) {
    if (!msg) return;
    const box = $('toasts');
    while (box.children.length >= 2) box.removeChild(box.firstChild);
    const el = document.createElement('div');
    el.className = 'toast' + (hint ? ' hint' : '');
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 700); }, holdMs || 4200);
  }

  const ACTWORDS = {
    still: 'standing still', walk: 'walking', brisk: 'walking fast', run: 'running',
    sit: 'sitting down', bus: 'on the bus', pace: 'pacing, pacing',
    perform: 'singing on the corner', night: 'asleep. the coat hangs.',
  };

  function narrate(ev) {
    switch (ev.type) {
      case 'act':
        $('actlabel').textContent = ACTWORDS[ev.act] || '';
        if (ev.act === 'night' && tut.need('night'))
          toast('night. they are still — this is when you can truly rearrange.', true, 6000);
        break;
      case 'spawn':
        if (tut.need('spawn')) toast('something fell in. click it — once, gently — to examine it for the pocket book.', true, 6500);
        updateJrnBtn();
        break;
      case 'holeNear':
        if (tut.need('hole'))
          toast('the hole has ' + ev.label + '. drag it away, rub the hole to tighten its threads — or let it go.', true, 7000);
        else toast('the hole is working on ' + ev.label + '.');
        break;
      case 'mended':
        if (tut.need('mend')) toast('you pulled the threads tighter. it will not hold forever.', true, 5500);
        break;
      case 'gone':
        toast(ev.label + ' — gone. through the hole, into the world.');
        break;
      case 'handStart':
        if (tut.need('hand'))
          toast('the fingers. they are hunting something — help them find it, or hide it. both change the story.', true, 7000);
        else if (ev.ev.minor) toast('the fingers, counting fare.');
        else if (ev.ev.action === 'give') toast('the fingers bring something down.');
        else {
          const d = SH.ITEM_DEFS[ev.ev.seek];
          toast('the fingers are hunting: ' + (d ? d.label : 'something') + '.');
        }
        break;
      case 'handEnd': {
        const m = ev.ev.minor;
        if (ev.result === 'took') toast(m ? 'fare found. the day moves on.' : 'they found ' + ev.label + '. it goes up into the light.');
        else if (ev.result === 'miss') toast(m ? 'no coin to be found. a small sigh from above.' : 'they came up empty. that changes things.');
        else if (ev.result === 'returned') toast(ev.label + ' — used, and put back.');
        else if (ev.result === 'peeked') toast(ev.label + ' — held, considered, put back.');
        break;
      }
    }
  }

  /* ---------------- examining + the pocket book ---------------- */
  let examTimer = null;
  function examine(it) {
    if (!it || !it.def.desc) return;
    const fresh = !g.journal[it.type];
    g.journal[it.type] = dayIdx + 1;
    $('exam').querySelector('.xname').textContent = it.label;
    $('exam').querySelector('.xdesc').textContent = it.def.desc;
    $('exam').querySelector('.xread').textContent = it.def.read;
    $('exam').classList.add('on');
    clearTimeout(examTimer);
    examTimer = setTimeout(() => $('exam').classList.remove('on'), 7000);
    if (fresh) {
      toast('logged in the pocket book: ' + it.label + '.');
      Audio2.blip(660, 0.25, 0.03, 'triangle');
    }
    updateJrnBtn();
  }

  function updateJrnBtn() {
    if (!g) return;
    const types = {}; let unread = 0;
    for (const it of g.items)
      if (it.fate === 'in-pocket' && !types[it.type]) {
        types[it.type] = 1;
        if (!g.journal[it.type]) unread++;
      }
    $('jrnbtn').textContent = 'pocket book' + (unread ? ' · ' + unread + ' unread' : '');
  }

  function buildJournal() {
    let html = '<h3>the stranger</h3>';
    html += '<div class="jentry">the walk: <i>' + g.motion.label + '</i></div>';
    const workKnown = g.occ.filler.some(t => g.journal[t]) || dayIdx >= 3;
    html += '<div class="jentry">the work: <i>' + (workKnown ? g.occ.line : 'unknown. examine what the job leaves behind.') + '</i></div>';
    const key = g.arc.keyType;
    if (g.journal[key]) html += '<div class="jentry">the matter at hand: <i>' + SH.ITEM_DEFS[key].read + '</i></div>';
    else html += '<div class="jentry junk">the matter at hand: not yet understood.</div>';
    html += '<h3>evidence</h3>';
    const seenT = {}; let unexamined = 0, any = false;
    for (const it of g.items) {
      if (seenT[it.type]) continue;
      seenT[it.type] = 1;
      if (g.journal[it.type]) {
        any = true;
        const gone = it.fate !== 'in-pocket' && !g.items.some(o => o.type === it.type && o.fate === 'in-pocket');
        html += '<div class="jentry"><b>' + it.label + '</b>' + (gone ? ' <i>(no longer with us)</i>' : '') +
          ' — ' + it.def.desc + '<br><i>' + it.def.read + '</i></div>';
      } else if (it.fate === 'in-pocket') unexamined++;
    }
    if (unexamined) html += '<div class="jentry junk">' + unexamined + ' thing' + (unexamined > 1 ? 's' : '') + ' still unexamined, down in the dark.</div>';
    if (!any && !unexamined) html += '<div class="jentry junk">nothing yet. the pocket is young.</div>';
    $('jwrap').innerHTML = html;
  }

  /* first-play tutorial: each hint fires once, remembered across visits */
  const tut = {
    fresh: !localStorage.getItem('sh_tut'),
    shown: {},
    need(key) {
      if (!this.fresh || this.shown[key]) return false;
      this.shown[key] = true;
      return true;
    },
    finish() { try { localStorage.setItem('sh_tut', '1'); } catch (e) {} },
  };

  /* ---------------- overlays ---------------- */
  function showCard(head, lines, onGo) {
    const cardEl = $('card'), headEl = $('cardhead'), linesEl = $('cardlines'), go = $('cardgo');
    headEl.textContent = head;
    linesEl.innerHTML = '';
    go.classList.remove('on');
    const ps = lines.map(l => {
      const p = document.createElement('p');
      p.textContent = l;
      linesEl.appendChild(p);
      return p;
    });
    cardEl.classList.remove('hidden');
    ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 350 + i * 900));
    const readyAt = 350 + ps.length * 900 + 300;
    setTimeout(() => go.classList.add('on'), readyAt);
    let armed = false;
    setTimeout(() => { armed = true; }, readyAt);
    const advance = () => {
      if (!armed) { // impatient click: reveal everything, arm
        ps.forEach(p => p.classList.add('on'));
        go.classList.add('on');
        armed = true;
        return;
      }
      cardEl.classList.add('hidden');
      cardEl.removeEventListener('click', advance);
      onGo();
    };
    cardEl.addEventListener('click', advance);
  }

  /* ---------------- game flow ---------------- */
  function newGame(seed) {
    g = SH.generateStranger(seed);
    g.journal = {};
    SH.Sim.init(g);
    SH.Render.makeTextures(g);
    $('seedtag').textContent = 'stranger no. ' + g.seedId;
    try {
      history.replaceState(null, '', location.pathname + '?seed=' + g.seedId.replace('-', ''));
    } catch (e) {}
    dayIdx = 0;
    startDayCard();
  }

  function startDayCard() {
    state = 'card';
    $('hud').classList.add('hidden');
    resolved = SH.resolveDay(g, dayIdx);
    showCard(resolved.header, resolved.lines, () => {
      const segs = buildSchedule(g, resolved.mods);
      const dur = segs.reduce((s, x) => s + x.dur, 0);
      SH.Sim.startDay(resolved, dayIdx, segs, dur);
      $('daylabel').textContent = resolved.header.toLowerCase();
      $('hud').classList.remove('hidden');
      state = 'day';
      if (dayIdx === 0 && tut.need('drag'))
        setTimeout(() => { if (state === 'day') toast('drag slowly across things to nudge them. you are the gentlest kind of ghost.', true, 6500); }, 2500);
    });
  }

  function endOfDay() {
    if (dayIdx === 0) tut.finish();
    dayIdx++;
    if (dayIdx < 7) { startDayCard(); return; }
    // seven days done → epilogue
    epiCards = SH.buildEpilogue(g);
    epiIdx = 0;
    state = 'epilogue';
    $('hud').classList.add('hidden');
    nextEpi();
  }

  function nextEpi() {
    if (epiIdx >= epiCards.length) { showEnd(); return; }
    const c = epiCards[epiIdx++];
    showCard(c.head, c.lines, nextEpi);
  }

  function showEnd() {
    state = 'end';
    $('endhead').textContent = 'seven days in one pocket';
    $('endseed').textContent = g.seedId;
    const list = $('fatelist');
    list.innerHTML = '';
    const FATE = {
      'in-pocket': ['passed on with the coat', 'fate-kept'],
      'taken': ['taken by the fingers', 'fate-taken'],
      'lost': ['lost to the hole', 'fate-lost'],
    };
    for (const row of SH.buildFates(g)) {
      const f = FATE[row.fate] || ['—', ''];
      const div = document.createElement('div');
      div.innerHTML = row.label + ' — <span class="' + f[1] + '">' + f[0] + '</span>';
      list.appendChild(div);
    }
    $('end').classList.remove('hidden');
  }

  /* ---------------- input ---------------- */
  let pdown = false, downAt = null;
  cv.addEventListener('pointermove', e => {
    const w = SH.Render.toWorld(e.clientX, e.clientY);
    SH.Sim.pointer.worldOK = true;
    SH.Sim.pointerMove(w.x, w.y, pdown);
  });
  cv.addEventListener('pointerdown', e => {
    pdown = true;
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    const w = SH.Render.toWorld(e.clientX, e.clientY);
    SH.Sim.pointerMove(w.x, w.y, true);
  });
  window.addEventListener('pointerup', e => {
    // a short, still press is an examination, not a nudge
    if (pdown && downAt && state === 'day' &&
        performance.now() - downAt.t < 320 &&
        Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 9) {
      const w = SH.Render.toWorld(e.clientX, e.clientY);
      examine(SH.Sim.itemAt(w.x, w.y));
    }
    pdown = false; downAt = null;
    SH.Sim.pointer.down = false;
  });
  cv.addEventListener('pointerleave', () => { SH.Sim.pointer.worldOK = false; });

  const ff = $('ffbtn');
  const setFF = on => { timescale = on ? 4 : 1; ff.classList.toggle('on', on); };
  ff.addEventListener('pointerdown', () => setFF(true));
  window.addEventListener('pointerup', () => setFF(false));
  window.addEventListener('keydown', e => { if (e.code === 'Space') { setFF(true); e.preventDefault(); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') setFF(false); });

  $('mutebtn').addEventListener('click', () => {
    Audio2.muted = !Audio2.muted;
    if (Audio2.ambGain) Audio2.ambGain.gain.value = Audio2.muted ? 0 : 0.05;
    $('mutebtn').textContent = Audio2.muted ? 'sound off' : 'sound on';
  });

  /* ---------------- title ---------------- */
  let rolledSeed = (Math.random() * 0xffffffff) >>> 0;
  const urlSeed = new URLSearchParams(location.search).get('seed');
  if (urlSeed) {
    const s = SH.idToSeed(urlSeed);
    if (s !== null) rolledSeed = s;
  }
  $('seedid').textContent = SH.seedToId(rolledSeed);

  $('beginbtn').addEventListener('click', () => {
    Audio2.init();
    Audio2.stopNoir();
    const typed = $('seedin').value.trim();
    let seed = rolledSeed;
    if (typed) {
      const s = SH.idToSeed(typed);
      seed = (s !== null) ? s : SH.hashStr(typed);
    }
    $('title').classList.add('hidden');
    newGame(seed);
  });

  $('againbtn').addEventListener('click', () => {
    location.href = location.pathname; // fresh stranger, fresh seed
  });

  $('howtobtn').addEventListener('click', () => $('howto').classList.remove('hidden'));
  $('howtoclose').addEventListener('click', () => $('howto').classList.add('hidden'));

  $('jrnbtn').addEventListener('click', () => {
    if (state !== 'day') return;
    buildJournal();
    $('journal').classList.remove('hidden');
    state = 'journal'; // the world holds its breath while you read
  });
  $('jrnclose').addEventListener('click', () => {
    $('journal').classList.add('hidden');
    if (state === 'journal') state = 'day';
  });

  // the title hums like the start of a case
  $('title').addEventListener('pointerdown', () => Audio2.startNoir(), { once: true });

  /* ---------------- loop ---------------- */
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (state === 'day' && g) {
      for (let i = 0; i < timescale; i++) SH.Sim.update(dt);
      for (const ev of SH.Sim.events) { Audio2.handle(ev); narrate(ev); }
      SH.Sim.events.length = 0;
      if (SH.Sim.done) endOfDay();
    }
    SH.Render.draw(dt);
  }
  requestAnimationFrame(loop);
})();
