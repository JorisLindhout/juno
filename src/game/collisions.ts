import { Vector3 } from 'three';
import { MIN_VERTS, isElder } from '../config';
import type { Shape } from './Shape';
import type { ActionKind } from './types';

export type CollisionKind = 'shape' | 'wall' | 'pointer';

export type GameplayIsland = {
  shapes: Shape[];
  action: ActionKind;
  victim: Shape | null;
  toward: Vector3;
};

export type Impact = {
  shape: Shape;
  kind: 'wall' | 'pointer';
};

export function collectIslands(pairs: Array<[Shape, Shape]>): Shape[][] {
  const parent = new Map<number, Shape>();
  const find = (s: Shape): Shape => {
    let cur = parent.get(s.id) ?? s;
    if (cur.id !== s.id) {
      cur = find(cur);
      parent.set(s.id, cur);
    }
    return cur;
  };
  for (const [a, b] of pairs) {
    if (!parent.has(a.id)) parent.set(a.id, a);
    if (!parent.has(b.id)) parent.set(b.id, b);
    const ra = find(a);
    const rb = find(b);
    if (ra.id !== rb.id) parent.set(ra.id, rb);
  }
  const groups = new Map<number, Shape[]>();
  const seen = new Set<number>();
  for (const [a, b] of pairs) {
    for (const s of [a, b]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const r = find(s);
      const list = groups.get(r.id) ?? [];
      list.push(s);
      groups.set(r.id, list);
    }
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

/** An island may merge unless every body in it is already elder (gen 2). */
export function islandCanMerge(shapes: Shape[]): boolean {
  return shapes.some((s) => !isElder(s.generation));
}

export function rollAction(shapes: Shape[], rng: () => number): ActionKind {
  let wMerge = 0;
  let wBounce = 0;
  let wVertexLoss = 0;
  for (const s of shapes) {
    wMerge += s.props.wMerge;
    wBounce += s.props.wBounce;
    wVertexLoss += s.props.wVertexLoss;
  }
  const n = shapes.length;
  wMerge /= n;
  wBounce /= n;
  wVertexLoss /= n;
  const sum = wMerge + wBounce + wVertexLoss || 1;
  const r = rng() * sum;
  if (r < wMerge) return islandCanMerge(shapes) ? 'merge' : 'bounce';
  if (r < wMerge + wBounce) return 'bounce';
  return 'vertexLoss';
}

export function pickDominant(shapes: Shape[], now: number): Shape {
  let best = shapes[0];
  let bestD = best.dominance(now);
  for (let i = 1; i < shapes.length; i++) {
    const s = shapes[i];
    const d = s.dominance(now);
    if (d > bestD || (d === bestD && s.id > best.id)) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

export function pickEmitter(shapes: Shape[], rng: () => number): Shape {
  let best = shapes[0];
  let bestW = -1;
  const tied: Shape[] = [];
  for (const s of shapes) {
    if (s.props.wSpawn > bestW) {
      bestW = s.props.wSpawn;
      best = s;
      tied.length = 0;
      tied.push(s);
    } else if (s.props.wSpawn === bestW) {
      tied.push(s);
    }
  }
  return tied.length > 1 ? tied[Math.floor(rng() * tied.length)] : best;
}

export function pickVictim(shapes: Shape[], rng: () => number): Shape {
  let best = shapes[0];
  let bestW = -1;
  const tied: Shape[] = [];
  for (const s of shapes) {
    if (s.props.wVertexLoss > bestW) {
      bestW = s.props.wVertexLoss;
      best = s;
      tied.length = 0;
      tied.push(s);
    } else if (s.props.wVertexLoss === bestW) {
      tied.push(s);
    }
  }
  return tied.length > 1 ? tied[Math.floor(rng() * tied.length)] : best;
}

export function victimToward(victim: Shape, island: Shape[]): Vector3 {
  const p = new Vector3();
  let n = 0;
  for (const s of island) {
    if (s === victim) continue;
    const t = s.body.translation();
    p.x += t.x;
    p.y += t.y;
    p.z += t.z;
    n++;
  }
  if (n === 0) {
    const t = victim.body.translation();
    return new Vector3(t.x, t.y, t.z);
  }
  p.multiplyScalar(1 / n);
  return p;
}

export function canLoseVertex(shape: Shape): boolean {
  return shape.props.n >= MIN_VERTS && shape.props.n !== 0;
}

export function willDie(shape: Shape): boolean {
  return shape.props.n === MIN_VERTS;
}
