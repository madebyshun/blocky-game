// Small synthesized sounds keep the game independent of audio downloads.
export function createStreetAudio() {
  let context, master, engine, engineGain, noise;
  let enabled = true;
  try { enabled = localStorage.getItem('basecity:street-audio') !== 'off'; } catch { /* storage can be disabled */ }

  function unlock() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!enabled || !Audio) return;
    if (!context) {
      context = new Audio();
      master = context.createGain();
      master.gain.value = 0.55;
      master.connect(context.destination);

      noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

      engine = context.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 34;
      const tone = context.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 146;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engine.connect(tone).connect(engineGain).connect(master);
      engine.start();
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function drive(speed, running) {
    if (!engine) return;
    const t = context.currentTime;
    engine.frequency.setTargetAtTime(34 + Math.min(speed, 14) * 6, t, 0.09);
    engineGain.gain.setTargetAtTime(enabled && running ? 0.024 + Math.min(speed, 14) * 0.003 : 0, t, 0.07);
  }

  function step(surface, landing = false) {
    if (!enabled || context?.state !== 'running') return;
    const t = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = (landing ? 0.83 : 1) * (0.92 + Math.random() * 0.25);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = landing ? 460 : surface === 'pavement' ? 780 : 1250;
    const gain = context.createGain();
    gain.gain.setValueAtTime(landing ? 0.26 : 0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    source.connect(filter).connect(gain).connect(master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(t);
    source.stop(t + 0.11);
  }

  return { unlock, drive, step, get enabled() { return enabled; }, toggle() {
    enabled = !enabled;
    try { localStorage.setItem('basecity:street-audio', enabled ? 'on' : 'off'); } catch { /* optional persistence */ }
    if (enabled) unlock();
    else drive(0, false);
  } };
}
