import RAPIER from '@dimforge/rapier3d-compat';
import type { EventQueue, World } from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { Hits } from '../audio/hits';
import {
  COOLDOWN_MS,
  FPS_HIGH,
  FPS_LOW,
  GRAVITY,
  INITIAL_SHAPES,
  MIN_SPEED_FRAC,
  POINTER_RADIUS_FRAC,
  SIZE_MAX_FRAC,
  SIZE_MIN_FRAC,
  isMobile,
  maxShapes,
  pixelRatioCap,
} from '../config';
import {
  canLoseVertex,
  collectIslands,
  pickDominant,
  pickVictim,
  rollAction,
  victimToward,
  willDie,
} from './collisions';
import { Gyro } from './gyro';
import { Pointers } from './pointer';
import { Shape } from './Shape';
import { Stage } from './Stage';
import {
  averageVelocity,
  centroidOf,
  hullFor,
  mergeProps,
  mulberry32,
  randomPose,
  randomProps,
} from './spawn';

export class Game {
  private world: World;
  private events: EventQueue;
  private stage: Stage;
  private pointers: Pointers;
  private gyro = new Gyro();
  private hits = new Hits();
  private shapes: Shape[] = [];
  private departing: Shape[] = [];
  private rng = mulberry32((Math.random() * 1e9) | 0);
  private running = false;
  private last = 0;
  private fpsFrames = 0;
  private fpsT = 0;
  private dpr: number;
  private flashes = true;
  private envOn = true;
  private sizeMin = 0.2;
  private sizeMax = 0.6;
  private acc = 0;
  private readonly dt = 1 / 60;
  private paused = false;
  private unlocking = false;

  private constructor(canvas: HTMLCanvasElement, world: World) {
    this.world = world;
    this.world.timestep = isMobile() ? 1 / 45 : 1 / 60;
    this.world.maxCcdSubsteps = 1;
    this.events = new RAPIER.EventQueue(true);
    this.stage = new Stage(canvas, world);
    this.dpr = pixelRatioCap();
    this.stage.setPixelRatio(this.dpr);
    this.pointers = new Pointers(
      world,
      this.stage.scene,
      this.stage.camera,
      canvas,
      0.12,
    );
    this.pointers.attach();
    this.bindChrome();
  }

  static async create(canvas: HTMLCanvasElement): Promise<Game> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: -GRAVITY });
    const game = new Game(canvas, world);
    game.layout();
    game.populate(INITIAL_SHAPES);
    return game;
  }

  startLoop(): void {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  async unlock(): Promise<void> {
    if (this.unlocking) return;
    this.unlocking = true;
    await this.gyro.unlock();
    await this.hits.unlock();
    this.pointers.enabled = true;
  }

  private bindChrome(): void {
    const onResize = () => this.layout();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (!document.hidden) {
        this.last = performance.now();
        void this.hits.resume();
      }
    });
  }

  private layout(): void {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.floor(vv?.width ?? window.innerWidth));
    const h = Math.max(1, Math.floor(vv?.height ?? window.innerHeight));
    const bounds = this.stage.resize(w, h, this.dpr);
    const minSide = Math.min(bounds.halfW, bounds.halfH) * 2;
    this.sizeMin = minSide * SIZE_MIN_FRAC;
    this.sizeMax = minSide * SIZE_MAX_FRAC;
    this.pointers.bounds = bounds;
    this.pointers.radius = this.sizeMin * POINTER_RADIUS_FRAC;
  }

  private populate(count: number): void {
    const cap = maxShapes();
    for (let i = 0; i < count && this.shapes.length < cap; i++) {
      this.spawnRandom();
    }
  }

  private spawnRandom(): Shape | null {
    if (this.shapes.length >= maxShapes()) return null;
    const props = randomProps(this.rng, this.sizeMin, this.sizeMax);
    props.size = clamp(props.size, this.sizeMin, this.sizeMax);
    const pose = this.poseUnoccupied(props.size);
    const shape = new Shape(
      this.world,
      this.stage.scene,
      props,
      hullFor(props, this.rng),
      pose.position,
      pose.linvel,
      pose.angvel,
    );
    shape.setEnvIntensity(this.envOn ? 0.85 : 0);
    shape.lock(performance.now(), COOLDOWN_MS);
    this.shapes.push(shape);
    return shape;
  }

  private poseUnoccupied(size: number) {
    for (let i = 0; i < 36; i++) {
      const pose = randomPose(this.rng, this.stage.bounds, size);
      let ok = true;
      for (const s of this.shapes) {
        const t = s.body.translation();
        if (pose.position.distanceTo(new Vector3(t.x, t.y, t.z)) < size + s.size + 0.05) {
          ok = false;
          break;
        }
      }
      if (ok) return pose;
    }
    return randomPose(this.rng, this.stage.bounds, size);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    if (this.paused) return;
    const elapsed = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.acc += elapsed;
    this.pointers.preStep(elapsed);
    const g = this.gyro.gravity();
    this.world.gravity.x = g.x;
    this.world.gravity.y = g.y;
    this.world.gravity.z = g.z;
    this.stage.look(elapsed, g.x / GRAVITY, g.y / GRAVITY);

    let steps = 0;
    while (this.acc >= this.dt && steps < 2) {
      this.world.step(this.events);
      this.handleEvents(now);
      this.acc -= this.dt;
      steps++;
    }

    const minSpeed = Math.min(this.stage.bounds.halfW, this.stage.bounds.halfH) * MIN_SPEED_FRAC;
    const halfD = this.stage.bounds.halfD;
    const calm = !this.gyro.jolting;
    const driftXy = calm && Math.hypot(g.x, g.y) < GRAVITY * 0.16;
    for (const s of this.shapes) {
      if (calm) s.keepMoving(minSpeed, this.rng, driftXy);
      else s.body.wakeUp();
      s.updateVisual(now, elapsed, this.flashes);
      s.sync();
      s.cueDepth(halfD);
    }
    this.flushDeparting(now, elapsed);
    this.stage.driftAccent(elapsed);
    this.stage.render();
    this.sampleFps(elapsed);
  };

  private handleEvents(now: number): void {
    const shapePairs: Array<[Shape, Shape]> = [];
    const pairKeys = new Set<string>();
    const impacts: Array<{ shape: Shape; kind: 'wall' | 'pointer' }> = [];

    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.world.getCollider(h1);
      const b = this.world.getCollider(h2);
      if (!a || !b) return;
      const ba = a.parent();
      const bb = b.parent();
      if (!ba || !bb) return;
      const sa = this.shapeOf(ba.handle);
      const sb = this.shapeOf(bb.handle);
      if (sa && sb) {
        const key = sa.id < sb.id ? `${sa.id}:${sb.id}` : `${sb.id}:${sa.id}`;
        if (!pairKeys.has(key)) {
          pairKeys.add(key);
          shapePairs.push([sa, sb]);
        }
        return;
      }
      if (sa && !sb) {
        impacts.push({ shape: sa, kind: ba.isKinematic() || bb.isKinematic() ? 'pointer' : 'wall' });
      } else if (sb && !sa) {
        impacts.push({ shape: sb, kind: ba.isKinematic() || bb.isKinematic() ? 'pointer' : 'wall' });
      }
    });

    const islands = collectIslands(shapePairs);
    const toRemove = new Set<Shape>();
    const merges: Shape[][] = [];
    const bounceIslands: Shape[][] = [];
    const losses: Array<{ victim: Shape; toward: Vector3; island: Shape[] }> = [];
    const sounded = new Set<number>();

    for (const island of islands) {
      if (island.some((s) => s.locked(now))) continue;
      for (const s of island) s.lock(now, COOLDOWN_MS);
      const action = rollAction(island, this.rng);
      if (action === 'merge') {
        merges.push(island);
        continue;
      }
      bounceIslands.push(island);
      if (action === 'vertexLoss') {
        const victim = pickVictim(island, this.rng);
        if (victim.props.n === 0) continue;
        losses.push({ victim, toward: victimToward(victim, island), island });
      }
    }

    this.hits.beginBurst();
    bounceIslands.sort((a, b) => pickDominant(b, now).dominance(now) - pickDominant(a, now).dominance(now));
    for (const island of bounceIslands) {
      const winner = pickDominant(island, now);
      this.playHit(winner);
      for (const s of island) {
        sounded.add(s.id);
        s.flash(this.flashes);
      }
    }
    for (const island of merges) {
      for (const s of island) sounded.add(s.id);
    }

    impacts.sort((a, b) => Number(b.kind === 'pointer') - Number(a.kind === 'pointer'));
    for (const hit of impacts) {
      if (sounded.has(hit.shape.id)) continue;
      sounded.add(hit.shape.id);
      this.playHit(hit.shape);
      hit.shape.flash(this.flashes);
    }

    for (const island of merges) {
      for (const s of island) toRemove.add(s);
    }
    for (const { victim } of losses) {
      if (willDie(victim)) toRemove.add(victim);
    }

    for (const island of merges) {
      this.applyMerge(island);
    }

    for (const { victim, toward } of losses) {
      if (toRemove.has(victim) && willDie(victim)) {
        this.despawn(victim);
        this.maintainPopulation();
        continue;
      }
      if (!canLoseVertex(victim)) continue;
      victim.beginVertexLoss(toward);
    }
  }

  private applyMerge(island: Shape[]): void {
    const alive = island.filter((s) => this.shapes.includes(s));
    if (alive.length < 2) return;
    const props = mergeProps(alive);
    props.size = clamp(props.size, this.sizeMin, this.sizeMax);
    const position = centroidOf(alive);
    const linvel = averageVelocity(alive);
    const angvel = new Vector3();
    for (const s of alive) {
      const a = s.body.angvel();
      angvel.x += a.x;
      angvel.y += a.y;
      angvel.z += a.z;
    }
    angvel.multiplyScalar(1 / alive.length);
    for (const s of alive) this.despawn(s);
    const merged = new Shape(
      this.world,
      this.stage.scene,
      props,
      hullFor(props, this.rng),
      position,
      linvel,
      angvel,
    );
    merged.setEnvIntensity(this.envOn ? 0.85 : 0);
    merged.inheritLineage(alive);
    merged.lock(performance.now(), COOLDOWN_MS);
    merged.flash(this.flashes);
    this.shapes.push(merged);
    this.playHit(merged, true);
    this.maintainPopulation();
  }

  private maintainPopulation(): void {
    while (this.shapes.length < INITIAL_SHAPES) {
      if (!this.spawnRandom()) break;
    }
  }

  private despawn(shape: Shape): void {
    const i = this.shapes.indexOf(shape);
    if (i >= 0) this.shapes.splice(i, 1);
    else if (this.departing.includes(shape)) return;
    shape.beginVanish();
    this.departing.push(shape);
  }

  private flushDeparting(now: number, dt: number): void {
    for (let i = this.departing.length - 1; i >= 0; i--) {
      const s = this.departing[i];
      s.updateVisual(now, dt, this.flashes);
      s.sync();
      if (s.vanished()) {
        s.dispose(this.stage.scene);
        this.departing.splice(i, 1);
      }
    }
  }

  private shapeOf(bodyHandle: number): Shape | undefined {
    return this.shapes.find((s) => s.body.handle === bodyHandle);
  }

  private playHit(shape: Shape, deeper = false): void {
    const z = shape.body.translation().z;
    const halfD = this.stage.bounds.halfD;
    const depthT = (z + halfD) / Math.max(halfD * 2, 1e-4);
    this.hits.trigger({
      size: shape.size,
      sizeMin: this.sizeMin,
      sizeMax: this.sizeMax,
      color: shape.props.color,
      speed: shape.speed(),
      mass: shape.mass(),
      depthT,
      deeper,
      generation: shape.generation,
    });
  }

  private sampleFps(dt: number): void {
    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT < 1) return;
    const fps = this.fpsFrames / this.fpsT;
    this.fpsFrames = 0;
    this.fpsT = 0;
    if (fps < FPS_LOW) {
      if (this.dpr > 1.05) {
        this.dpr = Math.max(1, this.dpr * 0.82);
        this.stage.setPixelRatio(this.dpr);
      } else if (this.envOn) {
        this.envOn = false;
        this.stage.setEnvEnabled(false);
        for (const s of this.shapes) s.setEnvIntensity(0);
      } else {
        this.flashes = false;
      }
    } else if (fps > FPS_HIGH && this.dpr < pixelRatioCap() * 0.95) {
      this.dpr = Math.min(pixelRatioCap(), this.dpr * 1.08);
      this.stage.setPixelRatio(this.dpr);
    }
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(Math.max(v, a), b);
}
