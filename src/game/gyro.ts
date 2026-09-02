import { GRAVITY } from '../config';

export class Gyro {
  beta = 0;
  gamma = 0;
  enabled = false;
  private attached = false;

  async unlock(): Promise<void> {
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    if (DOE?.requestPermission) {
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
    const beta = (this.beta * Math.PI) / 180;
    const gamma = (this.gamma * Math.PI) / 180;
    const gx = Math.sin(gamma);
    const gy = -Math.cos(gamma) * Math.sin(beta);
    const gz = -Math.cos(gamma) * Math.cos(beta);
    const x = gx;
    const y = -gz;
    const z = gy;
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
    window.addEventListener('deviceorientation', (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      this.beta = e.beta;
      this.gamma = e.gamma;
      this.enabled = true;
    });
  }
}
