// Procedural WebAudio SFX — no assets, everything synthesized.
export interface Sfx {
  unlock(): void;
  tickStrain(strain: number, dt: number): void;
  strainStart(): void;
  launch(strain: number): void;
  splat(combo: number): void;
  thud(): void;
  click(): void;
  deny(): void;
  unlockJingle(): void;
  levelUp(): void;
  fullBucket(): void;
}

export function makeSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let lastTick = 0;

  function ac(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function env(node: GainNode, t0: number, peak: number, decay: number) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  }

  function osc(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) {
    const c = ac();
    if (!c || !master) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(g, t0, peak, dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur: number, peak: number, filterFreq: number, q = 1, delay = 0) {
    const c = ac();
    if (!c || !master) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = c.createGain();
    env(g, t0, peak, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  return {
    unlock() { ac(); },
    tickStrain(strain, dt) {
      const c = ac();
      if (!c) return;
      const now = c.currentTime;
      if (now - lastTick < 0.05 + (1 - strain) * 0.08) return;
      lastTick = now;
      osc('sawtooth', 55 + strain * 90, 45 + strain * 60, 0.06, 0.05 + strain * 0.08);
    },
    strainStart() {
      osc('triangle', 120, 320, 0.18, 0.1);
    },
    launch(strain) {
      osc('sine', 220 + strain * 200, 90, 0.22, 0.18);
      noise(0.15, 0.1, 900, 2);
      // the classic
      osc('square', 160, 110, 0.14, 0.06, 0.02);
    },
    splat(combo) {
      const base = 90 + Math.min(combo, 12) * 8;
      osc('sine', base, base * 0.4, 0.18, 0.22);
      noise(0.12, 0.16, 500, 1.5);
      osc('triangle', base * 2.4, base * 1.6, 0.12, 0.1, 0.05);
    },
    thud() {
      osc('sine', 75, 40, 0.16, 0.2);
      noise(0.1, 0.1, 300, 1);
    },
    click() { osc('square', 700, 500, 0.05, 0.07); },
    deny() { osc('square', 220, 180, 0.09, 0.08); osc('square', 180, 150, 0.12, 0.08, 0.09); },
    unlockJingle() {
      [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, f, 0.14, 0.12, i * 0.09));
    },
    levelUp() {
      [392, 523, 659, 784, 1047].forEach((f, i) => osc('square', f, f * 1.01, 0.12, 0.08, i * 0.07));
      noise(0.4, 0.05, 4000, 1, 0.1);
    },
    fullBucket() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, f, 0.16, 0.14, i * 0.08));
      noise(0.5, 0.08, 6000, 1, 0.2);
    },
  };
}
