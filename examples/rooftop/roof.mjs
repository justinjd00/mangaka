// The school roof of the rooftop example: a paved roof with a parapet and a
// railing along its far edge, a water tank on legs, the stairwell hut, and
// beyond the railing a city skyline of plain boxes with lit windows. Every part
// is named under `roof.` or `city.`. The orthographic camera shows no
// perspective, so the skyline is built small and low, as it would look far away.
import * as S from '../../kit/sdf.mjs';
import { rngFor } from '../../kit/rng.mjs';
import { ground, wall, railing } from '../../kit/parts/architecture.mjs';

const EDGE = -0.62;   // z of the roof's far edge

/** Water tank on four legs with two hoops, a conical lid and a ladder. at: floor point under its centre. */
function waterTank(sc, prefix, { at, r = 0.62, h = 1.05, legs = 0.85 }) {
  const [x, y, z] = at, b = y + legs;
  for (const [i, [dx, dz]] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
    sc.add(`${prefix}.leg.${i}`, 'metalD', S.box([x + dx * r * 0.62, y + legs / 2, z + dz * r * 0.62], [0.035, legs / 2, 0.035]));
  }
  sc.add(`${prefix}.deck`, 'metalD', S.box([x, b - 0.03, z], [r * 0.8, 0.03, r * 0.8], 0.01));
  sc.add(`${prefix}.drum`, 'metal', S.cyl([x, b, z], [x, b + h, z], r));
  for (const [i, t] of [0.3, 0.72].entries()) sc.add(`${prefix}.hoop.${i}`, 'metalD', S.cyl([x, b + h * t, z], [x, b + h * t + 0.04, z], r + 0.012));
  sc.add(`${prefix}.lid`, 'metalD', S.ccone([x, b + h, z], [x, b + h + 0.22, z], r + 0.03, 0.06));
  const lx = x + r * 0.55, lz = z + r * 0.86;
  for (const s of [-1, 1]) sc.add(`${prefix}.ladder.${s < 0 ? 'l' : 'r'}`, 'metalD', S.cyl([lx + s * 0.13, y, lz], [lx + s * 0.13, b + h, lz], 0.014));
  for (let k = 1; k * 0.28 < legs + h; k++) sc.add(`${prefix}.rung.${k}`, 'metalD', S.cyl([lx - 0.13, y + k * 0.28, lz], [lx + 0.13, y + k * 0.28, lz], 0.01));
}

/** Stairwell hut with a steel door facing +Z and a flat overhang. at: floor point under its centre. */
function stairHut(sc, prefix, { at, size = [0.95, 1.2, 0.8] }) {
  const [x, y, z] = at, [hx, hy, hz] = size;
  sc.add(`${prefix}.walls`, 'stone', S.box([x, y + hy, z], [hx, hy, hz], 0.01));
  sc.add(`${prefix}.roof`, 'stone', S.box([x, y + 2 * hy + 0.05, z + 0.08], [hx + 0.08, 0.05, hz + 0.16], 0.01));
  sc.add(`${prefix}.door`, 'metalD', S.box([x - hx * 0.35, y + 0.95, z + hz + 0.012], [0.38, 0.95, 0.02], 0.006));
  sc.decals.push({ type: 'rivet', p: [x - hx * 0.35 + 0.28, y + 0.95, z + hz + 0.034], r: 0.02 });
}

/**
 * Skyline boxes beyond the railing, each with a few lit windows (white decals),
 * and a small water tank on one of them.
 */
function skyline(sc) {
  // One slot of 0.5 m per block; each block draws from its own random stream.
  for (let i = 0; i < 26; i++) {
    const rnd = rngFor('rooftop', 'skyline', i);
    const w = 0.18 + rnd() * 0.28, x = -6.5 + i * 0.5 + rnd() * (0.48 - w);
    const top = 0.6 + rnd() * 0.75, z = -2.4 - rnd() * 2.2, d = 0.2 + rnd() * 0.2, bottom = -3;
    const c = [x + w / 2, (top + bottom) / 2, z];
    sc.add(`city.block.${i}`, 'hair', S.box(c, [w / 2, (top - bottom) / 2, d]));
    // Windows: a sparse grid on the front face, lit at random.
    const front = z + d + 0.003;
    for (let row = 0; top - 0.07 - row * 0.075 > 0.2; row++) for (let col = 0; (col + 1) * 0.055 < w - 0.02; col++) {
      if (rnd() > 0.3) continue;
      const wx = x + 0.03 + col * 0.055, wy = top - 0.07 - row * 0.075;
      sc.poly([[wx, wy, front], [wx + 0.025, wy, front], [wx + 0.025, wy + 0.035, front], [wx, wy + 0.035, front]], { fill: '#fff' });
    }
    if (i === 7) waterTank(sc, 'city.tank', { at: [c[0], top, z], r: 0.08, h: 0.13, legs: 0.09 });
  }
}

/** The roof; with skyline, the city beyond the railing too (wide shots only, see the note above). */
export function buildRoof({ skyline: city = true } = {}) {
  const sc = S.scene();
  ground(sc, 'roof.floor', { slab: true, at: [0, 0, 1.1], size: [4.6, 0.15, 1.72], rough: 0.012 });
  wall(sc, 'roof.parapet', { from: [-4.6, 0, EDGE], to: [4.6, 0, EDGE], height: 0.42, thick: 0.24 });
  railing(sc, 'roof.rail', { from: [-4.5, 0.42, EDGE], to: [4.5, 0.42, EDGE], height: 0.72, spacing: 1.5, rails: 1, bars: 0.15, r: 0.02 });
  waterTank(sc, 'roof.tank', { at: [-3.0, 0, 0.05] });
  stairHut(sc, 'roof.hut', { at: [3.6, 0, 0.35] });
  if (city) skyline(sc);
  return sc;
}
