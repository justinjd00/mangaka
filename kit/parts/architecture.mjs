// Architecture builders. Each takes (sc, prefix, params), adds parts named
// `<prefix>.<sub>` plus decals to the scene sc, and returns anchor points.
// Units are metres, y up; positions are world points.
import * as S from '../sdf.mjs';
import { rngFor } from '../rng.mjs';
import { placed } from '../attach.mjs';
import { ANY, tag } from './util.mjs';

const { abs, sin, cos, atan2, hypot, ceil, max } = Math;

/** Rotation about Y that takes local +X to the horizontal direction from a to b. */
const yawTo = (a, b) => S.rotY(atan2(-(b[2] - a[2]), b[0] - a[0]));

/**
 * Fluted stone column on a square plinth with a ring moulding. broken: the
 * shaft ends in a jagged, slanted break below h; otherwise it ends at h under a
 * capital. tilt leans the top along +X. Returns { base, top }.
 */
export function column(sc, prefix, { base = [0, 0, 0], h = 2.4, r = 0.19, tilt = 0, broken = false } = {}) {
  const top = [base[0] + tilt, base[1] + h, base[2]];
  const shaft = S.disp(S.ccone(base, top, r, r * 0.9), (x, y, z) => {
    const a = atan2(x - base[0] - tilt * (y / h), z - base[2]);
    return 0.012 * abs(sin(a * 8)) - 0.012 + 0.012 * S.noise3(x * 9, y * 9, z * 9) + 0.004 * S.noise3(x * 40, y * 40, z * 40);
  }, 0.03, 0.5, tag('column.flutes8', base, h, r, tilt));
  if (broken) {
    sc.add(`${prefix}.shaft`, 'stone', S.inter(shaft, S.raw((x, y, z) => y - (base[1] + h - 0.12 + 0.22 * S.noise3(x * 7 + 3, 1, z * 7) - 0.3 * (x - base[0])), ANY, 0.6, tag('column.break', base, h))));
  } else {
    sc.add(`${prefix}.shaft`, 'stone', shaft);
    sc.add(`${prefix}.necking`, 'stone', S.ccone([top[0], top[1] - 0.08, top[2]], [top[0], top[1] - 0.02, top[2]], r * 0.95, r * 1.08));
    sc.add(`${prefix}.capital`, 'stone', S.box([top[0], top[1] + 0.05, top[2]], [r * 1.4, 0.07, r * 1.4], 0.015));
  }
  sc.add(`${prefix}.base`, 'stone', S.box([base[0], base[1] + 0.06, base[2]], [r * 1.35, 0.08, r * 1.35], 0.015));
  sc.add(`${prefix}.ring`, 'stone', S.ccone([base[0], base[1] + 0.14, base[2]], [base[0], base[1] + 0.2, base[2]], r * 1.22, r * 1.05));
  return { base: [...base], top: broken ? [top[0], top[1] - 0.12, top[2]] : [top[0], top[1] + 0.12, top[2]] };
}

/**
 * Rough earth. A mound (an ellipsoid cap with fbm bumps; at is its top centre)
 * or, with slab, a flat paved slab whose top is at at[1].
 * size: half extents [x, depth, z]. Returns { top }.
 */
export function ground(sc, prefix, { at = [0, 0, 0.15], size = [3.2, 0.62, 2.4], rough = 0.035, slab = false } = {}) {
  if (slab) {
    const c = [at[0], at[1] - size[1], at[2]];
    sc.add(`${prefix}.surface`, 'ground', S.disp(S.box(c, size, 0.01), (x, y, z) => -rough * S.fbm(x * 2.3, 0, z * 2.3, 3), rough, 0.6, tag('ground.slab', rough, 2.3, 3)));
  } else {
    const c = [at[0], at[1] - size[1], at[2]];
    sc.add(`${prefix}.surface`, 'ground', S.disp(S.ellipsoid(c, size),
      (x, y, z) => -rough * S.fbm(x * 3.1, 0, z * 3.1, 3) - 0.008 * S.noise3(x * 22, y * 22, z * 22), rough + 0.015, 0.5, tag('ground.mound', rough, 3.1, 3, 0.008, 22)));
  }
  return { top: [...at] };
}

/**
 * Scattered stones on a ring around `at` (ellipse radii `spread` times a
 * radius between inner and outer), sinking by `drop` per square metre from the
 * centre so they follow a mound. seed: the random stream's keys (default the
 * prefix). Returns { center }.
 */
export function rubble(sc, prefix, { at = [0, -0.03, 0.1], count = 22, inner = 0.38, outer = 1.68, spread = [1.3, 0.8], size = [0.025, 0.09], drop = 0.02, seed = [prefix] } = {}) {
  const rnd = rngFor(...seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.28, r = inner + rnd() * (outer - inner);
    const dx = cos(a) * r * spread[0], dz = sin(a) * r * spread[1];
    const s = size[0] + rnd() * (size[1] - size[0]);
    const c = [at[0] + dx, at[1] + s * 0.4 - drop * (dx * dx + dz * dz), at[2] + dz];
    sc.add(`${prefix}.${i}`, 'stone', S.xform(S.box(c, [s, s * (0.5 + rnd() * 0.5), s * (0.6 + rnd() * 0.6)], s * 0.25), c, S.mmul(S.rotY(rnd() * 3), S.rotZ(rnd() * 0.8))));
  }
  return { center: [...at] };
}

/**
 * A straight wall from `from` to `to` (points on its base line), with an
 * optional coping cap and horizontal joint lines every `courses` metres on both
 * faces. Returns { from, to, top } (top: middle of the top edge).
 */
export function wall(sc, prefix, { from = [0, 0, 0], to = [2, 0, 0], height = 1, thick = 0.2, cap = true, courses = 0, mat = 'stone' } = {}) {
  const len = hypot(to[0] - from[0], to[2] - from[2]);
  const R = yawTo(from, to), mid = [(from[0] + to[0]) / 2, from[1], (from[2] + to[2]) / 2];
  const ch = cap ? 0.05 : 0;
  sc.add(`${prefix}.body`, mat, S.xform(S.box([mid[0], mid[1] + (height - ch) / 2, mid[2]], [len / 2, (height - ch) / 2, thick / 2], 0.004), [mid[0], mid[1], mid[2]], R));
  if (cap) sc.add(`${prefix}.cap`, mat, S.xform(S.box([mid[0], mid[1] + height - ch / 2, mid[2]], [len / 2 + 0.02, ch / 2, thick / 2 + 0.03], 0.008), [mid[0], mid[1], mid[2]], R));
  if (courses > 0) {
    const n = S.mapply(R, [0, 0, 1]), d = S.mapply(R, [1, 0, 0]);
    for (let y = courses; y < height - ch - 0.02; y += courses) for (const side of [1, -1]) {
      const o = side * (thick / 2 + 0.0015);
      const p = (t, yy) => [mid[0] + d[0] * t + n[0] * o, mid[1] + yy, mid[2] + d[2] * t + n[2] * o];
      sc.line([p(-len / 2, y), p(len / 2, y)], { w: 1 });
    }
  }
  return { from: [...from], to: [...to], top: [mid[0], mid[1] + height, mid[2]] };
}

/**
 * A flight of solid steps rising along +Z of its own frame (turned by yaw) from
 * the foot at `at`. Returns { foot, top } (top: middle of the top step's front edge).
 */
export function stairs(sc, prefix, { at = [0, 0, 0], yaw = 0, steps = 5, rise = 0.17, run = 0.28, width = 1.2, mat = 'stone' } = {}) {
  return placed(sc, { at, R: S.rotY(yaw) }, s => {
    for (let i = 0; i < steps; i++) {
      const hgt = (i + 1) * rise;
      s.add(`${prefix}.step.${i}`, mat, S.box([0, hgt / 2, i * run + run / 2], [width / 2, hgt / 2, run / 2], 0.006));
    }
    return { foot: [0, 0, 0], top: [0, steps * rise, (steps - 1) * run] };
  });
}

/**
 * A railing from `from` to `to` (points on the floor): posts every `spacing`
 * metres or less, a top rail, `rails` evenly spaced mid rails and, with bars > 0,
 * vertical bars every `bars` metres. Returns { from, to, top: [fromTop, toTop] }.
 */
export function railing(sc, prefix, { from = [0, 0, 0], to = [2, 0, 0], height = 1.05, spacing = 1.2, rails = 1, bars = 0, r = 0.022, mat = 'metalD' } = {}) {
  const len = hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const at = (t, y) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + y, from[2] + (to[2] - from[2]) * t];
  const n = max(1, ceil(len / spacing));
  for (let i = 0; i <= n; i++) sc.add(`${prefix}.post.${i}`, mat, S.cyl(at(i / n, 0), at(i / n, height), r));
  sc.add(`${prefix}.rail.top`, mat, S.cyl(at(0, height), at(1, height), r * 1.15));
  for (let k = 1; k <= rails; k++) {
    const y = height * k / (rails + 1);
    sc.add(`${prefix}.rail.${k}`, mat, S.cyl(at(0, y), at(1, y), r * 0.7));
  }
  if (bars > 0) {
    const nb = ceil(len / bars);
    for (let i = 1; i < nb; i++) {
      if (i * n % nb === 0) continue; // a post stands there
      sc.add(`${prefix}.bar.${i}`, mat, S.cyl(at(i / nb, 0.02), at(i / nb, height), r * 0.4));
    }
  }
  return { from: [...from], to: [...to], top: [at(0, height), at(1, height)] };
}

