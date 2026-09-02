import { Vector3 } from 'three';
import {
  circularMeanHue,
  geometricMean,
  mean,
  type Oklch,
} from '../color';
import {
  MAX_VERTS,
  MIN_VERTS,
  OKLCH_C_MAX,
  OKLCH_C_MIN,
  OKLCH_L_MAX,
  OKLCH_L_MIN,
} from '../config';
import { hullPoints } from './hull';
import type { Bounds, ShapeProps } from './types';
import type { Shape } from './Shape';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomProps(rng: () => number, sizeMin: number, sizeMax: number): ShapeProps {
  const sphere = rng() < 0.14;
  let wMerge = rng() + 0.15;
  let wBounce = rng() + 0.35;
  let wVertexLoss = rng() + 0.15;
  const wsum = wMerge + wBounce + wVertexLoss;
  wMerge /= wsum;
  wBounce /= wsum;
  wVertexLoss /= wsum;
  return {
    color: {
      L: lerp(OKLCH_L_MIN, OKLCH_L_MAX, rng()),
      C: lerp(OKLCH_C_MIN, OKLCH_C_MAX, rng()),
      h: rng() * 360,
    },
    opacity: lerp(0.72, 0.96, rng()),
    n: sphere ? 0 : Math.floor(lerp(MIN_VERTS, MAX_VERTS + 1, rng())),
    size: lerp(sizeMin, sizeMax, rng()),
    restitution: lerp(0.42, 0.94, rng()),
    friction: lerp(0.02, 0.14, rng()),
    linDamp: lerp(0.02, 0.08, rng()),
    angDamp: lerp(0.04, 0.14, rng()),
    gravityScale: lerp(-0.75, 1.15, rng()),
    density: lerp(0.55, 1.7, rng()),
    elasticity: lerp(0.12, 0.55, rng()),
    wMerge,
    wBounce,
    wVertexLoss,
  };
}

export function randomPose(
  rng: () => number,
  bounds: Bounds,
  size: number,
): { position: Vector3; linvel: Vector3; angvel: Vector3 } {
  const margin = size + 0.08;
  const position = new Vector3(
    lerp(-bounds.halfW + margin, bounds.halfW - margin, rng()),
    lerp(-bounds.halfH + margin, bounds.halfH - margin, rng()),
    lerp(-bounds.halfD * 0.72, bounds.halfD * 0.72, rng()),
  );
  const speed = lerp(1.6, 3.6, rng());
  const dir = new Vector3(rng() - 0.5, rng() - 0.5, (rng() - 0.5) * 0.45).normalize();
  const linvel = dir.multiplyScalar(speed);
  const spin = lerp(0.6, 2.8, rng());
  const angvel = new Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(spin);
  return { position, linvel, angvel };
}

export function hullFor(props: ShapeProps, rng: () => number): Vector3[] {
  if (props.n === 0) return [];
  return hullPoints(props.n, props.size, rng);
}

export function mergeProps(shapes: Shape[]): ShapeProps {
  const ps = shapes.map((s) => s.props);
  const color: Oklch = {
    L: mean(ps.map((p) => p.color.L)),
    C: mean(ps.map((p) => p.color.C)),
    h: circularMeanHue(ps.map((p) => p.color.h)),
  };
  const meanN = mean(ps.map((p) => p.n));
  let n: number;
  if (ps.every((p) => p.n === 0) || meanN < 2) n = 0;
  else n = Math.min(MAX_VERTS, Math.max(MIN_VERTS, Math.round(meanN)));

  let wMerge = mean(ps.map((p) => p.wMerge));
  let wBounce = mean(ps.map((p) => p.wBounce));
  let wVertexLoss = mean(ps.map((p) => p.wVertexLoss));
  const wsum = wMerge + wBounce + wVertexLoss || 1;
  wMerge /= wsum;
  wBounce /= wsum;
  wVertexLoss /= wsum;

  return {
    color,
    opacity: mean(ps.map((p) => p.opacity)),
    n,
    size: geometricMean(ps.map((p) => p.size)),
    restitution: mean(ps.map((p) => p.restitution)),
    friction: mean(ps.map((p) => p.friction)),
    linDamp: mean(ps.map((p) => p.linDamp)),
    angDamp: mean(ps.map((p) => p.angDamp)),
    gravityScale: mean(ps.map((p) => p.gravityScale)),
    density: mean(ps.map((p) => p.density)),
    elasticity: mean(ps.map((p) => p.elasticity)),
    wMerge,
    wBounce,
    wVertexLoss,
  };
}

export function averageVelocity(shapes: Shape[]): Vector3 {
  const v = new Vector3();
  for (const s of shapes) {
    const lv = s.body.linvel();
    v.x += lv.x;
    v.y += lv.y;
    v.z += lv.z;
  }
  v.multiplyScalar(1 / shapes.length);
  return v;
}

export function centroidOf(shapes: Shape[]): Vector3 {
  const p = new Vector3();
  for (const s of shapes) {
    const t = s.body.translation();
    p.x += t.x;
    p.y += t.y;
    p.z += t.z;
  }
  p.multiplyScalar(1 / shapes.length);
  return p;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
