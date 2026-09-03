import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import {
  Color,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { oklchToRgb } from '../color';
import {
  APPEAR_SEC,
  GENERATION_DOMINANCE,
  MIN_VERTS,
  VANISH_SEC,
  generationSpeedMul,
  generationT,
} from '../config';
import { pointsToFlat } from './hull';
import type { ShapeProps } from './types';

let nextId = 1;

const fillProto = new MeshStandardMaterial({
  metalness: 0.18,
  roughness: 0.38,
  envMapIntensity: 0.85,
  transparent: true,
  depthWrite: true,
});

export class Shape {
  readonly id = nextId++;
  props: ShapeProps;
  points: Vector3[];
  mesh: Mesh;
  body: RigidBody;
  collider: Collider;
  bornAt = performance.now();
  generation = 0;
  cooldownUntil = 0;
  morphing = false;
  flashUntil = 0;
  private world: World;
  private dropped: Vector3 | null = null;
  private dropOrigin = new Vector3();
  private morphT = 0;
  private morphDuration = 0.25;
  private fillMat: MeshStandardMaterial;
  private rgb = new Color();
  private emissive = new Color();
  private appearing = true;
  private disappearing = false;
  private scaleT = 0;
  private scaleFrom = 0;
  private pulse = 0;
  private appearGlow = 0;
  private ageMul = 1;

  constructor(
    world: World,
    scene: Scene,
    props: ShapeProps,
    points: Vector3[],
    position: Vector3,
    linvel: Vector3,
    angvel: Vector3,
    generation = 0,
  ) {
    this.world = world;
    this.props = props;
    this.points = points.map((p) => p.clone());
    this.generation = generation;

    const [r, g, b] = oklchToRgb(props.color.L, props.color.C, props.color.h);
    this.rgb.setRGB(r, g, b);
    this.emissive.copy(this.rgb);

    const age = generationT(generation);
    this.ageMul = 1 - 0.42 * age;
    this.appearGlow = generation === 0 ? 1 : generation === 1 ? 0.28 : 0;
    this.fillMat = fillProto.clone();
    this.fillMat.color.copy(this.rgb).multiplyScalar(this.ageMul);
    this.fillMat.opacity = props.opacity;
    this.fillMat.metalness = 0.36 - 0.32 * age;
    this.fillMat.roughness = 0.16 + 0.58 * age;
    this.fillMat.emissive.copy(this.emissive);
    this.fillMat.emissiveIntensity = 0.7 * this.appearGlow;

    const geometry = this.makeGeometry();
    this.mesh = new Mesh(geometry, this.fillMat);
    this.mesh.position.copy(position);
    this.mesh.scale.setScalar(0);
    scene.add(this.mesh);

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinvel(linvel.x, linvel.y, linvel.z)
      .setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z })
      .setLinearDamping(props.linDamp)
      .setAngularDamping(props.angDamp)
      .setGravityScale(props.gravityScale)
      .setCcdEnabled(props.size < 0.35 || linvel.length() > 4)
      .setCanSleep(false);
    this.body = world.createRigidBody(desc);
    this.collider = world.createCollider(this.makeColliderDesc(), this.body);
  }

  get n(): number {
    return this.props.n;
  }

  get size(): number {
    return this.props.size;
  }

  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  keepMoving(minSpeed: number, rng: () => number, driftXy = true): void {
    this.body.wakeUp();
    const floor = minSpeed * generationSpeedMul(this.generation);
    const v = this.body.linvel();
    const xy = Math.hypot(v.x, v.y);
    if (driftXy && xy < floor) {
      if (xy < 0.08) {
        const dir = new Vector3(rng() - 0.5, rng() - 0.5, 0);
        if (dir.lengthSq() < 1e-6) dir.set(1, 0.2, 0);
        dir.normalize().multiplyScalar(floor);
        this.body.setLinvel({ x: dir.x, y: dir.y, z: v.z }, true);
      } else {
        const s = floor / xy;
        this.body.setLinvel({ x: v.x * s, y: v.y * s, z: v.z }, true);
      }
    }
    const w = this.body.angvel();
    const spin = 0.45 + 1.15 * (1 - generationT(this.generation));
    if (Math.hypot(w.x, w.y, w.z) < spin * 0.18) {
      this.body.setAngvel(
        { x: (rng() - 0.5) * spin, y: (rng() - 0.5) * spin, z: (rng() - 0.5) * spin },
        true,
      );
    }
  }

  mass(): number {
    return this.body.mass();
  }

  locked(now: number): boolean {
    return this.appearing || this.disappearing || this.morphing || now < this.cooldownUntil;
  }

  beginVanish(): void {
    if (this.disappearing) return;
    this.appearing = false;
    this.disappearing = true;
    this.scaleFrom = this.mesh.scale.x;
    this.scaleT = 0;
    this.world.removeCollider(this.collider, false);
  }

  vanished(): boolean {
    return this.disappearing && this.scaleT >= 1;
  }

  lock(now: number, ms: number): void {
    this.cooldownUntil = now + ms;
  }

  dominance(now: number): number {
    return (now - this.bornAt) * 0.001 + this.generation * GENERATION_DOMINANCE;
  }

  inheritLineage(parents: Shape[]): void {
    let oldest = this.bornAt;
    let gen = 0;
    for (const p of parents) {
      if (p.bornAt < oldest) oldest = p.bornAt;
      if (p.generation > gen) gen = p.generation;
    }
    this.bornAt = oldest;
    this.generation = gen + 1;
  }

  flash(allow: boolean): void {
    if (!allow) return;
    this.fillMat.emissive.copy(this.emissive);
    this.fillMat.emissiveIntensity = Math.max(this.fillMat.emissiveIntensity, 0.85);
    this.flashUntil = performance.now() + 120;
    this.pulse = 1;
  }

  setEnvIntensity(value: number): void {
    this.fillMat.envMapIntensity = value;
  }

  sync(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  cueDepth(halfD: number): void {
    if (this.disappearing) return;
    const z = this.body.translation().z;
    const t = Math.min(Math.max((z + halfD) / Math.max(halfD * 2, 1e-4), 0), 1);
    this.fillMat.opacity = this.props.opacity * (0.48 + 0.52 * t);
    this.fillMat.color.copy(this.rgb).multiplyScalar(this.ageMul * (0.52 + 0.48 * t));
  }

  updateVisual(now: number, dt: number, allowFlash: boolean): void {
    this.pulse = Math.max(0, this.pulse - dt * 9);
    let scale = 1;
    if (this.appearing) {
      this.scaleT += dt / APPEAR_SEC;
      const u = Math.min(this.scaleT, 1);
      scale = easeOutCubic(u);
      this.appearGlow *= Math.max(0, 1 - dt * 1.6);
      if (u >= 1) this.appearing = false;
    } else if (this.disappearing) {
      this.scaleT += dt / VANISH_SEC;
      const u = Math.min(this.scaleT, 1);
      const k = easeInCubic(u);
      scale = this.scaleFrom * (1 - k);
      this.fillMat.opacity = this.props.opacity * (1 - k);
    }
    if (!this.disappearing) scale *= 1 + this.pulse * 0.14;
    this.mesh.scale.setScalar(scale);
    if (this.morphing && this.dropped) {
      this.morphT += dt / this.morphDuration;
      const u = Math.min(this.morphT, 1);
      const ease = 1 - (1 - u) * (1 - u);
      this.dropped.copy(this.dropOrigin).multiplyScalar(1 - ease * 0.88);
      this.rebuildRenderGeometry();
      if (u >= 1) this.finishMorph();
    }
    if (!allowFlash) {
      this.fillMat.emissiveIntensity = 0;
      this.pulse = 0;
      return;
    }
    const glow = this.appearing || this.appearGlow > 0.02 ? 0.72 * this.appearGlow : 0;
    if (now > this.flashUntil) {
      this.fillMat.emissiveIntensity *= Math.max(0, 1 - dt * 8);
      if (this.fillMat.emissiveIntensity < 0.02) this.fillMat.emissiveIntensity = 0;
    }
    this.fillMat.emissiveIntensity = Math.max(this.fillMat.emissiveIntensity, glow);
    if (glow > 0) this.fillMat.emissive.copy(this.emissive);
  }

  /** Drop the local vertex closest to a world-space point. */
  beginVertexLoss(worldPoint: Vector3): boolean {
    if (this.props.n === 0 || this.points.length <= MIN_VERTS) return false;
    const local = worldPoint.clone();
    this.mesh.worldToLocal(local);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d = this.points[i].distanceToSquared(local);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.dropped = this.points[best];
    this.dropOrigin.copy(this.points[best]);
    this.morphing = true;
    this.morphT = 0;
    this.morphDuration = Math.max(this.props.elasticity, 0.08);
    this.rebuildColliderFromPoints(this.points.filter((_, i) => i !== best));
    return true;
  }

  dispose(scene: Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.fillMat.dispose();
    this.world.removeRigidBody(this.body);
  }

  private finishMorph(): void {
    if (!this.dropped) {
      this.morphing = false;
      return;
    }
    this.points = this.points.filter((p) => p !== this.dropped);
    this.props.n = this.points.length;
    this.dropped = null;
    this.morphing = false;
    this.rebuildRenderGeometry();
  }

  private makeGeometry() {
    if (this.props.n === 0 || this.points.length < 4) {
      return new SphereGeometry(this.props.size, 24, 16);
    }
    return new ConvexGeometry(this.points.map((p) => p.clone()));
  }

  private rebuildRenderGeometry(): void {
    const next = this.makeGeometry();
    this.mesh.geometry.dispose();
    this.mesh.geometry = next;
  }

  private makeColliderDesc() {
    const events = RAPIER.ActiveEvents.COLLISION_EVENTS;
    if (this.props.n === 0 || this.points.length < 4) {
      return RAPIER.ColliderDesc.ball(this.props.size)
        .setRestitution(this.props.restitution)
        .setFriction(this.props.friction)
        .setDensity(this.props.density)
        .setActiveEvents(events);
    }
    const hull = RAPIER.ColliderDesc.convexHull(pointsToFlat(this.points));
    const desc =
      hull ??
      RAPIER.ColliderDesc.ball(this.props.size);
    return desc
      .setRestitution(this.props.restitution)
      .setFriction(this.props.friction)
      .setDensity(this.props.density)
      .setActiveEvents(events);
  }

  private rebuildColliderFromPoints(nextPoints: Vector3[]): void {
    this.world.removeCollider(this.collider, false);
    const saved = this.points;
    this.points = nextPoints;
    this.collider = this.world.createCollider(this.makeColliderDesc(), this.body);
    this.points = saved;
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInCubic(t: number): number {
  return t * t * t;
}
