/* SECOND HAND — state machine, day scheduler, sound, and UI glue. */
(function () {
  'use strict';
  const SH = window.SH;
  const { ri, rf, pick } = SH;

  /* ---------------- schedule templates: a day in the life, by occupation ---------------- */
  const SCHED = {
    office:    [['still', 6, 10], ['walk', 10, 14], ['bus', 10, 14], ['sit', 14, 20], ['walk', 6, 9], ['sit', 10, 16], ['walk', 8, 12], ['night', 17, 23]],
    barista:   [['walk', 8, 12], ['brisk', 10, 14], ['still', 8, 12], ['walk', 8, 10], ['sit', 8, 12], ['walk', 6, 10], ['night', 17, 23]],
    courier:   [['brisk', 8, 12], ['run', 8, 12], ['sit', 4, 7], ['run', 10, 14], ['walk', 6, 10], ['sit', 6, 10], ['night', 16, 21]],
    student:   [['run', 5, 8], ['bus', 8, 12], ['sit', 16, 22], ['walk', 6, 9], ['sit', 10, 14], ['walk', 8, 12], ['night', 17, 23]],
    bartender: [['sit', 8, 12], ['walk', 8, 12], ['still', 10, 14], ['brisk', 8, 12], ['walk', 10, 14], ['night', 16, 21]],
    gardener:  [['walk', 8, 12], ['still', 10, 14], ['walk', 8, 12], ['sit', 6, 10], ['brisk', 6, 10], ['still', 8, 12], ['night', 16, 21]],
    nurse:     [['night', 14, 18], ['walk', 6, 9], ['bus', 8, 10], ['still', 12, 16], ['brisk', 8, 12], ['still', 8, 12], ['night', 14, 18]],
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
      /* a-minor, slow synth pads, walking bass, distant horn — a case file in 1984 */
      const t = this.ctx.currentTime, n = this.noirN++;
      const CHORDS = [ // Am, F, Dm, E — the oldest sad story in music
        [110, 130.81, 164.81],
        [87.31, 110, 130.81],
        [73.42, 87.31, 110],
        [82.41, 103.83, 123.47],
      ];
      const ci = (n / 8 | 0) % 4;
      if (n % 8 === 0) { // detuned saw pad, one chord per bar — the VHS fog
        for (const f of CHORDS[ci]) {
          for (const det of [-4, 4]) {
            const o = this.ctx.createOscillator(); o.type = 'sawtooth';
            o.frequency.value = f * Math.pow(2, det / 1200) * 2;
            const g2 = this.ctx.createGain();
            g2.gain.setValueAtTime(0, t);
            g2.gain.linearRampToValueAtTime(0.0055, t + 1.4);
            g2.gain.setValueAtTime(0.0055, t + 4);
            g2.gain.linearRampToValueAtTime(0, t + 5.8);
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.8;
            o.connect(g2); g2.connect(lp); lp.connect(this.master);
            o.start(t); o.stop(t + 6);
          }
        }
      }
      if (n % 2 === 0) { // pizzicato bass walking inside the chord
        const ch = CHORDS[ci];
        const f = ch[[0, 2, 1, 2][(n / 2 | 0) % 4]];
        const o = this.ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = f;
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.11, t);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
        o.connect(g2); g2.connect(lp); lp.connect(this.master);
        o.start(t); o.stop(t + 1.2);
      }
      if (Math.random() < 0.09) { // the horn on the wet street, strictly minor
        const o = this.ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = [220, 261.63, 293.66, 329.63][Math.random() * 4 | 0];
        const v = this.ctx.createOscillator(); v.frequency.value = 4.8;
        const vg = this.ctx.createGain(); vg.gain.value = 4;
        v.connect(vg); vg.connect(o.frequency);
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.014, t + 0.7);
        g2.gain.linearRampToValueAtTime(0, t + 3.1);
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850;
        o.connect(g2); g2.connect(lp); lp.connect(this.master);
        o.start(t); o.stop(t + 3.2); v.start(t); v.stop(t + 3.2);
      }
      if (Math.random() < 0.5) this.noiseHit(0.004, 3200, 0.02); // vinyl dust
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
        if (g && g.impact && narrate.mendDay !== dayIdx) {
          narrate.mendDay = dayIdx;
          g.impact.push('day ' + (dayIdx + 1) + ': you stitched the hole tighter.');
        }
        break;
      case 'gone':
        toast(ev.label + ' — gone. through the hole, into the world.');
        if (g && g.impact) g.impact.push('day ' + (dayIdx + 1) + ': the hole took ' + ev.label + '.');
        break;
      case 'handStart':
        if (tut.need('hand'))
          toast('the fingers. they are hunting something — help them find it, or hide it. both change the story.', true, 7000);
        else if (ev.ev.minor) toast('the fingers, counting bus money.');
        else if (ev.ev.action === 'give') toast('the fingers bring something down.');
        else {
          const d = SH.ITEM_DEFS[ev.ev.seek];
          toast('the fingers are hunting: ' + (d ? d.label : 'something') + '.');
          if (!narrate.hideHinted) {
            narrate.hideHinted = true;
            setTimeout(() => toast('(to hide it: drag it into the dark corner, low on the left.)', true, 6000), 4500);
          }
        }
        break;
      case 'handEnd': {
        if (demo.active) { demo.flags.handResult = ev.result; break; }
        const m = ev.ev.minor;
        if (ev.result === 'took') {
          toast(m ? 'bus money found. the day moves on.' : 'they found ' + ev.label + '. it goes up into the light.');
          if (!m && g.impact) g.impact.push('day ' + (dayIdx + 1) + ': the fingers found ' + ev.label + '.');
        } else if (ev.result === 'miss') {
          // was it hidden? tell the player their trick worked.
          const buried = g.items.some(it => it.type === ev.ev.seek && it.fate === 'in-pocket' && SH.Sim.isHidden(it));
          if (m) toast('no coin to be found. a small sigh from above.');
          else if (buried) toast('the fingers searched and searched. ' + ev.label + ' stayed buried in the dark corner. your doing.');
          else toast('they came up empty. that changes things.');
          if (!m && g.impact) g.impact.push('day ' + (dayIdx + 1) + ': the fingers hunted ' + ev.label + ' and left with nothing.' + (buried ? ' you hid it.' : ''));
        }
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
    const isNight = SH.Sim.lightCol === 'blue';
    let freshNight = false;
    if (isNight && it.def.night && !g.journalNight[it.type]) {
      g.journalNight[it.type] = true;
      freshNight = true;
    }
    $('exam').querySelector('.xname').textContent = it.label;
    $('exam').querySelector('.xdesc').textContent = it.def.desc;
    $('exam').querySelector('.xread').textContent = it.def.read;
    const xn = $('exam').querySelector('.xnight');
    if (g.journalNight[it.type] && it.def.night) {
      xn.textContent = it.def.night;
      xn.className = 'xnight';
    } else if (it.def.night) {
      xn.textContent = '(there is more. ask again at night.)';
      xn.className = 'xnight hint';
    } else {
      xn.textContent = '';
    }
    $('exam').classList.add('on');
    clearTimeout(examTimer);
    examTimer = setTimeout(() => $('exam').classList.remove('on'), 7000);
    if (freshNight) {
      toast('a confession, by moonlight. the pocket book keeps it.');
      Audio2.blip(392, 0.6, 0.03, 'sine');
    } else if (fresh) {
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
    html += '<div class="jentry">the walk: <i>' + g.motion.label + '</i> <span class="junk">(watch the top-left label — how do they move through a day?)</span></div>';
    const workKnown = g.occ.filler.some(t => g.journal[t]);
    html += '<div class="jentry">the work: <i>' + (workKnown ? g.occ.line : 'unknown. examine the things their job drops in.') + '</i></div>';
    const key = g.arc.keyType;
    if (g.journal[key]) html += '<div class="jentry">the matter at hand: <i>' + SH.ITEM_DEFS[key].read + '</i></div>';
    else html += '<div class="jentry junk">the matter at hand: not worked out yet.</div>';

    // the suspect board
    html += '<h3>who might they be?</h3>';
    html += '<div class="jentry junk" style="margin-bottom:10px">one of these four is them. use the evidence. you answer at the end of the week.</div>';
    for (const s of g.suspects) {
      const struck = g.suspectStruck[s.id], picked = g.suspectPick === s.id;
      html += '<div class="sus' + (struck ? ' out' : '') + (picked ? ' pick' : '') + '" data-sid="' + s.id + '">' +
        '<div class="susname">' + s.name + (picked ? ' — your pick' : '') + '</div>' +
        '<div class="susblurb">' + s.blurb + '</div>' +
        '<div class="susbtns">' +
        '<span class="susbtn" data-act="pick" data-sid="' + s.id + '">' + (picked ? 'unpick' : 'this is them') + '</span>' +
        '<span class="susbtn" data-act="strike" data-sid="' + s.id + '">' + (struck ? 'un-rule out' : 'rule out') + '</span>' +
        '</div></div>';
    }
    html += '<h3>what changed because of you</h3>';
    if (g.impact && g.impact.length) {
      for (const line of g.impact.slice(-8)) html += '<div class="jentry"><i>' + line + '</i></div>';
    } else {
      html += '<div class="jentry junk">nothing yet. the week is watching.</div>';
    }
    html += '<h3>evidence</h3>';
    const seenT = {}; let unexamined = 0, any = false;
    for (const it of g.items) {
      if (seenT[it.type]) continue;
      seenT[it.type] = 1;
      if (g.journal[it.type]) {
        any = true;
        const gone = it.fate !== 'in-pocket' && !g.items.some(o => o.type === it.type && o.fate === 'in-pocket');
        let extra = '';
        if (g.journalNight[it.type] && it.def.night) extra = '<br><span class="jn">' + it.def.night + '</span>';
        else if (it.def.night && !gone) extra = '<br><span class="jnh">(more at night. things confess in the dark.)</span>';
        html += '<div class="jentry"><b>' + it.label + '</b>' + (gone ? ' <i>(no longer with us)</i>' : '') +
          ' — ' + it.def.desc + '<br><i>' + it.def.read + '</i>' + extra + '</div>';
      } else if (it.fate === 'in-pocket') unexamined++;
    }
    if (unexamined) html += '<div class="jentry junk">' + unexamined + ' thing' + (unexamined > 1 ? 's' : '') + ' still unexamined, down in the dark.</div>';
    if (!any && !unexamined) html += '<div class="jentry junk">nothing yet. the pocket is young.</div>';
    $('jwrap').innerHTML = html;
    // wire the suspect buttons
    for (const b of $('jwrap').querySelectorAll('.susbtn')) {
      b.addEventListener('click', () => {
        const sid = +b.dataset.sid;
        if (b.dataset.act === 'pick') {
          g.suspectPick = (g.suspectPick === sid) ? null : sid;
          delete g.suspectStruck[sid];
        } else {
          g.suspectStruck[sid] = !g.suspectStruck[sid];
          if (g.suspectPick === sid) g.suspectPick = null;
        }
        buildJournal();
      });
    }
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

  /* ---------------- voice: the pocket reads its own diary ---------------- */
  const Voice = {
    on: localStorage.getItem('sh_voice') !== '0',
    voice: null,
    pickVoice() {
      if (this.voice || !window.speechSynthesis) return;
      const vs = speechSynthesis.getVoices();
      // prefer the neural "Natural"/"Online" voices (Edge ships excellent ones)
      this.voice =
        vs.find(v => /en-GB/i.test(v.lang) && /natural|online/i.test(v.name) && /ryan|thomas|male/i.test(v.name)) ||
        vs.find(v => /en-GB/i.test(v.lang) && /natural|online/i.test(v.name)) ||
        vs.find(v => /^en/i.test(v.lang) && /natural|online/i.test(v.name)) ||
        vs.find(v => /en-GB/i.test(v.lang)) ||
        vs.find(v => /^en/i.test(v.lang)) || null;
      this.natural = !!(this.voice && /natural|online/i.test(this.voice.name));
    },
    speak(text) {
      if (!this.on || !window.speechSynthesis) return;
      try {
        speechSynthesis.cancel();
        this.pickVoice();
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        // neural voices sound best untouched; only slow the robotic fallbacks
        u.rate = this.natural ? 0.95 : 0.88;
        u.pitch = this.natural ? 1.0 : 0.9;
        u.volume = 0.9;
        speechSynthesis.speak(u);
      } catch (e) {}
    },
    stop() { try { speechSynthesis.cancel(); } catch (e) {} },
    toggle() {
      this.on = !this.on;
      localStorage.setItem('sh_voice', this.on ? '1' : '0');
      if (!this.on) this.stop();
      $('voicebtn').textContent = 'voice: ' + (this.on ? 'on' : 'off');
    },
  };
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => Voice.pickVoice();

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
    Voice.speak(lines.join(' ')); // just the story — not the date stamp
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
      Voice.stop();
      onGo();
    };
    cardEl.addEventListener('click', advance);
  }

  /* ---------------- the practice pocket: a guided sandbox ---------------- */
  const demo = { active: false, step: -1, t: 0, flags: {}, base: 0, saveT: 0 };

  function demoText(msg) {
    $('tuttext').textContent = msg;
    $('tutbar').classList.add('on');
  }

  const DEMO_STEPS = [
    {
      text: 'this is the inside of a coat pocket. things fall in. here comes one now.',
      enter() { SH.Sim.spawnItem('coin'); },
      done() { return demo.t > 3.5; },
    },
    {
      text: 'drag slowly across the coin to nudge it around. right now the owner is still, so you are strong.',
      enter() { demo.base = SH.Sim.nudgeCount || 0; },
      done() { return (SH.Sim.nudgeCount || 0) - demo.base > 20; },
    },
    {
      text: 'good. now click the coin — one short, gentle tap — to examine it.',
      done() { return !!g.journal.coin; },
    },
    {
      text: 'everything you examine is logged. open the pocket book (top right), have a read, then close it.',
      done() { return demo.flags.jopen && demo.flags.jclosed; },
    },
    {
      text: 'the lower-right seam has a hole. something small is drifting toward it — drag it to safety before it works through.',
      enter() {
        SH.Sim.holeR = 12;
        demoDropTreat();
      },
      done(dt) {
        const t = g.items.find(i => i.type === 'treat');
        if (!t) return false;
        if (t.fate === 'lost') {
          toast('gone. that is also how it goes. here — another.');
          demoDropTreat();
          return false;
        }
        if (t.body && Math.hypot(t.body.position.x - SH.Sim.holeC.x, t.body.position.y - SH.Sim.holeC.y) > 150) {
          demo.saveT += dt;
          if (demo.saveT > 1.2) return true;
        } else demo.saveT = 0;
        return false;
      },
    },
    {
      text: 'saved. now rub back and forth across the hole itself — you can stitch it tighter for a while.',
      enter() { demo.base = SH.Sim.mend; },
      done() { return SH.Sim.mend > 0.4; },
    },
    {
      text: 'listen — the fingers are coming down for that coin. leave it findable, or drag it into the dark lint corner, low on the left — they never search there.',
      enter() {
        if (!g.items.some(i => i.type === 'coin' && i.fate === 'in-pocket')) SH.Sim.spawnItem('coin');
        SH.Sim.hands = [{ f: (SH.Sim.t + 2.5) / SH.Sim.dur, seek: 'coin', action: 'take', minor: true }];
        SH.Sim.hi = 0;
        demo.flags.handResult = null;
      },
      done() { return !!demo.flags.handResult; },
      after() {
        toast(demo.flags.handResult === 'took'
          ? 'they found it. sometimes that is the kind thing.'
          : 'they came up empty. you just changed a tiny story.');
      },
    },
    {
      text: 'night falls. the light turns blue, and things confess more in the dark — examine something again.',
      enter() {
        SH.Sim.segments[0].act = 'night';
        SH.Sim.setSeg(0);
        if (!g.items.some(i => i.fate === 'in-pocket' && !i.def.chain)) SH.Sim.spawnItem('coin');
      },
      done() { return Object.keys(g.journalNight).length > 0; },
    },
    {
      text: 'that is everything. the real pocket has a person attached — seven days of them, and only one of you.',
      done() { return demo.t > 5; },
    },
  ];

  function demoDropTreat() {
    const it = SH.Sim.spawnItem('treat');
    if (it && it.body) {
      Matter.Body.setPosition(it.body, { x: SH.Sim.holeC.x - 55, y: SH.Sim.holeC.y - 90 });
      Matter.Body.setVelocity(it.body, { x: 1.6, y: 1.2 });
    }
    demo.saveT = 0;
  }

  function startDemo() {
    Audio2.init();
    Audio2.stopNoir();
    tut.fresh = false; tut.finish(); // the practice replaces the drip-feed hints
    g = SH.generateStranger(777);
    g.journal = {}; g.journalNight = {};
    SH.Sim.init(g);
    SH.Sim.startDay({ drops: [], hands: [], mods: {} }, 2, [{ act: 'still', dur: 9999 }], 9999);
    SH.Render.makeTextures(g);
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('daylabel').textContent = 'the practice pocket';
    $('actlabel').textContent = '';
    $('seedtag').textContent = '';
    state = 'demo';
    demo.active = true; demo.step = -1; demo.t = 0; demo.flags = {};
    nextDemoStep();
  }

  function nextDemoStep() {
    const prev = DEMO_STEPS[demo.step];
    if (prev && prev.after) prev.after();
    demo.step++;
    demo.t = 0;
    if (demo.step >= DEMO_STEPS.length) { endDemo(); return; }
    const s = DEMO_STEPS[demo.step];
    demoText(s.text);
    if (s.enter) s.enter();
  }

  function endDemo() {
    demo.active = false;
    $('tutbar').classList.remove('on');
    $('hud').classList.add('hidden');
    $('exam').classList.remove('on');
    $('title').classList.remove('hidden');
    state = 'title';
    g = null;
  }

  function demoTick(dt) {
    demo.t += dt;
    const s = DEMO_STEPS[demo.step];
    if (s && s.done(dt)) nextDemoStep();
  }

  /* ---------------- game flow ---------------- */
  function newGame(seed, inherit) {
    g = SH.generateStranger(seed);
    g.journal = {};
    g.journalNight = {};
    g.impact = [];
    g.inherit = inherit || null;
    narrate.mendDay = -1; narrate.hideHinted = false;
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
    // an inherited coat: the last stranger's leavings are already inside
    if (dayIdx === 0 && g.inherit) {
      resolved.lines.unshift(
        'new hands chose me off the rail today: ' + g.inherit.owner + '.',
        'the last one’s things are still in me. everything gets inherited eventually.');
      for (const t of g.inherit.types.slice(0, 6))
        resolved.drops.push({ f: SH.rf(g.rng, .05, .5), type: t });
      resolved.drops.sort((a, b) => a.f - b.f);
    }
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
    // seven days done → first, the reading of the stranger
    state = 'guess';
    $('hud').classList.add('hidden');
    showGuess();
  }

  /* the deduction: pick your suspect from the lineup */
  function showGuess() {
    const box = $('gsuspects');
    box.innerHTML = '';
    g.finalPick = (g.suspectPick !== null && !g.suspectStruck[g.suspectPick]) ? g.suspectPick : null;
    for (const s of g.suspects) {
      const b = document.createElement('button');
      b.className = 'gopt' + (g.finalPick === s.id ? ' sel' : '') + (g.suspectStruck[s.id] ? ' struck' : '');
      b.innerHTML = '<b>' + s.name + '</b> — ' + s.blurb;
      b.addEventListener('click', () => {
        g.finalPick = s.id;
        for (const c of box.children) c.classList.remove('sel');
        b.classList.add('sel');
        $('guessgo').disabled = false;
      });
      box.appendChild(b);
    }
    $('guessgo').disabled = g.finalPick === null;
    $('guess').classList.remove('hidden');
  }

  $('guessgo').addEventListener('click', () => {
    $('guess').classList.add('hidden');
    epiCards = SH.buildEpilogue(g);
    epiIdx = 0;
    state = 'epilogue';
    nextEpi();
  });

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
    // the verdict on your reading of them
    if (g.finalPick !== null && g.finalPick !== undefined) {
      const picked = g.suspects.find(s => s.id === g.finalPick);
      const truth = g.suspects.find(s => s.correct);
      const right = picked && picked.correct;
      const v = document.createElement('div');
      v.style.marginBottom = '18px';
      v.innerHTML =
        'you said it was <b>' + picked.name + '</b> — <span class="' + (right ? 'fate-kept' : 'fate-lost') + '">' +
        (right ? 'and you were right.' : 'but it was ' + truth.name + '.') + '</span><br>' +
        '<i>' + truth.blurb + '</i><br>' +
        '<span style="color:#c9b463">' + (right ? 'you would make a fine pocket.' :
          'strangers keep their secrets. that is fair too.') + '</span>';
      list.appendChild(v);
    }
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
    SH.Sim.gripAt(w.x, w.y);
  });
  window.addEventListener('pointerup', e => {
    // a short, still press is an examination, not a nudge
    if (pdown && downAt && (state === 'day' || state === 'demo') &&
        performance.now() - downAt.t < 320 &&
        Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 9) {
      const w = SH.Render.toWorld(e.clientX, e.clientY);
      examine(SH.Sim.itemAt(w.x, w.y));
    }
    pdown = false; downAt = null;
    SH.Sim.pointer.down = false;
    SH.Sim.releaseGrip();
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

  // the coat never stops: the next stranger IS the person who took it home
  $('followbtn').addEventListener('click', () => {
    const kept = [];
    const seenT = {};
    for (const it of g.items)
      if (it.fate === 'in-pocket' && !seenT[it.type] && !it.def.chain) { seenT[it.type] = 1; kept.push(it.type); }
    const inherit = { owner: g.newOwner, types: kept };
    const nextSeed = SH.hashStr(g.seedId + '->coat') >>> 0;
    $('end').classList.add('hidden');
    dayIdx = 0;
    newGame(nextSeed, inherit);
  });

  $('howtobtn').addEventListener('click', () => $('howto').classList.remove('hidden'));
  $('howtoclose').addEventListener('click', () => $('howto').classList.add('hidden'));

  let jrnPrev = 'day';
  $('jrnbtn').addEventListener('click', () => {
    if (state !== 'day' && state !== 'demo') return;
    jrnPrev = state;
    buildJournal();
    $('journal').classList.remove('hidden');
    state = 'journal'; // the world holds its breath while you read
    if (demo.active) demo.flags.jopen = true;
  });
  $('jrnclose').addEventListener('click', () => {
    $('journal').classList.add('hidden');
    if (state === 'journal') state = jrnPrev;
    if (demo.active && demo.flags.jopen) demo.flags.jclosed = true;
  });

  $('demobtn').addEventListener('click', startDemo);
  $('tutskip').addEventListener('click', endDemo);

  $('voicebtn').textContent = 'voice: ' + (Voice.on ? 'on' : 'off');
  $('voicebtn').addEventListener('click', e => { e.stopPropagation(); Voice.toggle(); });

  // the title hums like the start of a case
  $('title').addEventListener('pointerdown', () => Audio2.startNoir(), { once: true });

  /* ---------------- loop ---------------- */
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if ((state === 'day' || state === 'demo') && g) {
      for (let i = 0; i < timescale; i++) SH.Sim.update(dt);
      for (const ev of SH.Sim.events) { Audio2.handle(ev); narrate(ev); }
      SH.Sim.events.length = 0;
      if (state === 'day' && SH.Sim.done) endOfDay();
      if (state === 'demo') demoTick(dt);
    }
    SH.Render.draw(dt);
  }
  requestAnimationFrame(loop);
})();
