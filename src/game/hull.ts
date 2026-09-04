import { Vector3 } from 'three';
import { MAX_VERTS, MIN_VERTS } from '../config';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function hullPoints(n: number, radius: number, rng: () => number): Vector3[] {
  const count = Math.min(Math.max(Math.round(n), MIN_VERTS), MAX_VERTS);
  if (count === 4) return regularTetra(radius, rng);
  const points: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN * i;
    const p = new Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
    p.multiplyScalar(radius);
    p.x += (rng() - 0.5) * radius * 0.18;
    p.y += (rng() - 0.5) * radius * 0.18;
    p.z += (rng() - 0.5) * radius * 0.18;
    const len = p.length();
    if (len > 1e-6) p.multiplyScalar(radius / len);
    points.push(p);
  }
  return points;
}

function regularTetra(radius: number, rng: () => number): Vector3[] {
  const raw = [
    new Vector3(1, 1, 1),
    new Vector3(1, -1, -1),
    new Vector3(-1, 1, -1),
    new Vector3(-1, -1, 1),
  ];
  return raw.map((p) => {
    p.normalize().multiplyScalar(radius);
    p.x += (rng() - 0.5) * radius * 0.08;
    p.y += (rng() - 0.5) * radius * 0.08;
    p.z += (rng() - 0.5) * radius * 0.08;
    return p.multiplyScalar(radius / Math.max(p.length(), 1e-6));
  });
}

export function pointsToFlat(points: Vector3[]): Float32Array {
  const out = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    out[i * 3] = points[i].x;
    out[i * 3 + 1] = points[i].y;
    out[i * 3 + 2] = points[i].z;
  }
  return out;
}

/** Jitter-free shell used when morphing a sphere toward a hull. */
export function spherePoints(n: number, radius: number): Vector3[] {
  const count = Math.max(Math.round(n), 4);
  const points: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN * i;
    points.push(new Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
  }
  return points;
}

export function scaleHull(points: Vector3[], radius: number): Vector3[] {
  return points.map((p) => {
    const q = p.clone();
    const len = q.length();
    if (len < 1e-6) q.set(radius, 0, 0);
    else q.multiplyScalar(radius / len);
    return q;
  });
}

/** Keep directions, add/drop vertices until `n`, all on a sphere of `radius`. */
export function fitHullCount(points: Vector3[], n: number, radius: number): Vector3[] {
  const target = Math.max(Math.round(n), 4);
  let pts = points.length ? points.map((p) => p.clone()) : spherePoints(target, radius);
  pts = scaleHull(pts, radius);
  while (pts.length < target) {
    let bi = 0;
    let bj = 1;
    let bd = -1;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = pts[i].distanceToSquared(pts[j]);
        if (d > bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    const mid = pts[bi].clone().add(pts[bj]).multiplyScalar(0.5);
    pts.push(scaleHull([mid], radius)[0]);
  }
  while (pts.length > target) {
    let drop = 0;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      let nearest = Infinity;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const d = pts[i].distanceToSquared(pts[j]);
        if (d < nearest) nearest = d;
      }
      if (nearest < best) {
        best = nearest;
        drop = i;
      }
    }
    pts.splice(drop, 1);
  }
  return pts;
}

/** Reorder `from` so each point sits nearest the corresponding `to` point. */
export function matchHull(from: Vector3[], to: Vector3[]): Vector3[] {
  const used = new Uint8Array(from.length);
  const out: Vector3[] = [];
  for (const t of to) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < from.length; i++) {
      if (used[i]) continue;
      const d = from[i].distanceToSquared(t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    used[best] = 1;
    out.push(from[best].clone());
  }
  return out;
}
