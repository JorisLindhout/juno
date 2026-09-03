import { GRAVITY } from '../config';

const SHAKE_GAIN = 8.5;
const SHAKE_DEADZONE = 0.55;
const JOLT_MAG = 1.35;
const LP = 0.18;

type Permissioned = { requestPermission?: () => Promise<string> };

export class Gyro {
  beta = 0;
  gamma = 0;
  enabled = false;
  jolting = false;
  private attached = false;
  private lpX = 0;
  private lpY = -9.81;
  private lpZ = 0;
  private shX = 0;
  private shY = 0;
  private shZ = 0;
  private hasMotion = false;
  private joltUntil = 0;

  async unlock(): Promise<void> {
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
    const DME = window.DeviceMotionEvent as
      | (typeof DeviceMotionEvent & Permissioned)
      | undefined;
    if (typeof DME?.requestPermission === 'function') {
      try {
        await DME.requestPermission();
      } catch {
        /* orientation grant is enough on most iOS versions */
      }
    }
    this.attach();
  }

  gravity(): { x: number; y: number; z: number } {
    if (!this.enabled) return { x: 0, y: 0, z: -GRAVITY };
    const dir = mapDevice(this.lpX, this.lpY, this.lpZ);
    const mag = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const scale = GRAVITY / mag;
    let x = dir.x * scale;
    let y = dir.y * scale;
    let z = dir.z * scale;

    const nativeG = Math.hypot(this.lpX, this.lpY, this.lpZ);
    const toMs2 = nativeG > 4 ? 1 : 9.81;
    const shake = mapDevice(this.shX * toMs2, this.shY * toMs2, this.shZ * toMs2);
    const sm = Math.hypot(shake.x, shake.y, shake.z);
    if (sm > SHAKE_DEADZONE) {
      const k = SHAKE_GAIN * (GRAVITY / 9.81);
      x += shake.x * k;
      y += shake.y * k;
      z += shake.z * k;
    }
    this.jolting = sm > JOLT_MAG || performance.now() < this.joltUntil;
    if (sm > JOLT_MAG) this.joltUntil = performance.now() + 140;
    return { x, y, z };
  }

  private attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('devicemotion', (e: DeviceMotionEvent) => {
      const ag = e.accelerationIncludingGravity;
      if (ag && ag.x != null && ag.y != null && ag.z != null) {
        this.lpX += (ag.x - this.lpX) * LP;
        this.lpY += (ag.y - this.lpY) * LP;
        this.lpZ += (ag.z - this.lpZ) * LP;
        this.hasMotion = true;
        this.enabled = true;
      }
      const a = e.acceleration;
      if (a && a.x != null && a.y != null && a.z != null) {
        this.shX = a.x;
        this.shY = a.y;
        this.shZ = a.z;
      } else if (ag && ag.x != null && ag.y != null && ag.z != null) {
        this.shX = ag.x - this.lpX;
        this.shY = ag.y - this.lpY;
        this.shZ = ag.z - this.lpZ;
      }
    });
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      this.beta = e.beta;
      this.gamma = e.gamma;
      this.enabled = true;
      if (this.hasMotion) return;
      const beta = (e.beta * Math.PI) / 180;
      const gamma = (e.gamma * Math.PI) / 180;
      this.lpX = Math.sin(gamma) * 9.81;
      this.lpY = -Math.cos(gamma) * Math.sin(beta) * 9.81;
      this.lpZ = -Math.cos(gamma) * Math.cos(beta) * 9.81;
    };
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientationabsolute', onOrient);
  }
}

/** Phone X → screen X, phone Y (down when upright) → into the box, phone Z → screen Y. */
function mapDevice(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y: -z, z: y };
}
