import type { Oklch } from '../color';

export type ShapeProps = {
  color: Oklch;
  opacity: number;
  n: number;
  size: number;
  restitution: number;
  friction: number;
  linDamp: number;
  angDamp: number;
  gravityScale: number;
  density: number;
  elasticity: number;
  wMerge: number;
  wBounce: number;
  wVertexLoss: number;
};

export type Bounds = {
  halfW: number;
  halfH: number;
  halfD: number;
};

export type ActionKind = 'merge' | 'bounce' | 'vertexLoss';
