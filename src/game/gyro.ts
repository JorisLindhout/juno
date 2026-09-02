import { GRAVITY } from '../config';

const POUR_DEG = 24;

type Permissioned = { requestPermission?: () => Promise<string> };

export class Gyro {
  beta = 0;
  gamma = 0;
  /** Degrees off the pose captured on first reading (left/right). */
  tiltX = 0;
  /** Degrees off rest (top toward/away from you). */
  tiltY = 0;
  enabled = false;
  private attached = false;
  private restBeta: number | null = null;
  private restGamma: number | null = null;

  async unlock(): Promise<void> {
    // iOS only shows the motion dialog when this runs inside a click
    // (not touchstart/pointerdown), and before other gated APIs consume
    // the user gesture — same order as Autobahn.
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & Permissioned)
      | undefined;
    if (typeof DOE?.requestPermission === 'function') {
      try {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return;
      } catch {
        return;
      }
    }
    this.attach();
  }

  gravity(): { x: number; y: number; z: number } {
    if (!this.enabled) return { x: 0, y: 0, z: -GRAVITY };
    const nx = clamp(this.tiltX / POUR_DEG, -1, 1);
    const ny = clamp(-this.tiltY / POUR_DEG, -1, 1);
    const x = Math.sign(nx) * Math.abs(nx) ** 0.85;
    const y = Math.sign(ny) * Math.abs(ny) ** 0.85;
    const lateral = Math.min(1, Math.hypot(x, y));
    const z = -Math.sqrt(Math.max(0, 1 - lateral * lateral * 0.72));
    const len = Math.hypot(x, y, z) || 1;
    return {
      x: (x / len) * GRAVITY,
      y: (y / len) * GRAVITY,
      z: (z / len) * GRAVITY,
    };
  }

  private attach(): void {
    if (this.attached) return;
    this.attached = true;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      this.beta = e.beta;
      this.gamma = e.gamma;
      if (this.restBeta == null || this.restGamma == null) {
        this.restBeta = e.beta;
        this.restGamma = e.gamma;
      }
      this.tiltX = e.gamma - this.restGamma;
      this.tiltY = e.beta - this.restBeta;
      this.enabled = true;
    };
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientationabsolute', onOrient);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
