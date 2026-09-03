export const MAX_VERTS = 12;
export const MIN_VERTS = 4;
export const INITIAL_SHAPES = 8;
export const MIN_SHAPES = 4;
export const MAX_SHAPES_MOBILE = 12;
export const MAX_SHAPES_DESKTOP = 20;
export const MIN_SPEED_FRAC = 0.28;

export const SIZE_MIN_FRAC = 0.045;
export const SIZE_MAX_FRAC = 0.13;
export const BOX_DEPTH_FRAC = 0.78;
export const POINTER_RADIUS_FRAC = 0.5;
export const WALL_THICKNESS = 0.22;

export const COOLDOWN_MS = 180;
export const SPAWN_COOLDOWN_MS = 560;
export const SPAWN_CHANCE = 0.34;
export const APPEAR_SEC = 0.52;
export const VANISH_SEC = 0.4;
export const MAX_VOICES_MOBILE = 6;
export const MAX_VOICES_DESKTOP = 8;
export const MAX_HITS_PER_STEP_MOBILE = 4;
export const MAX_HITS_PER_STEP_DESKTOP = 6;
export const GENERATION_DOMINANCE = 8;
export const GENERATION_LOOK_MAX = 2;
export const MAX_POINTERS = 2;

export const PIXEL_RATIO_MOBILE = 1.5;
export const PIXEL_RATIO_DESKTOP = 2;
export const FPS_LOW = 40;
export const FPS_HIGH = 55;

export const GRAVITY = 7.4;
export const SHAKE_VEL_GAIN = 5.2;
export const CAMERA_FOV = 48;
export const CAMERA_Z = 8;

export const OKLCH_L_MIN = 0.58;
export const OKLCH_L_MAX = 0.74;
export const OKLCH_C_MIN = 0.18;
export const OKLCH_C_MAX = 0.32;

export const SCENE_BG = 0x0c0c10;

export function isMobile(): boolean {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth < 800 ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  );
}

export function maxShapes(): number {
  return isMobile() ? MAX_SHAPES_MOBILE : MAX_SHAPES_DESKTOP;
}

export function pixelRatioCap(): number {
  const cap = isMobile() ? PIXEL_RATIO_MOBILE : PIXEL_RATIO_DESKTOP;
  return Math.min(window.devicePixelRatio || 1, cap);
}

/** 0 = fresh, 1 = generation 2+ (same cap as the audio palettes). */
export function generationT(generation: number): number {
  return Math.min(Math.max(generation, 0), GENERATION_LOOK_MAX) / GENERATION_LOOK_MAX;
}

export function generationSpeedMul(generation: number): number {
  return 1.42 - 0.94 * generationT(generation);
}
