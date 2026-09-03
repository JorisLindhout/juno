import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import {
  Mesh,
  MeshStandardMaterial,
  Plane,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { MAX_POINTERS } from '../config';
import type { Bounds } from './types';

type Ball = {
  body: RigidBody;
  mesh: Mesh;
  fading: boolean;
  fade: number;
  clientX: number;
  clientY: number;
};

export class Pointers {
  bounds: Bounds = { halfW: 1, halfH: 1, halfD: 0.4 };
  radius = 0.12;
  private world: World;
  private scene: Scene;
  private camera: Camera;
  private canvas: HTMLCanvasElement;
  private balls = new Map<number, Ball>();
  private ndc = new Vector2();
  private raycaster = new Raycaster();
  private surface = new Plane(new Vector3(0, 0, 1), 0);
  private hit = new Vector3();
  private geo: SphereGeometry;
  private mat: MeshStandardMaterial;

  constructor(world: World, scene: Scene, camera: Camera, canvas: HTMLCanvasElement, radius: number) {
    this.world = world;
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.radius = radius;
    this.geo = new SphereGeometry(1, 20, 16);
    this.mat = new MeshStandardMaterial({
      color: 0xf2e6d4,
      emissive: 0xf2e6d4,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.45,
      metalness: 0.05,
      roughness: 0.25,
      depthWrite: false,
    });
  }

  attach(): void {
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('pointerleave', this.onLeave);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  enabled = false;
  private pinch0 = 0;

  pinchDolly(): number {
    const live: Ball[] = [];
    for (const b of this.balls.values()) if (!b.fading) live.push(b);
    if (live.length < 2) {
      this.pinch0 = 0;
      return 0;
    }
    const d = Math.hypot(live[0].clientX - live[1].clientX, live[0].clientY - live[1].clientY);
    if (this.pinch0 < 1) this.pinch0 = d;
    return Math.min(1, Math.max(-1, (this.pinch0 - d) / 220));
  }

  preStep(dt: number): void {
    const gone: number[] = [];
    for (const [id, ball] of this.balls) {
      if (ball.fading) {
        ball.fade += dt / 0.08;
        ball.mesh.scale.setScalar(this.radius * Math.max(0, 1 - ball.fade));
        (ball.mesh.material as MeshStandardMaterial).opacity = 0.45 * Math.max(0, 1 - ball.fade);
        if (ball.fade >= 1) gone.push(id);
        continue;
      }
      const pos = this.project(ball.clientX, ball.clientY);
      if (!pos) continue;
      ball.body.setNextKinematicTranslation(pos);
      ball.mesh.position.copy(pos);
    }
    for (const id of gone) this.remove(id, true);
  }

  private spawn(id: number, x: number, y: number): void {
    if (this.balls.has(id)) {
      this.move(id, x, y);
      return;
    }
    if (this.liveCount() >= MAX_POINTERS) return;
    const pos = this.project(x, y);
    if (!pos) return;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(pos.x, pos.y, pos.z)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(this.radius)
        .setRestitution(0)
        .setFriction(0.12)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const mesh = new Mesh(this.geo, this.mat.clone());
    mesh.scale.setScalar(this.radius);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.balls.set(id, { body, mesh, fading: false, fade: 0, clientX: x, clientY: y });
  }

  private move(id: number, x: number, y: number): void {
    const ball = this.balls.get(id);
    if (!ball || ball.fading) return;
    ball.clientX = x;
    ball.clientY = y;
    const pos = this.project(x, y);
    if (!pos) return;
    ball.body.setNextKinematicTranslation(pos);
    ball.mesh.position.copy(pos);
  }

  private lift(id: number): void {
    const ball = this.balls.get(id);
    if (!ball || ball.fading) return;
    this.world.removeRigidBody(ball.body);
    ball.fading = true;
    ball.fade = 0;
  }

  private remove(id: number, disposeMesh: boolean): void {
    const ball = this.balls.get(id);
    if (!ball) return;
    if (!ball.fading) this.world.removeRigidBody(ball.body);
    if (disposeMesh) {
      this.scene.remove(ball.mesh);
      (ball.mesh.material as MeshStandardMaterial).dispose();
    }
    this.balls.delete(id);
  }

  private liveCount(): number {
    let n = 0;
    for (const b of this.balls.values()) if (!b.fading) n++;
    return n;
  }

  private project(clientX: number, clientY: number): Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    const r = this.radius;
    const { halfW, halfH, halfD } = this.bounds;
    const maxToi = origin.length() + halfD * 2 + 4;

    const cast = this.world.castRay(
      new RAPIER.Ray(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z },
      ),
      maxToi,
      true,
      RAPIER.QueryFilterFlags.ONLY_DYNAMIC,
    );

    if (cast && cast.timeOfImpact > 1e-4) {
      const toi = Math.max(cast.timeOfImpact - r, 0);
      this.hit.copy(origin).addScaledVector(direction, toi);
    } else {
      this.surface.constant = -(halfD - r);
      const t = this.raycaster.ray.distanceToPlane(this.surface);
      if (t == null || t < 0) return null;
      this.hit.copy(origin).addScaledVector(direction, t);
    }

    this.hit.x = clamp(this.hit.x, -halfW + r, halfW - r);
    this.hit.y = clamp(this.hit.y, -halfH + r, halfH - r);
    this.hit.z = clamp(this.hit.z, -halfD + r, halfD - r);
    return this.hit;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') return;
    this.canvas.setPointerCapture(e.pointerId);
    this.spawn(e.pointerId, e.clientX, e.clientY);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (!this.balls.has(e.pointerId)) this.spawn(e.pointerId, e.clientX, e.clientY);
      else this.move(e.pointerId, e.clientX, e.clientY);
      return;
    }
    this.move(e.pointerId, e.clientX, e.clientY);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    this.lift(e.pointerId);
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') this.lift(e.pointerId);
  };
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(Math.max(v, a), b);
}
