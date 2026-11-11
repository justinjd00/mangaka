// Panel backgrounds: pure functions (x, y, W, H) => tone, 0 white to 1 black.
// Coordinates are panel pixels before supersampling; wrap with scaled(fn, ss)
// to sample a supersampled buffer. Each function carries a plain `desc`
// describing it (used for cache keys).
import { fbm } from './sdf.mjs';
import { hash32, rand01 } from './rng.mjs';

const { max, min, hypot, floor, abs, sin, cos, atan2, PI } = Math;
const sst = (a, b, x) => { const t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = v => max(0, min(1, v));
const described = (fn, desc) => Object.assign(fn, { desc });

/** Sample `fn` (panel pixels) from a buffer supersampled by `ss`. */
export const scaled = (fn, ss = 1) => ss === 1 ? fn
  : described((x, y, W, H) => fn(x / ss, y / ss, W / ss, H / ss), { ...(fn.desc || {}), ss });

export const flat = (v = 0) => described(() => v, { kind: 'flat', v });

export const gradient = (top, bottom) => described((x, y, W, H) => top + (bottom - top) * (y / max(1, H - 1)), { kind: 'gradient', top, bottom });

export const split = (xFrac, left, right) => described((x, y, W) => (x < W * xFrac ? left : right), { kind: 'split', xFrac, left, right });

/** Night sky with fbm clouds and an optional moon [x, y, r] in panel pixels. */
export function storm({ moon = null, seed = 'storm' } = {}) {
  const ox = rand01(seed, 'storm', 'ox') * 97, oy = rand01(seed, 'storm', 'oy') * 97;
  return described((x, y) => {
    const c1 = fbm(x * 0.0059 + ox, y * 0.0196 + oy, 0.3, 4);
    const c2 = fbm(x * 0.0154 + ox * 2.9, y * 0.042 + oy * 2.5, 1.3, 3);
    const cloud = sst(0.47, 0.66, c1 * 0.75 + c2 * 0.25);
    if (!moon) return clamp01(0.93 - cloud * 0.34);
    const [mx, my, mr] = moon;
    const r = hypot(x - mx, y - my);
    if (r < mr) {
      const wisp = sst(0.56, 0.7, c1 * 0.7 + c2 * 0.3) * sst(0.25, 1, r / mr + 0.25);
      return wisp * 0.72 + sst(0.93, 1, r / mr) * 0.12;
    }
    const halo = max(0, 1 - (r - mr) / (mr * 0.55));
    return clamp01(0.93 - 0.42 * halo * halo - cloud * (0.34 + 0.22 * halo));
  }, { kind: 'storm', moon, seed });
}

/** Radial focus lines around (cx, cy), starting near radius r0. Tone is 0 or 1. */
export function focusLines({ cx, cy, r0, count = 150, density = 0.5, seed = 'focus' }) {
  const on = [], start = [], width = [];
  for (let k = 0; k < count; k++) {
    on.push(rand01(seed, 'focus', k, 'on') <= density);
    start.push(r0 * (0.8 + 0.9 * rand01(seed, 'focus', k, 'start')));
    width.push(0.35 + 0.65 * rand01(seed, 'focus', k, 'width'));
  }
  return described((x, y) => {
    const dx = x - cx, dy = y - cy, r = hypot(dx, dy);
    const a = (atan2(dy, dx) / (2 * PI) + 0.5) * count;
    const k = min(count - 1, floor(a)), f = a - k;
    if (!on[k] || r < start[k]) return 0;
    const w = 0.5 * min(1, (r - start[k]) / (r0 * 1.2)) * width[k];
    return abs(f - 0.5) < w ? 1 : 0;
  }, { kind: 'focusLines', cx, cy, r0, count, density, seed });
}

/** Parallel speed lines at `angle` (radians), one lane every `pitch` px. Tone is 0 or 1. */
export function speedLines({ angle = 0, density = 0.5, pitch = 7, seed = 'speed' } = {}) {
  const lanes = new Map();
  const base = hash32(seed, 'speed');
  const laneOf = k => {
    let l = lanes.get(k);
    if (!l) {
      const h = slot => rand01(base, k, slot);
      l = { on: h(0) <= density, len: 120 + 500 * h(1), ph: 900 * h(2), w: 0.3 + 0.7 * h(3) };
      lanes.set(k, l);
    }
    return l;
  };
  const ca = cos(angle), sa = sin(angle);
  return described((x, y) => {
    const c = -sa * x + ca * y, t = ca * x + sa * y;
    const k = floor(c / pitch), f = c / pitch - k, l = laneOf(k);
    if (!l.on) return 0;
    const period = l.len * 1.5, u = (((t + l.ph) % period) + period) % period;
    if (u > l.len) return 0;
    return abs(f - 0.5) < 0.42 * sin(PI * u / l.len) * l.w ? 1 : 0;
  }, { kind: 'speedLines', angle, density, pitch, seed });
}
