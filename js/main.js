/* SECOND HAND — state machine, day scheduler, sound, and UI glue. */
(function () {
  'use strict';
  const SH = window.SH;
  const { ri, rf, pick } = SH;

  /* ---------------- schedule templates: a day in the life, by occupation ---------------- */
  const SCHED = {
    office:    [['still', 4, 6], ['walk', 6, 9], ['bus', 6, 9], ['sit', 9, 13], ['walk', 4, 6], ['sit', 6, 10], ['walk', 5, 8], ['night', 12, 16]],
    barista:   [['walk', 5, 8], ['brisk', 6, 9], ['still', 5, 8], ['walk', 5, 7], ['sit', 5, 8], ['walk', 4, 7], ['night', 12, 16]],
    courier:   [['brisk', 5, 8], ['run', 5, 8], ['sit', 3, 5], ['run', 6, 9], ['walk', 4, 7], ['sit', 4, 7], ['night', 11, 14]],
    student:   [['run', 3, 5], ['bus', 5, 8], ['sit', 10, 14], ['walk', 4, 6], ['sit', 6, 9], ['walk', 5, 8], ['night', 12, 16]],
    bartender: [['sit', 5, 8], ['walk', 5, 8], ['still', 6, 9], ['brisk', 5, 8], ['walk', 6, 9], ['night', 11, 14]],
    gardener:  [['walk', 5, 8], ['still', 6, 9], ['walk', 5, 8], ['sit', 4, 7], ['brisk', 4, 7], ['still', 5, 8], ['night', 11, 14]],
    nurse:     [['night', 9, 12], ['walk', 4, 6], ['bus', 5, 7], ['still', 8, 11], ['brisk', 5, 8], ['still', 5, 8], ['night', 9, 12]],
  };

  function buildSchedule(g, mods) {
    const r = g.rng;
    let segs = SCHED[g.occ.sched].map(([act, a, b]) => ({ act, dur: rf(r, a, b) }));
    if (mods.perform) {
      segs.splice(1, 1, { act: 'perform', dur: rf(r, 9, 12) });
      segs.splice(3, 0, { act: 'perform', dur: rf(r, 7, 9) });
    }
    if (mods.pace) {
      segs.splice(2, 0, { act: 'pace', dur: rf(r, 5, 8) });
      segs.splice(segs.length - 1, 0, { act: 'pace', dur: rf(r, 4, 7) });
    }
    if (mods.frantic) {
      segs.splice(1, 0, { act: 'pace', dur: rf(r, 5, 8) });
      segs.splice(3, 0, { act: 'brisk', dur: rf(r, 4, 6) });
    }
    if (mods.joy || mods.runjoy) segs.splice(2, 0, { act: 'run', dur: rf(r, 4, 6) });
    if (mods.sprint) segs.unshift({ act: 'run', dur: rf(r, 8, 10) });
    if (mods.heavy) segs.splice(1, 0, { act: 'brisk', dur: rf(r, 5, 8) });
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
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 700); }, holdMs || 3400);
  }

  /* the stranger's temper: losses make the week rougher and the story colder */
  function bumpMood(n) {
    if (!g) return;
    const before = g.mood || 0;
    g.mood = Math.min(8, before + n);
    if (before < 3 && g.mood >= 3)
      toast('they are starting to distrust this pocket. the steps feel harder already.', true, 6000);
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
        if (tut.need('spawn')) toast('something fell in. press and hold on it, without moving, to examine it for the pocket book.', true, 6500);
        updateJrnBtn();
        break;
      case 'holeNear':
        if (tut.need('hole'))
          toast('the hole has ' + ev.label + '. drag it away, rub the hole to tighten its threads — or let it go.', true, 7000);
        else toast('the hole is working on ' + ev.label + '.');
        break;
      case 'examined':
        examine(ev.it);
        break;
      case 'readingStart':
        if (!narrate.thimbleShown) {
          narrate.thimbleShown = true;
          toast('the thimble takes hold of it, and listens…', true, 3000);
        }
        break;
      case 'reading':
        doReading(ev.it);
        break;
      case 'thimbleSpent':
        toast('the thimble is spent for today. it reads twice a day, no more.');
        break;
      case 'gummed':
        toast('the gum seals the hole shut. it will dry and peel, but for now — peace.');
        if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': you gummed the hole shut.');
        break;
      case 'flame': {
        g.journalNight[ev.target.type] = true;
        examine(ev.target);
        toast('by lighter-light, ' + ev.target.label + ' gives up its secret.' +
          (ev.left > 0 ? '' : ' the lighter is out of fuel.'));
        break;
      }
      case 'crisisWarn':
        toast(ev.crisis === 'wash'
          ? 'wait. that sound. the coat is going in the WASH — save what matters! the corner is dry!'
          : 'the coat is slipping off the chair — everything is about to spill out the mouth! HOLD ON TO THINGS!', true, 3500);
        Audio2.noiseHit(0.12, 400, 0.4);
        break;
      case 'crisisStart':
        $('actlabel').textContent = ev.crisis === 'wash' ? 'THE WASH.' : 'FALLING —';
        break;
      case 'crisisEnd':
        toast(ev.crisis === 'wash'
          ? 'the wash is over. paper remembers water. check the damage.'
          : 'caught by a chair leg. the world rights itself.');
        if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': the coat ' + (ev.crisis === 'wash' ? 'went through the wash.' : 'fell off a chair.'));
        break;
      case 'grubIn':
        toast('something pale just wriggled in. it is heading for the paper. get it OUT.', true, 6000);
        break;
      case 'grubOut':
        toast('the grub sails out through the mouth. good throw.');
        if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': you threw the grub out.');
        break;
      case 'grubEaten':
        toast('the hole ate the grub. the pocket approves of this one loss.');
        if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': you fed the grub to the hole. fair.');
        break;
      case 'chewed':
        toast('the grub is chewing ' + ev.label + '! it will be ruined next time.');
        break;
      case 'mothIn':
        toast('a lint-moth has blown in. it is worth a thread, if you can catch it.');
        break;
      case 'mothGone':
        toast('the moth found the way out. gone.');
        break;
      case 'mothCaught':
        Audio2.blip(990, 0.4, 0.03, 'triangle');
        addThread('the moth, caught');
        break;
      case 'plugged':
        toast(ev.label + ' is lying across the hole. nothing gets past it. remember that trick.', true, 6500);
        break;
      case 'mended':
        if (tut.need('mend')) toast('you pulled the threads tighter. it will not hold forever.', true, 5500);
        if (g && g.impact && narrate.mendDay !== dayIdx) {
          narrate.mendDay = dayIdx;
          g.impact.push('day ' + (dayIdx + 1) + ': you stitched the hole tighter. nothing was lost on your watch.');
        }
        completeTask('mend');
        break;
      case 'gone': {
        const cause = ev.cause || 'hole';
        const CT = {
          hole: ' — gone. through the hole, into the world.',
          wash: ' — ruined in the wash. paper never forgives water.',
          fall: ' — spilled out of the mouth, onto some floor somewhere.',
          grub: ' — eaten. the grub finished it.',
        };
        toast(ev.label + (CT[cause] || CT.hole));
        if (g && g.impact) {
          const key = ev.label === SH.ITEM_DEFS[g.arc.keyType].label;
          const CI = { hole: 'the hole took ', wash: 'the wash ruined ', fall: 'the fall spilled ', grub: 'the grub ate ' };
          g.impact.push('day ' + (dayIdx + 1) + ': ' + (CI[cause] || CI.hole) + ev.label + '.' + (key ? ' the story bent hard.' : ''));
          bumpMood(key ? 3 : 1);
        }
        break;
      }
      case 'handStart':
        if (ev.ev.thief) {
          toast('that hand — that is NOT their hand. it wants the best thing in here. hide it, or feed the thief a coin!', true, 5000);
          Audio2.noiseHit(0.09, 1200, 0.3);
        }
        else if (tut.need('hand'))
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
        if (ev.ev.thief) {
          if (ev.result === 'took') {
            if (ev.label === 'a coin') {
              toast('the thief got a coin and fled. it wanted much more. well played.');
              if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': a pickpocket left with only a coin. your decoy.');
              bumpMood(1);
            } else {
              toast('STOLEN — ' + ev.label + ' is gone with a stranger. the pocket burns.');
              if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': a pickpocket stole ' + ev.label + '. the story bent hard.');
              bumpMood(3);
            }
          } else {
            toast('the thief came up with lint and fled. nothing lost.');
            if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': a pickpocket tried, and failed. your doing.');
          }
          break;
        }
        const m = ev.ev.minor;
        if (ev.result === 'took') {
          toast(m ? 'bus money found. the day moves on.' : 'they found ' + ev.label + '. it goes up into the light.');
          if (m) completeTask('fare');
          else if (g.impact) g.impact.push('day ' + (dayIdx + 1) + ': they found ' + ev.label + ' — and the story went the way they hoped.');
        } else if (ev.result === 'miss') {
          // was it hidden? tell the player their trick worked.
          const buried = g.items.some(it => it.type === ev.ev.seek && it.fate === 'in-pocket' && SH.Sim.isHidden(it));
          if (m) toast('no coin to be found. a small sigh from above.');
          else if (buried) toast('the fingers searched and searched. ' + ev.label + ' stayed buried in the dark corner. your doing.');
          else toast('they came up empty. that changes things.');
          if (!m && g.impact) {
            g.impact.push('day ' + (dayIdx + 1) + ': ' +
              (buried ? 'you hid ' + ev.label + ' from the fingers. the story bent.'
                      : 'the fingers came up empty. the story bent.'));
            bumpMood(2); // they wanted it, and it wasn't there
          }
        }
        else if (ev.result === 'returned') toast(ev.label + ' — used, and put back.');
        else if (ev.result === 'peeked') toast(ev.label + ' — held, considered, put back.');
        if (!m && (ev.result === 'took' || ev.result === 'miss')) addThread('a story moment, decided');
        break;
      }
    }
  }

  /* ---------------- today's tasks: loose threads to earn ----------------
     every finished task = one thread. threads make the pocket talk
     at the final lineup. this is how watching, examining, hiding and
     mending all feed the same goal: knowing who they are. */
  /* threads are earned by real detective work: hot readings from the thimble,
     the moth, and the story-hand moments. they buy eliminations at the end. */
  function addThread(why) {
    g.threads = (g.threads || 0) + 1;
    toast('✓ ' + why + ' — a loose thread earned (' + g.threads + ').');
    Audio2.blip(880, 0.3, 0.025, 'triangle');
    renderTasks();
  }

  function renderTasks() {
    if (!g) { $('tasklist').innerHTML = ''; $('threadct').textContent = ''; return; }
    $('threadct').textContent = 'threads: ' + (g.threads || 0);
    const left = SH.Sim.thimbleLeft || 0;
    $('tasklist').innerHTML =
      '<div class="task">thimble: ' + (left > 0 ? left + ' reading' + (left > 1 ? 's' : '') + ' left' : 'spent for today') + '</div>';
  }

  /* what the thimble says about a tested thing */
  function doReading(it) {
    const rr = Math.random;
    const night = SH.Sim.lightCol === 'blue';
    let axis = null, text = null, hot = false;
    if (it.type === 'grub') {
      text = 'it is alive. it is nobody’s. the thimble asks you to remove it.';
    } else if (night) {
      // at night the thimble reads the day itself out of anything
      axis = 'walk'; hot = true;
      text = SH.READINGS.walk[g.truth.walk];
    } else if (it.type === g.arc.keyType || (SH.ARC_HOT[g.arc.id] || []).includes(it.type)) {
      axis = 'matter'; hot = true;
      const p = SH.READINGS.matter[g.truth.matter];
      text = p[Math.floor(rr() * p.length)];
    } else if (g.fillerTypes.includes(it.type)) {
      axis = 'work'; hot = true;
      const p = SH.READINGS.work[g.truth.work];
      text = p[Math.floor(rr() * p.length)];
    } else {
      text = SH.READINGS.cold[Math.floor(rr() * SH.READINGS.cold.length)];
    }
    g.readings.push({ day: dayIdx + 1, label: it.label, text, hot });
    // show it like a small séance
    $('exam').querySelector('.xname').textContent = 'the thimble reads: ' + it.label;
    $('exam').querySelector('.xdesc').textContent = text;
    $('exam').querySelector('.xread').textContent = hot ? 'that is a real clue. it is in the pocket book.' : '';
    $('exam').querySelector('.xnight').textContent = '';
    $('exam').classList.add('on');
    clearTimeout(examTimer);
    examTimer = setTimeout(() => $('exam').classList.remove('on'), 8000);
    Audio2.blip(hot ? 523 : 220, 0.8, 0.035, 'sine');
    if (hot) addThread('a true reading');
    renderTasks();
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
    // 1. THE PROFILE — the whole point of the week, right at the top
    let html = '<h3>the profile — commit at week’s end</h3>';
    const workKnown = g.occ.filler.some(t => g.journal[t]);
    if (workKnown) html += '<div class="jentry"><i>' + g.occ.line + '</i></div>';
    const AXES = [
      ['work', 'occupation', SH.GUESSES.work],
      ['matter', 'secret', SH.GUESSES.matter],
      ['walk', 'walk', SH.GUESSES.walk],
    ];
    for (const [axis, label, opts] of AXES) {
      html += '<div class="paxis"><div class="susname">' + label + '</div>';
      for (const o of opts) {
        const sel = g.profile[axis] === o.id;
        html += '<span class="popt' + (sel ? ' sel' : '') + '" data-axis="' + axis + '" data-oid="' + o.id + '">' + o.line + '</span>';
      }
      html += '</div>';
    }
    // 2. READINGS — the thimble's testimony, newest last
    html += '<h3>readings</h3>';
    if (g.readings.length) {
      for (const rd of g.readings.slice(-5))
        html += '<div class="jentry' + (rd.hot ? '' : ' junk') + '">d' + rd.day + ' · ' + rd.label + ': <i>' + rd.text + '</i></div>';
    } else {
      html += '<div class="jentry junk">nothing tested. drag a thing onto the thimble. twice a day. night readings reveal the walk.</div>';
    }
    // 3. EVIDENCE — one line per thing
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
        html += '<div class="jentry"><b>' + it.label + '</b>' +
          (gone ? ' <i>(gone)</i>' : (it.damaged ? ' <i>(damaged)</i>' : '')) +
          ' — <i>' + it.def.read + '</i>' + extra + '</div>';
      } else if (it.fate === 'in-pocket') unexamined++;
    }
    if (unexamined) html += '<div class="jentry junk">' + unexamined + ' unexamined, down in the dark.</div>';
    if (!any && !unexamined) html += '<div class="jentry junk">nothing yet. the pocket is young.</div>';
    // 4. your fingerprints — short
    if (g.impact && g.impact.length) {
      html += '<h3>your fingerprints</h3>';
      for (const line of g.impact.slice(-4)) html += '<div class="jentry"><i>' + line + '</i></div>';
    }
    $('jwrap').innerHTML = html;
    // wire the profile options
    for (const b of $('jwrap').querySelectorAll('.popt')) {
      b.addEventListener('click', () => {
        const axis = b.dataset.axis, oid = b.dataset.oid;
        g.profile[axis] = (g.profile[axis] === oid) ? null : oid;
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
    ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 300 + i * 600));
    const readyAt = 300 + ps.length * 600 + 250;
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
      text: 'good. now press and hold on the coin — hold still — until the gold ring closes. that is an examination.',
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
    g.threads = 0;
    g.tasks = null;
    g.lastDayAllDone = false;
    g.mood = 0;
    g.inherit = inherit || null;
    // the week's dangers, planned in secret
    const pr = SH.mulberry32(seed ^ 0x7e57);
    const days = SH.shuffle(pr, [1, 2, 3, 4, 5, 6]);
    g.plan = {
      thiefDays: days.slice(0, SH.ri(pr, 1, 2)),
      crisisDay: SH.ri(pr, 2, 5),
      crisisType: pr() < 0.55 ? 'wash' : 'fall',
      grubDay: (() => {
        for (let i = 2; i < 7; i++) if (g.weather[i].id === 'rain') return i;
        return SH.ri(pr, 2, 6);
      })(),
    };
    narrate.mendDay = -1; narrate.hideHinted = false;
    renderTasks();
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
    // an inherited coat: the last stranger's leavings are already inside.
    // no spoilers — from the rail, everyone looks like somebody. up close, nobody does.
    if (dayIdx === 0 && g.inherit) {
      resolved.lines.unshift(
        'new hands lifted me off the rail today. i thought i had them figured from a distance. i was wrong. i always am.',
        'the last one’s things are still in me. everything gets inherited eventually. begin again.');
      for (const t of g.inherit.types.slice(0, 6))
        resolved.drops.push({ f: SH.rf(g.rng, .05, .5), type: t });
      resolved.drops.sort((a, b) => a.f - b.f);
    }
    // today's secret dangers
    resolved.extra = {};
    if (g.plan.crisisDay === dayIdx) {
      resolved.extra.crisisF = SH.rf(g.rng, 0.3, 0.7);
      resolved.extra.crisisType = g.plan.crisisType;
    }
    if (g.plan.grubDay === dayIdx) resolved.extra.grub = true;
    if (g.plan.thiefDays.includes(dayIdx)) {
      resolved.hands.push({ f: SH.rf(g.rng, 0.25, 0.8), thief: true, action: 'take' });
      resolved.hands.sort((a, b) => a.f - b.f);
    }
    showCard(resolved.header, resolved.lines, () => {
      const segs = buildSchedule(g, resolved.mods);
      const dur = segs.reduce((s, x) => s + x.dur, 0);
      SH.Sim.startDay(resolved, dayIdx, segs, dur);
      renderTasks();
      $('daylabel').textContent = resolved.header.toLowerCase();
      $('hud').classList.remove('hidden');
      state = 'day';
      if (dayIdx === 0 && tut.need('drag'))
        setTimeout(() => { if (state === 'day') toast('drag slowly across things to nudge them. you are the gentlest kind of ghost.', true, 6500); }, 2500);
    });
  }

  function endOfDay() {
    if (dayIdx === 0) tut.finish();
    g.mood = Math.max(0, (g.mood || 0) - 1); // sleep softens most tempers
    dayIdx++;
    if (dayIdx < 7) { startDayCard(); return; }
    // seven days done → first, the reading of the stranger
    state = 'guess';
    $('hud').classList.add('hidden');
    showGuess();
  }

  /* the deduction, blair-style: commit to a full profile — job, secret, walk */
  function showGuess() {
    const box = $('gsuspects');
    box.innerHTML = '';
    // threads buy eliminations: every 3 threads, one wrong option goes dark
    const elimN = Math.min(5, Math.floor((g.threads || 0) / 3));
    const wrongs = [];
    for (const [axis, opts] of [['work', SH.GUESSES.work], ['matter', SH.GUESSES.matter], ['walk', SH.GUESSES.walk]])
      for (const o of opts) if (o.id !== g.truth[axis]) wrongs.push(axis + ':' + o.id);
    const er = SH.mulberry32(g.seed ^ 0xe11);
    const struck = {};
    for (let i = 0; i < elimN && wrongs.length; i++) {
      const w = wrongs.splice(Math.floor(er() * wrongs.length), 1)[0];
      struck[w] = true;
    }
    if (elimN > 0) {
      const w = document.createElement('div');
      w.style.cssText = 'font-style:italic;color:#c9b463;font-size:15px;margin-bottom:14px;line-height:1.6;';
      w.textContent = g.threads + ' threads earned. the pocket pays its debts: ' + elimN + ' wrong answer' + (elimN > 1 ? 's have' : ' has') + ' been crossed out for you.';
      box.appendChild(w);
    }
    const AXES = [['work', 'their occupation'], ['matter', 'their secret'], ['walk', 'their walk']];
    for (const [axis, label] of AXES) {
      const h = document.createElement('div');
      h.className = 'susname';
      h.style.marginTop = '14px';
      h.textContent = label;
      box.appendChild(h);
      for (const o of SH.GUESSES[axis]) {
        const dead = struck[axis + ':' + o.id];
        const b = document.createElement('button');
        b.className = 'gopt' + (g.profile[axis] === o.id ? ' sel' : '') + (dead ? ' struck' : '');
        b.textContent = o.line;
        if (dead) { b.disabled = true; if (g.profile[axis] === o.id) g.profile[axis] = null; }
        else b.addEventListener('click', () => {
          g.profile[axis] = o.id;
          showGuess(); // re-render selections
        });
        box.appendChild(b);
      }
    }
    $('guessgo').disabled = !(g.profile.work && g.profile.matter && g.profile.walk);
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
    // the verdict on your reading of them, axis by axis
    if (g.profile && g.profile.work) {
      const rows = [['work', 'occupation'], ['matter', 'secret'], ['walk', 'walk']];
      let right = 0, html = 'your reading of them:<br>';
      for (const [axis, label] of rows) {
        const ok = g.profile[axis] === g.truth[axis];
        if (ok) right++;
        const truthLine = SH.GUESSES[axis].find(o => o.id === g.truth[axis]).line;
        html += label + ' — <span class="' + (ok ? 'fate-kept' : 'fate-lost') + '">' +
          (ok ? 'right' : 'wrong. truly: ' + truthLine) + '</span><br>';
      }
      const VERDICT = [
        'nothing landed. some people stay strangers. that is allowed.',
        'one of three. a silhouette, not a person. keep practising.',
        'two of three. so nearly them that it aches.',
        'a perfect reading. you would make a very fine pocket.',
      ];
      html += '<span style="color:#c9b463">' + VERDICT[right] + '</span>';
      const v = document.createElement('div');
      v.style.marginBottom = '18px';
      v.innerHTML = html;
      list.appendChild(v);
    }
    const FATE = {
      'in-pocket': ['passed on with the coat', 'fate-kept'],
      'taken': ['taken by the fingers', 'fate-taken'],
      'lost': ['lost along the way', 'fate-lost'],
      'used': ['used up in service of the pocket', 'fate-taken'],
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
  window.addEventListener('pointerup', () => {
    // examining is a held press now — handled by the sim's exam channel
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
