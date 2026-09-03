import type { Oklch } from '../color';
import {
  MAX_HITS_PER_STEP_DESKTOP,
  MAX_HITS_PER_STEP_MOBILE,
  MAX_VOICES_DESKTOP,
  MAX_VOICES_MOBILE,
  OKLCH_C_MAX,
  OKLCH_C_MIN,
  OKLCH_L_MAX,
  OKLCH_L_MIN,
  isMobile,
} from '../config';

export type HitSurface = 'shape' | 'wall' | 'pointer';
export type HitKind = 'bounce' | 'merge' | 'vertexLoss';

export type HitParams = {
  size: number;
  sizeMin: number;
  sizeMax: number;
  color: Oklch;
  speed: number;
  mass: number;
  depthT?: number;
  deeper?: boolean;
  generation?: number;
  surface?: HitSurface;
  kind?: HitKind;
  degreeShift?: number;
};

type Family = 'kick' | 'tom' | 'rim' | 'cowbell' | 'hat' | 'bell' | 'wood' | 'thud';

const YOUNG: Family[] = ['rim', 'hat', 'bell'];
const MID: Family[] = ['wood', 'tom', 'cowbell'];
const OLD: Family[] = ['thud', 'kick', 'tom'];

const SCALES = [
  [0, 4, 7, 11, 14],
  [0, 3, 5, 7, 10],
  [0, 2, 3, 5, 7],
];

const REGISTER = [1.12, 1, 0.82];

export class Hits {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echoIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private live = 0;
  private burst = 0;
  private readonly maxLive: number;
  private readonly burstMax: number;
  private readonly lite: boolean;

  constructor() {
    const mobile = isMobile();
    this.lite = mobile;
    this.maxLive = mobile ? MAX_VOICES_MOBILE : MAX_VOICES_DESKTOP;
    this.burstMax = mobile ? MAX_HITS_PER_STEP_MOBILE : MAX_HITS_PER_STEP_DESKTOP;
  }

  async unlock(): Promise<void> {
    // iOS 17+: playback session must be set before creating the context,
    // otherwise the hardware mute switch swallows Web Audio.
    setPlaybackSession();
    if (!this.ctx) this.build();
    if (!this.ctx) return;
    primeOutput(this.ctx);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.unlocked = true;
  }

  async resume(): Promise<void> {
    if (!this.unlocked || !this.ctx) return;
    setPlaybackSession();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  beginBurst(): void {
    this.burst = 0;
  }

  trigger(params: HitParams): void {
    if (!this.unlocked || !this.ctx || !this.master || !this.noise) return;
    if (this.ctx.state === 'suspended') {
      void this.resume();
      return;
    }
    if (this.burst >= this.burstMax || this.live >= this.maxLive) return;

    const mapped = mapHit(params, this.lite);
    this.burst++;
    this.live++;
    const now = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.connect(this.master);
    let send: GainNode | null = null;
    if (mapped.echo > 0.02 && this.echoIn) {
      send = this.ctx.createGain();
      send.gain.value = mapped.echo;
      bus.connect(send);
      send.connect(this.echoIn);
    }
    const done = () => {
      try {
        bus.disconnect();
      } catch {
        /* already gone */
      }
      if (send) {
        try {
          send.disconnect();
        } catch {
          /* already gone */
        }
      }
      this.live = Math.max(0, this.live - 1);
    };

    if (params.kind === 'vertexLoss') {
      this.click(now, mapped, done, bus);
      return;
    }

    switch (mapped.family) {
      case 'kick':
        this.kick(now, mapped, done, bus);
        break;
      case 'tom':
        this.tom(now, mapped, done, bus);
        break;
      case 'rim':
        this.rim(now, mapped, done, bus);
        break;
      case 'cowbell':
        this.cowbell(now, mapped, done, bus);
        break;
      case 'hat':
        this.hat(now, mapped, done, bus);
        break;
      case 'bell':
        this.bell(now, mapped, done, bus);
        break;
      case 'wood':
        this.wood(now, mapped, done, bus);
        break;
      case 'thud':
        this.thud(now, mapped, done, bus);
        break;
    }
  }

  private build(): void {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.42;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;
    master.connect(comp);
    comp.connect(ctx.destination);

    const echoIn = ctx.createGain();
    const delay = ctx.createDelay(0.4);
    delay.delayTime.value = this.lite ? 0.1 : 0.15;
    const fb = ctx.createGain();
    fb.gain.value = this.lite ? 0.16 : 0.24;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.lite ? 1600 : 2200;
    echoIn.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(master);
    this.echoIn = echoIn;

    this.ctx = ctx;
    this.master = master;
    this.noise = makeNoise(ctx);
  }

  private kick(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const start = (110 + p.sizeNorm * 90) * p.hueMul;
    const end = (38 + p.sizeNorm * 28) * p.hueMul;
    const decay = (0.22 + (1 - p.sizeNorm) * 0.28 + p.mass * 0.012) * p.decayMul;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(end, 22), now + 0.055);

    const g = ctx.createGain();
    env(g.gain, now, p.loud * 0.9, decay);

    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.setValueAtTime(start * 2.1, now);
    const cg = ctx.createGain();
    env(cg.gain, now, p.loud * (0.12 + p.bright * 0.18), 0.02);

    osc.connect(g).connect(dest);
    click.connect(cg).connect(dest);
    osc.start(now);
    osc.stop(now + decay + 0.04);
    click.start(now);
    click.stop(now + 0.03);
    finish(osc, [osc, g, click, cg], done);
  }

  private tom(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const start = (160 + p.sizeNorm * 140) * p.hueMul;
    const end = start * 0.52;
    const decay = (0.16 + (1 - p.sizeNorm) * 0.16) * p.decayMul;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(end, 50), now + 0.07);
    const g = ctx.createGain();
    env(g.gain, now, p.loud * 0.7, decay);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + decay + 0.04);

    const nodes: AudioNode[] = [osc, g];
    if (!this.lite) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(start * 0.5, now);
      sub.frequency.exponentialRampToValueAtTime(Math.max(end * 0.5, 28), now + 0.09);
      const sg = ctx.createGain();
      env(sg.gain, now, p.loud * 0.22, decay * 1.1);
      sub.connect(sg).connect(dest);
      sub.start(now);
      sub.stop(now + decay + 0.05);
      nodes.push(sub, sg);
    }
    finish(osc, nodes, done);
  }

  private rim(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const noise = this.noise!;
    const pitch = (1400 + p.sizeNorm * 1200) * p.hueMul;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    const og = ctx.createGain();
    env(og.gain, now, p.loud * 0.45, 0.045);

    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800 + p.bright * 2200;
    const ng = ctx.createGain();
    env(ng.gain, now, p.loud * 0.28, 0.04);

    osc.connect(og).connect(dest);
    src.connect(hp).connect(ng).connect(dest);
    osc.start(now);
    osc.stop(now + 0.06);
    src.start(now);
    src.stop(now + 0.05);
    finish(src, [osc, og, src, hp, ng], done);
  }

  private cowbell(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const a = (480 + p.sizeNorm * 280) * p.hueMul;
    const b = a * 1.48;
    const decay = (0.09 + p.sizeNorm * 0.08) * p.decayMul;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = a * 1.15;
    bp.Q.value = 4.5;
    const g = ctx.createGain();
    env(g.gain, now, p.loud * 0.38, decay);
    bp.connect(g).connect(dest);

    const o1 = ctx.createOscillator();
    o1.type = 'square';
    o1.frequency.setValueAtTime(a, now);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.setValueAtTime(b, now);
    o1.connect(bp);
    o2.connect(bp);
    o1.start(now);
    o2.start(now);
    o1.stop(now + decay + 0.04);
    o2.stop(now + decay + 0.04);
    finish(o1, [o1, o2, bp, g], done);
  }

  private hat(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200 + p.sizeNorm * 2800 + p.bright * 1200;
    const g = ctx.createGain();
    const decay = 0.045 + p.sizeNorm * 0.05;
    env(g.gain, now, p.loud * 0.32, decay);
    src.connect(hp).connect(g).connect(dest);
    src.start(now);
    src.stop(now + decay + 0.03);

    const nodes: AudioNode[] = [src, hp, g];
    if (!this.lite) {
      const ping = ctx.createOscillator();
      ping.type = 'square';
      ping.frequency.setValueAtTime((2400 + p.sizeNorm * 1800) * p.hueMul, now);
      const pg = ctx.createGain();
      env(pg.gain, now, p.loud * 0.06, decay * 0.7);
      ping.connect(pg).connect(dest);
      ping.start(now);
      ping.stop(now + decay + 0.02);
      nodes.push(ping, pg);
    }
    finish(src, nodes, done);
  }

  private bell(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const f = (1500 + p.sizeNorm * 1700) * p.hueMul;
    const decay = (0.28 + p.sizeNorm * 0.22) * p.decayMul;

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(f, now);
    const g1 = ctx.createGain();
    env(g1.gain, now, p.loud * 0.22, decay);

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 2.005, now);
    const g2 = ctx.createGain();
    env(g2.gain, now, p.loud * 0.08, decay * 0.7);

    o1.connect(g1).connect(dest);
    o2.connect(g2).connect(dest);
    o1.start(now);
    o2.start(now);
    o1.stop(now + decay + 0.05);
    o2.stop(now + decay + 0.05);
    finish(o1, [o1, o2, g1, g2], done);
  }

  private wood(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const f = (720 + p.sizeNorm * 520) * p.hueMul;
    const decay = 0.055 + p.sizeNorm * 0.04;

    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 3.2 + p.bright * 1.4;
    const ng = ctx.createGain();
    env(ng.gain, now, p.loud * 0.42, decay);
    src.connect(bp).connect(ng).connect(dest);
    src.start(now);
    src.stop(now + decay + 0.03);

    const nodes: AudioNode[] = [src, bp, ng];
    if (!this.lite) {
      const tick = ctx.createOscillator();
      tick.type = 'triangle';
      tick.frequency.setValueAtTime(f * 1.35, now);
      const tg = ctx.createGain();
      env(tg.gain, now, p.loud * 0.16, decay * 0.55);
      tick.connect(tg).connect(dest);
      tick.start(now);
      tick.stop(now + decay + 0.02);
      nodes.push(tick, tg);
    }
    finish(src, nodes, done);
  }

  private thud(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const start = (72 + p.sizeNorm * 50) * p.hueMul;
    const end = (26 + p.sizeNorm * 16) * p.hueMul;
    const decay = (0.2 + (1 - p.sizeNorm) * 0.22 + p.mass * 0.01) * p.decayMul;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(end, 20), now + 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280 + p.bright * 220;
    const g = ctx.createGain();
    env(g.gain, now, p.loud * 0.85, decay);
    osc.connect(lp).connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + decay + 0.04);

    const nodes: AudioNode[] = [osc, lp, g];
    if (!this.lite) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise!;
      const nlp = ctx.createBiquadFilter();
      nlp.type = 'lowpass';
      nlp.frequency.value = 180 + p.sizeNorm * 80;
      const ng = ctx.createGain();
      env(ng.gain, now, p.loud * 0.18, 0.05);
      src.connect(nlp).connect(ng).connect(dest);
      src.start(now);
      src.stop(now + 0.06);
      nodes.push(src, nlp, ng);
    }
    finish(osc, nodes, done);
  }

  private click(now: number, p: Mapped, done: () => void, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400 + p.bright * 1800;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + p.sizeNorm * 900;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    env(g.gain, now, p.loud * 0.38, 0.032);
    src.connect(hp).connect(bp).connect(g).connect(dest);
    src.start(now);
    src.stop(now + 0.045);
    finish(src, [src, hp, bp, g], done);
  }
}

type Mapped = {
  family: Family;
  sizeNorm: number;
  bright: number;
  hueMul: number;
  loud: number;
  echo: number;
  mass: number;
  decayMul: number;
};

function mapHit(params: HitParams, lite: boolean): Mapped {
  const sizeNorm = clamp01(
    (params.sizeMax - params.size) / Math.max(params.sizeMax - params.sizeMin, 1e-4),
  );
  const L = clamp01((params.color.L - OKLCH_L_MIN) / (OKLCH_L_MAX - OKLCH_L_MIN));
  const C = clamp01((params.color.C - OKLCH_C_MIN) / (OKLCH_C_MAX - OKLCH_C_MIN));
  let bright = L * 0.55 + C * 0.45;
  let axis = clamp01(sizeNorm * 0.58 + bright * 0.42);
  if (params.deeper || params.kind === 'merge') axis *= 0.42;
  const band = bandOf(params.generation ?? 0);
  const family = pickFamily(axis, band);
  const scale = SCALES[band];
  const degree =
    (Math.floor(((params.color.h % 360) / 360) * scale.length) + (params.degreeShift ?? 0) + scale.length * 8) %
    scale.length;
  const hueMul = REGISTER[band] * 2 ** (scale[degree] / 12);
  const speed = Math.min(Math.max(params.speed, 0), 14);
  const depthT = clamp01(params.depthT ?? 1);
  let loud =
    Math.min(0.18 + speed * 0.035 + (params.deeper || params.kind === 'merge' ? 0.08 : 0), 0.62) *
    (0.32 + 0.68 * depthT);
  let echo = (1 - depthT) * (lite ? 0.26 : 0.4);
  let decayMul = params.deeper || params.kind === 'merge' ? 1.9 : 1;
  const surface = params.surface ?? 'shape';
  if (surface === 'pointer') {
    echo *= 0.18;
    loud *= 0.92;
    bright = Math.min(1, bright + 0.18);
    decayMul *= 0.62;
  } else if (surface === 'wall') {
    echo = Math.min(0.72, echo * 1.45 + (lite ? 0.12 : 0.2));
    bright *= 0.78;
    decayMul *= 1.12;
  }
  if (params.kind === 'vertexLoss') {
    echo *= 0.22;
    decayMul = 0.4;
  }
  return { family, sizeNorm, bright, hueMul, loud, echo, mass: Math.min(params.mass, 4), decayMul };
}

function bandOf(generation: number): 0 | 1 | 2 {
  if (generation <= 0) return 0;
  if (generation === 1) return 1;
  return 2;
}

function pickFamily(axis: number, band: 0 | 1 | 2): Family {
  const palette = band === 0 ? YOUNG : band === 1 ? MID : OLD;
  const i = Math.min(palette.length - 1, Math.floor(clamp01(axis) * palette.length));
  return palette[i];
}

function env(param: AudioParam, now: number, peak: number, decay: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(0.0001, now);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + 0.004);
  param.exponentialRampToValueAtTime(0.0001, now + Math.max(decay, 0.02));
}

function finish(last: AudioScheduledSourceNode, nodes: AudioNode[], done: () => void): void {
  last.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
    done();
  };
}

function setPlaybackSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = 'playback';
  } catch {
    /* Safari without Audio Session API */
  }
}

// 1-sample silent buffer + HTML5 Audio tick: iOS will not route Web Audio
// until something has actually played inside a user gesture.
function primeOutput(ctx: AudioContext): void {
  const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);

  const tick = new Audio(
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA',
  );
  void tick.play().catch(() => {});
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}
