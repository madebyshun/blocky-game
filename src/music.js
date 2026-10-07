// BaseCity's music: a lo-fi loop played live with the Web Audio API (no audio files, nothing to
// license or download). Rhodes-like chords, a sine bass, a pentatonic melody through a delay, swung
// lo-fi drums and a little vinyl crackle, at 84 BPM. It follows the city: softer and darker at night,
// hushed in the rain (setMood). Browsers need a tap or key before any sound, so main.js starts it on the first one.

const BPM = 84;
const STEP = 60 / BPM / 4; // a 16th note, in seconds
const SWING = 0.18; // off-beat 8ths, late by this share of a 16th
const AHEAD = 0.12; // schedule this far ahead (s)
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Two 4-bar sections, a chord per bar (MIDI notes, low to high); the bass plays the first.
const A = [[41, 57, 60, 64, 67], [40, 55, 59, 62, 67], [38, 57, 60, 62, 65], [36, 55, 59, 64, 67]]; // Fmaj9 Em7 Dm7 Cmaj7
const B = [[45, 55, 60, 64, 67], [38, 57, 60, 62, 65], [43, 53, 57, 60, 62], [36, 55, 59, 64, 67]]; // Am7 Dm7 G9sus Cmaj7
const SONG = [...A, ...A, ...B, ...A];
const MELODY = [72, 74, 76, 79, 81, 84]; // C major pentatonic, the 5th octave
const rand = (a) => a[Math.floor(Math.random() * a.length)];

// keepPlaying: don't go quiet in a hidden tab (the livestream: OBS may report its page as hidden)
export function createMusic({ keepPlaying = false } = {}) {
  let ctx = null, out = null, keysLp = null, drumBus = null, delay = null, crackle = null, noise = null;
  let on = false, timer = null, step = 0, nextAt = 0;
  const mood = { bright: 1, drums: 1 }; // eased toward the city's daylight and weather

  function build() {
    // iPhones mute Web Audio when the ring/silent switch is on, unless the page asks for media playback
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain();
    out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    out.connect(comp).connect(ctx.destination);

    // a soft room: a convolver fed with decaying noise
    const verb = ctx.createConvolver(), len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
    verb.buffer = ir;
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.28;
    verb.connect(verbGain).connect(out);

    // keys and melody: warm low-pass, a dotted-8th echo, some room
    keysLp = ctx.createBiquadFilter();
    keysLp.type = 'lowpass';
    keysLp.frequency.value = 2600;
    keysLp.Q.value = 0.4;
    keysLp.connect(out);
    keysLp.connect(verb);
    delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const delayLp = ctx.createBiquadFilter();
    delayLp.type = 'lowpass';
    delayLp.frequency.value = 1800;
    delay.connect(delayLp).connect(fb).connect(delay);
    delayLp.connect(keysLp);

    // drums: a little dull, like a tape
    drumBus = ctx.createGain();
    const drumLp = ctx.createBiquadFilter();
    drumLp.type = 'lowpass';
    drumLp.frequency.value = 7000;
    drumBus.connect(drumLp).connect(out);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // vinyl: quiet hiss with the odd click
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    crackle = ctx.createGain();
    crackle.gain.value = 0.005;
    hiss.connect(hp).connect(crackle).connect(out);
    hiss.start();
  }

  const env = (g, t, peak, attack, hold, release) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  };
  const osc = (type, freq, t, dur, dest, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  };

  // a Rhodes-ish note: a sine with a quiet octave on top and a soft bell at the start
  function key(n, t, vel, dur) {
    const g = ctx.createGain();
    env(g, t, 0.09 * vel, 0.012, dur * 0.25, dur * 0.9);
    g.connect(keysLp);
    osc('sine', midi(n), t, dur * 1.2, g, (Math.random() - 0.5) * 6);
    const g2 = ctx.createGain();
    env(g2, t, 0.025 * vel, 0.005, 0.02, 0.35);
    g2.connect(keysLp);
    osc('triangle', midi(n + 12), t, 0.4, g2);
  }
  function lead(n, t, vel) {
    const g = ctx.createGain();
    env(g, t, 0.05 * vel, 0.01, 0.06, 0.5);
    g.connect(keysLp);
    g.connect(delay);
    osc('triangle', midi(n), t, 0.7, g);
  }
  function bass(n, t, dur) {
    const g = ctx.createGain();
    env(g, t, 0.22, 0.01, dur * 0.5, dur * 0.6);
    g.connect(out);
    osc('sine', midi(n), t, dur * 1.2, g);
  }
  function kick(t, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.5 * vel, 0.002, 0.02, 0.24);
    o.connect(g).connect(drumBus);
    o.start(t);
    o.stop(t + 0.35);
  }
  function hit(t, vel, type, freq, q, len, gain) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    env(g, t, gain * vel, 0.002, 0.005, len);
    s.connect(f).connect(g).connect(drumBus);
    s.start(t, Math.random() * 0.8);
    s.stop(t + len + 0.05);
  }
  const snare = (t, vel) => { hit(t, vel, 'bandpass', 1900, 0.8, 0.16, 0.22); const g = ctx.createGain(); env(g, t, 0.07 * vel, 0.002, 0.01, 0.08); g.connect(drumBus); osc('triangle', 190, t, 0.1, g); };
  const hat = (t, vel) => hit(t, vel, 'highpass', 7500, 0.7, 0.035, 0.07);

  // one 16th: what plays on it
  function play(s, t) {
    const bar = Math.floor(s / 16) % SONG.length, pos = s % 16, chord = SONG[bar], d = mood.drums;
    if (pos === 0) { chord.slice(1).forEach((n, i) => key(n, t + i * 0.012, 0.9, STEP * 12)); bass(chord[0], t, STEP * 6); }
    if (pos === 10 && Math.random() < 0.55) chord.slice(2).forEach((n, i) => key(n, t + i * 0.01, 0.5, STEP * 5));
    if (pos === 8) bass(Math.random() < 0.5 ? chord[0] + 7 : chord[0] + 12, t, STEP * 4);
    if (pos % 2 === 0 && Math.random() < 0.26 * (0.6 + 0.4 * mood.bright)) {
      const fit = MELODY.filter((m) => chord.some((c) => (c - m) % 12 === 0) || Math.random() < 0.4); // mostly chord tones
      lead(rand(fit.length ? fit : MELODY), t, 0.7 + Math.random() * 0.3);
    }
    if (d < 0.05) return;
    if (pos === 0 || pos === 10 || (pos === 7 && Math.random() < 0.25)) kick(t, d);
    if (pos === 4 || pos === 12) snare(t, d * 0.9);
    if (pos % 2 === 0) hat(t, d * (pos % 4 === 0 ? 0.9 : 0.55) * (0.7 + Math.random() * 0.3));
    if (Math.random() < 0.02) hit(t, 1, 'bandpass', 3000, 2, 0.01, 0.15); // a vinyl click
  }

  function tick() {
    while (nextAt < ctx.currentTime + AHEAD) {
      const off = step % 4 === 2 ? SWING * STEP : 0; // swung 8ths
      play(step, nextAt + off);
      nextAt += STEP;
      step++;
    }
  }

  async function start() {
    if (!ctx) build();
    if (ctx.state !== 'running') await ctx.resume();
    nextAt = ctx.currentTime + 0.1;
    clearInterval(timer);
    timer = setInterval(tick, 25);
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0.7, ctx.currentTime, 0.8); // fade in
  }
  function stop() {
    if (!ctx) return;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    setTimeout(() => { if (!on) { clearInterval(timer); ctx.suspend(); } }, 900);
  }

  // a hidden tab goes quiet, and picks up again when it's back
  document.addEventListener('visibilitychange', () => {
    if (!on || !ctx || keepPlaying) return;
    if (document.hidden) { clearInterval(timer); ctx.suspend(); } else start();
  });

  return {
    get on() { return on; },
    get playing() { return on && ctx?.state === 'running'; }, // on, and the browser lets it play
    async set(v) {
      on = v;
      try { if (v) await start(); else stop(); } catch (e) { on = false; console.warn('[music]', e.message); }
      return on;
    },
    // daylight 0 (night) to 1 (noon), gloom 0 (clear) to 1 (storm): darker keys and softer drums
    setMood(daylight = 1, gloom = 0) {
      if (!ctx || !on) return;
      const bright = Math.max(0, Math.min(1, daylight)) * (1 - 0.5 * gloom);
      mood.bright += (bright - mood.bright) * 0.02;
      mood.drums = Math.max(0, Math.min(1, 0.35 + 0.65 * daylight - 0.5 * gloom));
      keysLp.frequency.setTargetAtTime(1300 + 2100 * mood.bright, ctx.currentTime, 0.5);
      crackle.gain.setTargetAtTime(0.004 + 0.01 * gloom, ctx.currentTime, 1);
    },
  };
}
