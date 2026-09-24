'use strict';

// Synthesized sound effects and a chiptune version of "Korobeiniki" (Web Audio API, no files needed).
const Sound = (() => {
  let ctx = null, master, sfxBus, musicBus, noiseBuf;
  let musicOn = true, wantMusic = false, playing = false, timer = null;
  let nextTime = 0, step = 0, bpm = 140;

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    comp.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.3;
    musicBus.connect(master);

    // Echo for the music
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.21;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    musicBus.connect(delay);
    delay.connect(lp);
    lp.connect(feedback);
    feedback.connect(delay);
    lp.connect(wet);
    wet.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function resume() {
    if (!init()) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(syncMusic).catch(() => {});
    } else {
      syncMusic();
    }
  }

  const ready = () => !!ctx && ctx.state === 'running';
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function tone(freq, o = {}) {
    if (!ready()) return;
    const { type = 'square', dur = 0.1, vol = 0.2, slide = 0, at = 0, when = null,
      attack = 0.005, dest = sfxBus, detune = 0 } = o;
    const t = when !== null ? when : ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function noise(o = {}) {
    if (!ready()) return;
    const { dur = 0.1, vol = 0.3, freq = 1000, type = 'bandpass', q = 1, at = 0, when = null,
      dest = sfxBus, sweep = 0 } = o;
    const t = when !== null ? when : ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  // ---------- Sound effects ----------
  const sfx = {
    move() { tone(880, { type: 'triangle', dur: 0.035, vol: 0.06 }); },
    rotate() { tone(620, { type: 'square', dur: 0.06, vol: 0.05, slide: 1.35 }); },
    hold() {
      tone(440, { type: 'triangle', dur: 0.09, vol: 0.12, slide: 1.5 });
      tone(660, { type: 'triangle', dur: 0.09, vol: 0.08, slide: 1.5, at: 0.05 });
    },
    lock() { tone(260, { type: 'triangle', dur: 0.07, vol: 0.14, slide: 0.7 }); },
    hardDrop() {
      noise({ dur: 0.22, vol: 0.55, freq: 900, type: 'lowpass', sweep: 0.15 });
      tone(140, { type: 'sine', dur: 0.25, vol: 0.5, slide: 0.35 });
    },
    clear(n, tspin) {
      const scale = [72, 76, 79, 84, 88, 91, 96];
      const count = n === 4 ? 7 : n + 2;
      for (let i = 0; i < count; i++) {
        tone(mtof(scale[i]), { type: 'square', dur: 0.12, vol: 0.09, at: i * 0.045 });
        tone(mtof(scale[i] + 12), { type: 'sine', dur: 0.2, vol: 0.06, at: i * 0.045 });
      }
      noise({ dur: 0.35 + n * 0.08, vol: 0.18, freq: 3000, type: 'highpass', sweep: 0.3 });
      if (n === 4) {
        tone(55, { type: 'sine', dur: 0.6, vol: 0.6, slide: 0.5 });
        noise({ dur: 0.7, vol: 0.3, freq: 6000, type: 'bandpass', sweep: 0.1, q: 0.6 });
      }
      if (tspin) {
        for (let i = 0; i < 5; i++) tone(mtof(96 + i * 3), { type: 'sine', dur: 0.15, vol: 0.07, at: 0.1 + i * 0.04 });
      }
    },
    levelUp() {
      [60, 64, 67, 72, 76, 79, 84].forEach((m, i) =>
        tone(mtof(m), { type: 'sawtooth', dur: 0.18, vol: 0.07, at: i * 0.06 }));
      tone(mtof(84), { type: 'square', dur: 0.6, vol: 0.06, at: 0.42 });
    },
    gameOver() {
      tone(440, { type: 'sawtooth', dur: 1.4, vol: 0.18, slide: 0.12 });
      tone(330, { type: 'square', dur: 1.4, vol: 0.1, slide: 0.12, at: 0.1 });
      noise({ dur: 1.2, vol: 0.25, freq: 2000, type: 'lowpass', sweep: 0.05 });
    },
    select() {
      tone(660, { type: 'square', dur: 0.08, vol: 0.08 });
      tone(990, { type: 'square', dur: 0.12, vol: 0.08, at: 0.07 });
    },
    pause() { tone(520, { type: 'triangle', dur: 0.15, vol: 0.12, slide: 0.6 }); },
  };

  // ---------- Music: Korobeiniki ----------
  const MELODY = [
    [76, 2], [71, 1], [72, 1], [74, 2], [72, 1], [71, 1],
    [69, 2], [69, 1], [72, 1], [76, 2], [74, 1], [72, 1],
    [71, 3], [72, 1], [74, 2], [76, 2],
    [72, 2], [69, 2], [69, 2], [0, 2],
    [0, 1], [74, 2], [77, 1], [81, 2], [79, 1], [77, 1],
    [76, 3], [72, 1], [76, 2], [74, 1], [72, 1],
    [71, 2], [71, 1], [72, 1], [74, 2], [76, 2],
    [72, 2], [69, 2], [69, 2], [0, 2],
  ];
  const STEPS = [];
  for (const [note, len] of MELODY) {
    STEPS.push({ note, len });
    for (let i = 1; i < len; i++) STEPS.push(null);
  }
  const BASS = [40, 45, 40, 45, 38, 45, 40, 45];

  function lead(m, t, len) {
    const f = mtof(m);
    tone(f, { type: 'square', dur: len * 0.95, vol: 0.12, when: t, dest: musicBus, attack: 0.01 });
    tone(f, { type: 'square', dur: len * 0.95, vol: 0.07, when: t, dest: musicBus, detune: 9, attack: 0.01 });
  }

  function schedule() {
    if (!ready()) return;
    const spe = 60 / bpm / 2; // seconds per eighth
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      const s = step % STEPS.length;
      const m = STEPS[s];
      if (m && m.note) lead(m.note, nextTime, m.len * spe);
      const root = BASS[Math.floor(s / 8)];
      tone(mtof(s % 2 === 0 ? root : root + 12),
        { type: 'triangle', dur: spe * 0.9, vol: 0.32, when: nextTime, dest: musicBus });
      if (s % 4 === 0) tone(150, { type: 'sine', dur: 0.16, vol: 0.45, slide: 0.3, when: nextTime, dest: musicBus });
      if (s % 2 === 1) noise({ dur: 0.04, vol: 0.12, freq: 7000, type: 'highpass', when: nextTime, dest: musicBus });
      if (s % 8 === 4) noise({ dur: 0.12, vol: 0.18, freq: 1800, type: 'bandpass', when: nextTime, dest: musicBus });
      nextTime += spe;
      step++;
    }
  }

  function syncMusic() {
    const should = wantMusic && musicOn && ready();
    if (should && !playing) {
      playing = true;
      nextTime = ctx.currentTime + 0.05;
      timer = setInterval(schedule, 25);
    } else if (!should && playing) {
      playing = false;
      clearInterval(timer);
    }
  }

  return {
    resume,
    sfx,
    get running() { return ready(); },
    get musicOn() { return musicOn; },
    toggleMusic() { musicOn = !musicOn; syncMusic(); return musicOn; },
    setMusicActive(on) { wantMusic = on; syncMusic(); },
    resetMusic() { step = 0; },
    setLevel(level) { bpm = Math.min(140 + (level - 1) * 8, 230); },
  };
})();
