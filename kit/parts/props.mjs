// Small prop builders. Each takes (sc, prefix, params), adds parts named
// `<prefix>.<sub>` plus decals to the scene sc, and returns anchor points.
// `at` is the point on the floor under the prop, `yaw` turns it about Y.
import * as S from '../sdf.mjs';
import { placed } from '../attach.mjs';
import { tag } from './util.mjs';

const { hypot, PI, sin, cos } = Math;

/** Wooden crate: a planked box inside a frame of edge boards. Returns { top }. */
export function crate(sc, prefix, { at = [0, 0, 0], size = 0.5, yaw = 0 } = {}) {
  return placed(sc, { at, R: S.rotY(yaw) }, s => {
    const h = size / 2, b = Math.min(0.06, size * 0.12), c = [0, h, 0];
    s.add(`${prefix}.body`, 'wood', S.box(c, [h - 0.012, h - 0.012, h - 0.012], 0.004));
    s.add(`${prefix}.frame`, 'wood', S.sub(S.box(c, [h, h, h], 0.006),
      S.box(c, [h - b, h - b, h + 0.1]), S.box(c, [h + 0.1, h - b, h - b]), S.box(c, [h - b, h + 0.1, h - b])));
    // Plank seams on the four sides.
    const o = h - 0.0105, k = 3;
    for (let i = 1; i < k; i++) {
      const y = b + (size - 2 * b) * i / k;
      for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const ux = nz, uz = -nx, L = h - b;
        s.line([[nx * o - ux * L, y, nz * o - uz * L], [nx * o + ux * L, y, nz * o + uz * L]], { w: 1 });
      }
    }
    return { top: [0, size, 0] };
  });
}

/**
 * Hanging-style lantern standing on its base: a paper body inside four iron
 * bars, a conical cap and a ring handle. Returns { light, top }.
 */
export function lantern(sc, prefix, { at = [0, 0, 0], height = 0.32, yaw = 0 } = {}) {
  return placed(sc, { at, R: S.rotY(yaw) }, s => {
    const k = height / 0.32, r = 0.075 * k;
    s.add(`${prefix}.base`, 'metalD', S.ccone([0, 0, 0], [0, 0.03 * k, 0], r * 1.25, r * 1.1));
    s.add(`${prefix}.body`, 'cloth', S.rcone([0, 0.06 * k, 0], [0, 0.21 * k, 0], r * 0.92, r * 0.86));
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + i * PI / 2;
      s.add(`${prefix}.bar.${i}`, 'metalD', S.cyl([cos(a) * r * 1.05, 0.02 * k, sin(a) * r * 1.05], [cos(a) * r, 0.25 * k, sin(a) * r], 0.005 * k));
    }
    s.add(`${prefix}.cap`, 'metalD', S.ccone([0, 0.24 * k, 0], [0, 0.29 * k, 0], r * 1.2, r * 0.25));
    const ry = 0.305 * k, rr = 0.022 * k, rt = 0.004 * k;
    s.add(`${prefix}.ring`, 'metalD', S.raw((x, y, z) => hypot(hypot(x, y - ry) - rr, z) - rt, [0, ry, 0, rr + rt], 1, tag('lantern.ring', ry, rr, rt)));
    return { light: [0, 0.135 * k, 0], top: [0, ry + rr, 0] };
  });
}

/**
 * Park bench: three seat slats and two back slats on iron legs. The sitter faces
 * +Z of the bench's frame. Returns { seat, back }.
 */
export function bench(sc, prefix, { at = [0, 0, 0], yaw = 0, length = 1.6, height = 0.45, depth = 0.42, back = true } = {}) {
  return placed(sc, { at, R: S.rotY(yaw) }, s => {
    const L = length / 2, d = depth / 2;
    for (let i = 0; i < 3; i++) {
      const z = -d + depth * (i + 0.5) / 3;
      s.add(`${prefix}.seat.${i}`, 'wood', S.box([0, height, z], [L, 0.018, depth / 7], 0.006));
    }
    for (const x of [-L + 0.12, L - 0.12]) {
      s.add(`${prefix}.leg.${x < 0 ? 'l' : 'r'}`, 'metalD', S.union(
        S.box([x, height / 2, d - 0.05], [0.02, height / 2, 0.02]),
        S.box([x, height / 2, -d + 0.05], [0.02, height / 2, 0.02]),
        S.box([x, height - 0.03, 0], [0.02, 0.015, d]),
        ...(back ? [S.box([x, height + 0.22, -d - 0.02], [0.02, 0.25, 0.018])] : [])));
    }
    if (back) for (let i = 0; i < 2; i++) {
      s.add(`${prefix}.back.${i}`, 'wood', S.box([0, height + 0.16 + i * 0.15, -d - 0.045], [L, 0.05, 0.016], 0.006));
    }
    return { seat: [0, height + 0.02, 0], back: [0, height + 0.3, -d] };
  });
}
