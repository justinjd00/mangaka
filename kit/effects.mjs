// Panel effects drawn over the ink: rain, snow and ink spatter.
//
// Each constructor returns a plain effect object { kind, ...params, layers }.
// layers(w, h, { seed }) gives the SVG layers in panel pixels as
// [{ d, fill, stroke, width, opacity }]. `seed` defaults to the panel id, so the
// same effect on two panels differs. Rain and snow are drawn per screen cell
// from hashed keys, so marks in one area never depend on another area.
import { encoder } from './ink.mjs';
import { rand01, rngFor } from './rng.mjs';

const { floor, ceil, max, sin, cos, tan, sqrt, PI } = Math;
const CELL = 48;
const enc = encoder(1);

/** Marks of one cell: floor(lambda) plus one more with probability frac(lambda). */
const countIn = (lambda, ...keys) => floor(lambda) + (rand01(...keys, 'n') < lambda - floor(lambda) ? 1 : 0);

const circle = (x, y, r) => {
  const v = enc.val;
  return `M${v(x - r)} ${v(y)}a${v(r)} ${v(r)} 0 1 0 ${v(2 * r)} 0a${v(r)} ${v(r)} 0 1 0 ${v(-2 * r)} 0z`;
};

/**
 * Slanted rain streaks. density 1 is about one streak per 2300 px²; angle is the
 * slant from vertical in radians (positive leans right going down).
 * One in three streaks is a thin black line, the rest are white.
 */
export function rain({ density = 1, angle = 0.3, seed } = {}) {
  return {
    kind: 'rain', density, angle, seed,
    layers(w, h, ctx = {}) {
      const s = seed ?? ctx.seed ?? 'rain';
      const dx = sin(angle), dy = cos(angle);
      // Streaks start up to one panel height to the left (or right) so slanted ones still cover the panel.
      const reach = h * tan(angle);
      const x0 = floor(Math.min(0, -reach) / CELL), x1 = ceil(max(w, w - reach) / CELL);
      const lambda = CELL * CELL / 2300 * density;
      const white = [], black = [];
      for (let cy = 0; cy < ceil(h / CELL); cy++) for (let cx = x0; cx < x1; cx++) {
        const n = countIn(lambda, s, 'rain', cx, cy);
        for (let k = 0; k < n; k++) {
          const r = j => rand01(s, 'rain', cx, cy, k, j);
          const px = (cx + r(0)) * CELL, py = (cy + r(1)) * CELL, l = 26 + r(2) * 90;
          (r(3) < 1 / 3 ? black : white).push(enc.path([px, py, px + dx * l, py + dy * l]));
        }
      }
      return [
        { d: white.join(''), fill: 'none', stroke: '#fff', width: 1.15, opacity: 0.92 },
        { d: black.join(''), fill: 'none', stroke: '#000', width: 0.45, opacity: 1 },
      ];
    },
  };
}

/** Falling snow: white flakes with a thin black rim. density 1 is about one flake per 1800 px². */
export function snow({ density = 1, seed } = {}) {
  return {
    kind: 'snow', density, seed,
    layers(w, h, ctx = {}) {
      const s = seed ?? ctx.seed ?? 'snow';
      const lambda = CELL * CELL / 1800 * density;
      const flakes = [];
      for (let cy = 0; cy < ceil(h / CELL); cy++) for (let cx = 0; cx < ceil(w / CELL); cx++) {
        const n = countIn(lambda, s, 'snow', cx, cy);
        for (let k = 0; k < n; k++) {
          const r = j => rand01(s, 'snow', cx, cy, k, j);
          const rr = 1.2 + 2.6 * r(2) * r(2);
          flakes.push(circle((cx + r(0)) * CELL, (cy + r(1)) * CELL, rr));
        }
      }
      return [{ d: flakes.join(''), fill: '#fff', stroke: '#000', width: 0.6, opacity: 1 }];
    },
  };
}

/**
 * Ink spatter around `at` ([x, y] as fractions of the panel): `count` drops within
 * `radius` px, larger near the centre, plus a few streaks thrown outward.
 */
export function spatter({ at = [0.5, 0.5], count = 40, radius = 60, seed } = {}) {
  return {
    kind: 'spatter', at, count, radius, seed,
    layers(w, h, ctx = {}) {
      const s = seed ?? ctx.seed ?? 'spatter';
      const ox = at[0] * w, oy = at[1] * h;
      const drops = [];
      const blob = rngFor(s, 'spatter', 'blob');
      // Central splash: a lumpy disc.
      const R0 = radius * 0.16, pts = [];
      for (let k = 0; k < 18; k++) {
        const a = k / 18 * 2 * PI, rr = R0 * (0.75 + 0.5 * blob());
        pts.push(ox + cos(a) * rr, oy + sin(a) * rr);
      }
      drops.push(enc.path(pts, true));
      for (let k = 0; k < count; k++) {
        const r = j => rand01(s, 'spatter', k, j);
        const a = r(0) * 2 * PI, t = sqrt(r(1));
        const d = R0 + (radius - R0) * t, x = ox + cos(a) * d, y = oy + sin(a) * d;
        const size = max(0.6, (1 - t) * radius * 0.07 * (0.4 + r(2)));
        if (r(3) < 0.25) {
          // Streak pointing away from the centre, thick at the drop end.
          const l = size * (3 + 4 * r(4)), nx = -sin(a) * size * 0.5, ny = cos(a) * size * 0.5;
          drops.push(enc.path([x + nx, y + ny, x + cos(a) * l, y + sin(a) * l, x - nx, y - ny], true));
        } else drops.push(circle(x, y, size));
      }
      return [{ d: drops.join(''), fill: '#000', stroke: 'none', width: 0, opacity: 1 }];
    },
  };
}
