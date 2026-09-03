import { GRAVITY } from '../config';

const SHAKE_DEADZONE = 1.8;
const JOLT_MAG = 3.4;
const GRAVITY_LP = 0.28;
const SHAKE_LP = 0.08;
const SHAKE_ACCEL = 1.1;
const SHAKE_DECAY = 0.7;
const REST_XY = 0.42;

type Permissioned = { requestPermission?: () => Promise<string> };

const REST = { x: 0, y: 0, z: -GRAVITY };

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
  private settleUntil = 0;

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

  reorient(): void {
    this.settleUntil = performance.now() + 520;
    this.gX = 0;
    this.gY = -9.81;
    this.gZ = 0;
    this.slowX = 0;
    this.slowY = -9.81;
    this.slowZ = 0;
    this.shX = 0;
    this.shY = 0;
    this.shZ = 0;
    this.joltUntil = 0;
    this.quietShake();
  }

  gravity(): { x: number; y: number; z: number } {
    if (!this.enabled || performance.now() < this.settleUntil) {
      this.quietShake();
      return { ...REST };
    }

    this.updateShake();

    const dir = this.worldVec(this.gX, this.gY, this.gZ);
    const mag = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const nx = dir.x / mag;
    const ny = dir.y / mag;
    const nz = dir.z / mag;
    const tilted = Math.hypot(nx, ny);
    const inverted = nz > -0.28;
    if (!inverted && tilted < REST_XY) return { ...REST };

    return { x: nx * GRAVITY, y: ny * GRAVITY, z: nz * GRAVITY };
  }

  private quietShake(): void {
    this.shake.x = 0;
    this.shake.y = 0;
    this.shake.z = 0;
    this.jolting = false;
  }

  private updateShake(): void {
    const now = performance.now();
    if (now - this.lastMotion > 40) {
      this.shX *= SHAKE_DECAY;
      this.shY *= SHAKE_DECAY;
      this.shZ *= SHAKE_DECAY;
    }
    const raw = this.worldVec(this.shX * this.toMs2, this.shY * this.toMs2, this.shZ * this.toMs2);
    const sm = Math.hypot(raw.x, raw.y, raw.z);
    if (sm > SHAKE_DEADZONE) {
      const k = SHAKE_ACCEL + Math.min(sm, 20) * 0.06;
      this.shake.x = raw.x * k;
      this.shake.y = raw.y * k;
      this.shake.z = raw.z * k;
    } else {
      this.shake.x *= SHAKE_DECAY;
      this.shake.y *= SHAKE_DECAY;
      this.shake.z *= SHAKE_DECAY;
    }
    this.jolting = sm > JOLT_MAG || now < this.joltUntil;
    if (sm > JOLT_MAG) this.joltUntil = now + 160;
  }

  private worldVec(x: number, y: number, z: number): { x: number; y: number; z: number } {
    return { x: x * this.sign, y: -z * this.sign, z: y * this.sign };
  }

  private ingestMotion(ag: { x: number; y: number; z: number }, user: { x: number; y: number; z: number } | null): void {
    const s = toScreen(ag.x, ag.y, ag.z);
    const u = user ? toScreen(user.x, user.y, user.z) : null;
    const mag = Math.hypot(s.x, s.y, s.z);
    if (mag > 4) this.toMs2 = 1;
    else if (mag > 0.15) this.toMs2 = 9.81;

    this.gX += (s.x - this.gX) * GRAVITY_LP;
    this.gY += (s.y - this.gY) * GRAVITY_LP;
    this.gZ += (s.z - this.gZ) * GRAVITY_LP;
    this.slowX += (s.x - this.slowX) * SHAKE_LP;
    this.slowY += (s.y - this.slowY) * SHAKE_LP;
    this.slowZ += (s.z - this.slowZ) * SHAKE_LP;

    if (u) {
      this.shX = u.x;
      this.shY = u.y;
      this.shZ = u.z;
    } else {
      this.shX = s.x - this.slowX;
      this.shY = s.y - this.slowY;
      this.shZ = s.z - this.slowZ;
    }

    this.hasMotion = true;
    this.enabled = true;
    this.lastMotion = performance.now();
    if (!this.motionCalibrated) {
      this.sign = 1;
      this.calibrated = false;
      this.motionCalibrated = true;
    }
    this.calibrate(s.x, s.y, s.z);
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
          a && a.x != null && a.y != null && a.z != null && Math.hypot(a.x, a.y, a.z) > 0.45
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
      const raw = toScreen(
        Math.sin(gamma) * 9.81,
        -Math.cos(gamma) * Math.sin(beta) * 9.81,
        -Math.cos(gamma) * Math.cos(beta) * 9.81,
      );
      this.gX = raw.x;
      this.gY = raw.y;
      this.gZ = raw.z;
      this.calibrate(raw.x, raw.y, raw.z);
    };
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientationabsolute', onOrient);
  }
}

/** DeviceMotion is in the phone's unrotated frame; the page may be landscape. */
function toScreen(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const a = screenAngle();
  if (a === 90) return { x: y, y: -x, z };
  if (a === 180) return { x: -x, y: -y, z };
  if (a === 270) return { x: -y, y: x, z };
  return { x, y, z };
}

function screenAngle(): number {
  const win = window as Window & { orientation?: number };
  const raw = screen.orientation?.angle ?? win.orientation ?? 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}
