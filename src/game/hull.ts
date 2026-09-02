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
