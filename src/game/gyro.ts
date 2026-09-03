import { GRAVITY } from '../config';

const SHAKE_DEADZONE = 0.22;
const JOLT_MAG = 0.7;
const GRAVITY_LP = 0.48;
const SHAKE_LP = 0.1;
const TILT_POWER = 0.55;
const SHAKE_ACCEL = 1.25;
const SHAKE_DECAY = 0.78;

type Permissioned = { requestPermission?: () => Promise<string> };

export class Gyro {
  beta = 0;
  gamma = 0;
  enabled = false;
  jolting = false;
  /** World-space shake acceleration, same for every shape. */
  shake = { x: 0, y: 0, z: 0 };
  private attached = false;
  private gX = 0;
  private gY = -9.81;
  private gZ = 0;
  private slowX = 0;
  private slowY = -9.81;
  private slowZ = 0;
  private shX = 0;
  private shY = 0;
  private shZ = 0;
  private hasMotion = false;
  private joltUntil = 0;
  private sign = 1;
  private calibrated = false;
  private motionCalibrated = false;
  private lastMotion = 0;
  private toMs2 = 1;

  async unlock(): Promise<void> {
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & Permissioned)
      | undefined;
    const DME = window.DeviceMotionEvent as
      | (typeof DeviceMotionEvent & Permissioned)
      | undefined;
    const asks: Promise<unknown>[] = [];
    if (typeof DOE?.requestPermission === 'function') {
      asks.push(DOE.requestPermission().catch(() => 'denied'));
    }
    if (typeof DME?.requestPermission === 'function') {
      asks.push(DME.requestPermission().catch(() => 'denied'));
    }
    if (asks.length) await Promise.all(asks);
    this.attach();
  }

  gravity(): { x: number; y: number; z: number } {
    if (!this.enabled) {
      this.shake.x = 0;
      this.shake.y = 0;
      this.shake.z = 0;
      this.jolting = false;
      return { x: 0, y: 0, z: -GRAVITY };
    }

    const dir = this.worldVec(this.gX, this.gY, this.gZ);
    const mag = Math.hypot(dir.x, dir.y, dir.z) || 1;
    let nx = dir.x / mag;
    let ny = dir.y / mag;
    let nz = dir.z / mag;
    nx = Math.sign(nx) * Math.abs(nx) ** TILT_POWER;
    ny = Math.sign(ny) * Math.abs(ny) ** TILT_POWER;
    nz = Math.sign(nz) * Math.abs(nz) ** TILT_POWER;
    const nMag = Math.hypot(nx, ny, nz) || 1;
    const g = GRAVITY / nMag;

    const now = performance.now();
    if (now - this.lastMotion > 40) {
      this.shX *= SHAKE_DECAY;
      this.shY *= SHAKE_DECAY;
      this.shZ *= SHAKE_DECAY;
    }
    const raw = this.worldVec(this.shX * this.toMs2, this.shY * this.toMs2, this.shZ * this.toMs2);
    const sm = Math.hypot(raw.x, raw.y, raw.z);
    if (sm > SHAKE_DEADZONE) {
      const k = SHAKE_ACCEL + Math.min(sm, 20) * 0.08;
      this.shake.x = raw.x * k;
      this.shake.y = raw.y * k;
      this.shake.z = raw.z * k;
    } else {
      this.shake.x *= SHAKE_DECAY;
      this.shake.y *= SHAKE_DECAY;
      this.shake.z *= SHAKE_DECAY;
    }
    this.jolting = sm > JOLT_MAG || now < this.joltUntil;
    if (sm > JOLT_MAG) this.joltUntil = now + 280;

    return { x: nx * g, y: ny * g, z: nz * g };
  }

  private worldVec(x: number, y: number, z: number): { x: number; y: number; z: number } {
    return { x: x * this.sign, y: -z * this.sign, z: y * this.sign };
  }

  private ingestMotion(ag: { x: number; y: number; z: number }, user: { x: number; y: number; z: number } | null): void {
    const mag = Math.hypot(ag.x, ag.y, ag.z);
    if (mag > 4) this.toMs2 = 1;
    else if (mag > 0.15) this.toMs2 = 9.81;

    this.gX += (ag.x - this.gX) * GRAVITY_LP;
    this.gY += (ag.y - this.gY) * GRAVITY_LP;
    this.gZ += (ag.z - this.gZ) * GRAVITY_LP;
    this.slowX += (ag.x - this.slowX) * SHAKE_LP;
    this.slowY += (ag.y - this.slowY) * SHAKE_LP;
    this.slowZ += (ag.z - this.slowZ) * SHAKE_LP;

    if (user) {
      this.shX = user.x;
      this.shY = user.y;
      this.shZ = user.z;
    } else {
      this.shX = ag.x - this.slowX;
      this.shY = ag.y - this.slowY;
      this.shZ = ag.z - this.slowZ;
    }

    this.hasMotion = true;
    this.enabled = true;
    this.lastMotion = performance.now();
    if (!this.motionCalibrated) {
      this.sign = 1;
      this.calibrated = false;
      this.motionCalibrated = true;
    }
    this.calibrate(ag.x, ag.y, ag.z);
  }

  private calibrate(x: number, y: number, z: number): void {
    if (this.calibrated) return;
    const mag = Math.hypot(x, y, z);
    if (mag < 0.4) return;
    const w = this.worldVec(x, y, z);
    if (w.z > 0) this.sign = -1;
    this.calibrated = true;
  }

  private attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('devicemotion', (e: DeviceMotionEvent) => {
      const ag = e.accelerationIncludingGravity;
      if (ag && ag.x != null && ag.y != null && ag.z != null) {
        const a = e.acceleration;
        const user =
          a && a.x != null && a.y != null && a.z != null && Math.hypot(a.x, a.y, a.z) > 0.05
            ? { x: a.x, y: a.y, z: a.z }
            : null;
        this.ingestMotion({ x: ag.x, y: ag.y, z: ag.z }, user);
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
      const x = Math.sin(gamma) * 9.81;
      const y = -Math.cos(gamma) * Math.sin(beta) * 9.81;
      const z = -Math.cos(gamma) * Math.cos(beta) * 9.81;
      this.gX = x;
      this.gY = y;
      this.gZ = z;
      this.calibrate(x, y, z);
    };
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientationabsolute', onOrient);
  }
}
