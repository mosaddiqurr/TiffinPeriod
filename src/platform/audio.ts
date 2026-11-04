import { settingsStore } from './settings';

// All sound effects are synthesized with the Web Audio API.
// There are no audio files, so there is nothing to license and nothing to download.
// Browsers block audio until a user gesture. unlockAudio() runs on the first gesture.

export type SfxName =
  | 'click' | 'bell' | 'page' | 'riffle' | 'pop' | 'popBig' | 'creak' | 'whistle'
  | 'crunch' | 'good' | 'bad' | 'fanfare' | 'thud' | 'tick' | 'out' | 'six'
  | 'whoosh' | 'flap' | 'boing' | 'splash' | 'heave' | 'clap';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settingsStore.get().volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

settingsStore.subscribe(() => {
  if (master) master.gain.value = settingsStore.get().volume;
});

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest: AudioNode) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  env(g, t, 0.005, peak, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(t: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1: number, q: number, dest: AudioNode) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, 0.003, peak, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export function sfx(name: SfxName, opts: { pitch?: number; gain?: number } = {}): void {
  const st = settingsStore.get();
  if (!st.sound) return;
  const c = ensure();
  if (!c || !master || c.state !== 'running') return;
  const t = c.currentTime + 0.005;
  const k = opts.pitch ?? 1;
  const out = c.createGain();
  out.gain.value = opts.gain ?? 1;
  out.connect(master);
  switch (name) {
    case 'click': tone('sine', 900 * k, 600 * k, t, 0.04, 0.25, out); break;
    case 'tick': tone('square', 1200 * k, 1200 * k, t, 0.03, 0.08, out); break;
    case 'bell': {
      // Struck brass school bell: inharmonic partials with long decay.
      const ratios = [1, 2.76, 5.4, 8.93];
      ratios.forEach((r, i) => tone('sine', 520 * r * k, 520 * r * k, t, 1.6 - i * 0.3, 0.22 / (i + 1), out));
      tone('sine', 520 * k, 520 * k, t + 0.42, 1.2, 0.16, out);
      break;
    }
    case 'page': noise(t, 0.16, 0.5, 'bandpass', 2600, 700, 0.9, out); break;
    case 'riffle': for (let i = 0; i < 4; i++) noise(t + i * 0.035, 0.03, 0.25, 'bandpass', 3000, 1500, 1.2, out); break;
    case 'pop':
      noise(t, 0.07, 0.9, 'highpass', 1800 * k, 900, 0.7, out);
      tone('sine', 380 * k, 70, t, 0.09, 0.5, out);
      break;
    case 'popBig':
      noise(t, 0.18, 1, 'lowpass', 4000, 300, 0.5, out);
      tone('sine', 220 * k, 45, t, 0.2, 0.7, out);
      break;
    case 'creak': {
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70 * k, t);
      o.frequency.linearRampToValueAtTime(105 * k, t + 0.22);
      f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 6;
      env(g, t, 0.02, 0.35, 0.22);
      o.connect(f).connect(g).connect(out);
      o.start(t); o.stop(t + 0.3);
      break;
    }
    case 'heave': tone('triangle', 196 * k, 150 * k, t, 0.18, 0.3, out); noise(t, 0.12, 0.2, 'lowpass', 600, 300, 0.5, out); break;
    case 'whistle': {
      // Referee whistle: high tone with a fast pea rattle.
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lg = c.createGain();
      const g = c.createGain();
      o.type = 'sine'; o.frequency.value = 2900 * k;
      lfo.frequency.value = 38; lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.setValueAtTime(0.25, t + 0.42);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(out);
      o.start(t); lfo.start(t); o.stop(t + 0.55); lfo.stop(t + 0.55);
      break;
    }
    case 'crunch': for (let i = 0; i < 5; i++) noise(t + i * 0.045 + Math.random() * 0.02, 0.04, 0.5, 'bandpass', 1800 + Math.random() * 1500, 900, 1.5, out); break;
    case 'good': tone('triangle', 1318 * k, 1318 * k, t, 0.12, 0.25, out); tone('triangle', 1760 * k, 1760 * k, t + 0.08, 0.2, 0.25, out); break;
    case 'bad': tone('square', 180 * k, 120 * k, t, 0.25, 0.12, out); break;
    case 'out': {
      tone('sawtooth', 330 * k, 160 * k, t, 0.35, 0.12, out);
      tone('sawtooth', 260 * k, 110 * k, t + 0.3, 0.5, 0.12, out);
      break;
    }
    case 'six': [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f * k, f * k, t + i * 0.06, 0.25, 0.2, out)); break;
    case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f * k, f * k, t + i * 0.12, i === 3 ? 0.6 : 0.16, 0.25, out)); break;
    case 'thud': tone('sine', 140 * k, 45, t, 0.18, 0.6, out); break;
    case 'whoosh': noise(t, 0.3, 0.35, 'bandpass', 400, 2200, 1.2, out); break;
    case 'flap': for (let i = 0; i < 3; i++) noise(t + i * 0.09, 0.06, 0.3, 'lowpass', 900, 400, 0.8, out); break;
    case 'boing': tone('sine', 180 * k, 420 * k, t, 0.25, 0.4, out); break;
    case 'splash': noise(t, 0.45, 0.6, 'lowpass', 3000, 500, 0.4, out); break;
    case 'clap': for (let i = 0; i < 8; i++) noise(t + i * 0.07 + Math.random() * 0.03, 0.05, 0.3, 'bandpass', 1500, 1200, 0.8, out); break;
  }
}

export function vibrate(ms: number | number[]): void {
  if (!settingsStore.get().haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

// ---- Spoken announcements (Web Speech API, free and built into browsers) ----

function voices(): SpeechSynthesisVoice[] {
  try {
    return globalThis.speechSynthesis?.getVoices() ?? [];
  } catch {
    return [];
  }
}

export function hasBanglaVoice(): boolean {
  return voices().some((v) => v.lang.toLowerCase().startsWith('bn'));
}

/** Speak a line. Uses Bangla if a Bangla voice exists, else the English fallback. */
export function speak(bn: string, en: string, rate = 1.1): void {
  const st = settingsStore.get();
  if (!st.voice || !st.sound) return;
  const synth = globalThis.speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel();
    const bnVoice = voices().find((v) => v.lang.toLowerCase().startsWith('bn'));
    const useBn = st.lang === 'bn' && !!bnVoice;
    const u = new SpeechSynthesisUtterance(useBn ? bn : en);
    if (useBn && bnVoice) u.voice = bnVoice;
    u.lang = useBn ? bnVoice!.lang : 'en-US';
    u.rate = rate;
    u.volume = st.volume;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}
