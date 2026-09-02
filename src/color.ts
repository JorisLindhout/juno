export type Oklch = { L: number; C: number; h: number };

function toSrgb(c: number): number {
  const x = Math.min(Math.max(c, 0), 1);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

/** OKLCH (h in degrees) → sRGB 0–1. */
export function oklchToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b2 = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [toSrgb(r), toSrgb(g), toSrgb(b2)];
}

export function lerpHueShort(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

export function circularMeanHue(hues: number[]): number {
  let x = 0;
  let y = 0;
  for (const h of hues) {
    const r = (h * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
}

export function geometricMean(xs: number[]): number {
  return Math.exp(mean(xs.map((x) => Math.log(Math.max(x, 1e-6)))));
}
