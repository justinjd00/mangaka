// Weapon builders. Each takes (sc, prefix, params), adds parts named
// `<prefix>.<sub>` plus decals to the scene sc, and returns anchor points.
// Poleaxe, sword and spear are built in their own frame (grip or butt at the
// origin, +Y towards the head, blades in the XY plane) and placed with
// { at, R } (R row-major, as kit/sdf.mjs); see kit/attach.mjs for frames that
// follow a hand. An arrow is given by its two end points.
import * as S from '../sdf.mjs';
import { placed } from '../attach.mjs';
import { tag, lerp3, nrm, dSaw } from './util.mjs';

const { abs, max, min, atan2, hypot } = Math;

/**
 * Poleaxe: haft with collars and a leather wrap, crescent blade, beak, top
 * spike and rondel. Butt at the origin, head up +Y, blade towards -X.
 * Returns { base, top, head, grip } (grip: a good hand position on the wrap).
 */
export function poleaxe(sc, prefix, { at = null, R = null, length = 2.28 } = {}) {
  return placed(sc, { at, R }, s => {
    const L = length, k = L / 2.28, e = L - 2.28;
    const h = v => [0, v > 1.9 ? v + e : v * k, 0];
    s.add(`${prefix}.haft`, 'wood', S.cyl([0, 0, 0], [0, L, 0], 0.0165));
    [0.06, 0.92, 1.74, 1.97, 2.04].forEach((y, i) => s.add(`${prefix}.collar.${i}`, 'metalD', S.cyl(h(y), [0, h(y)[1] + 0.035, 0], 0.0225)));
    s.add(`${prefix}.wrap`, 'leather', dSaw(S.cyl(h(1.2), h(1.62), 0.019), h(1.2), [0.25, 1, 0], 0.022, 0.004, 0.004, 0.45));
    const Hd = h(2.12);
    const blade2 = (u, v) => max(hypot(u + 0.05, v) - 0.185, -(hypot(u - 0.125, v) - 0.215));
    s.add(`${prefix}.blade`, 'metal', S.raw((x, y, z) => {
      const u = x - Hd[0], v = y - Hd[1];
      const edge = -(hypot(u + 0.05, v) - 0.185);
      return max(blade2(u, v), abs(z - Hd[2]) - (0.0015 + 0.009 * min(1, max(0, edge) / 0.045)));
    }, [Hd[0] - 0.12, Hd[1], Hd[2], 0.22], 0.6, tag('axe.blade', Hd, 0.05, 0.185, 0.215, 0.125, 0.0015, 0.009, 0.045)));
    const neck = s.add(`${prefix}.neck`, 'metalD', S.box([Hd[0] - 0.045, Hd[1], Hd[2]], [0.06, 0.04, 0.012], 0.006));
    s.add(`${prefix}.socket`, 'metalD', S.cyl(h(2.05), h(2.22), 0.026));
    s.add(`${prefix}.beak`, 'metal', S.squash(S.rcone([Hd[0] + 0.02, Hd[1], Hd[2]], [Hd[0] + 0.19, Hd[1] - 0.035, Hd[2]], 0.034, 0.003), Hd, [1, 1, 0.45]));
    s.add(`${prefix}.spike`, 'metal', S.squash(S.rcone(h(2.22), h(2.49), 0.024, 0.002), h(2.32), [1, 1, 0.6]));
    s.add(`${prefix}.rondel`, 'metalD', S.cyl(h(2.21), h(2.225), 0.045));
    for (const [u, v] of [[-0.03, 0.022], [-0.03, -0.022], [-0.075, 0]]) s.rivet(neck, [Hd[0] + u, Hd[1] + v, 0.6], [0, 0, -1], 0.005);
    return { base: [0, 0, 0], top: [0, L, 0], head: Hd, grip: h(1.385) };
  });
}

/**
 * Sword with a lozenge-section blade tapering to a point, crossguard, wrapped
 * grip and pommel. The origin is the middle of the grip, the blade runs up +Y
 * with its flat facing Z. grip 0 leaves out grip and pommel (a broken hilt).
 * Returns { grip, guard, tip, pommel }.
 */
export function sword(sc, prefix, { at = null, R = null, blade = 0.75, width = 0.022, thick = 0.0045, guard = 0.09, grip = 0.18 } = {}) {
  return placed(sc, { at, R }, s => {
    const g2 = grip / 2, y0 = g2 + 0.022, y1 = y0 + blade, tipL = min(blade * 0.5, width * 3.5);
    s.add(`${prefix}.blade`, 'metal', S.raw((x, y, z) => {
      const t = max(0, min(1, (y1 - y) / tipL));
      const w = width * max(t, 0.04), th = thick * (0.4 + 0.6 * t);
      const cs = (abs(x) * th + abs(z) * w - w * th) / hypot(w, th);
      return max(cs, y0 - y, y - y1);
    }, [0, (y0 + y1) / 2, 0, hypot(blade / 2, width) + 0.005], 0.6, tag('sword.blade', y0, y1, tipL, width, thick, 0.04, 0.4)));
    for (const zs of [1, -1]) s.line([[0, y0 + 0.03, zs * (thick + 0.0008)], [0, y1 - tipL, zs * (thick + 0.0008)]], { w: 1 });
    s.add(`${prefix}.guard`, 'metalD', S.box([0, g2 + 0.011, 0], [guard, 0.011, 0.015], 0.005));
    const out = { grip: [0, 0, 0], guard: [0, g2 + 0.011, 0], tip: [0, y1, 0], pommel: [0, -g2, 0] };
    if (grip > 0) {
      s.add(`${prefix}.grip`, 'leather', dSaw(S.cyl([0, -g2, 0], [0, g2, 0], 0.0135), [0, -g2, 0], [0.3, 1, 0], 0.018, 0.003, 0.003, 0.45));
      s.add(`${prefix}.pommel`, 'metalD', S.ellipsoid([0, -g2 - 0.02, 0], [0.026, 0.022, 0.02]));
      out.pommel = [0, -g2 - 0.04, 0];
    }
    return out;
  });
}

/**
 * Spear: wooden shaft, iron socket and a flat leaf-shaped head, with a butt
 * cap. Butt at the origin, head up +Y, flat of the head facing Z.
 * Returns { base, top, tip }.
 */
export function spear(sc, prefix, { at = null, R = null, length = 2.1, head = 0.26 } = {}) {
  return placed(sc, { at, R }, s => {
    const L = length, hb = L + 0.06, tip = hb + head;
    s.add(`${prefix}.shaft`, 'wood', S.cyl([0, 0, 0], [0, L, 0], 0.0145));
    s.add(`${prefix}.butt`, 'metalD', S.ccone([0, -0.012, 0], [0, 0.05, 0], 0.017, 0.0155));
    s.add(`${prefix}.socket`, 'metalD', S.ccone([0, L - 0.05, 0], [0, hb + 0.01, 0], 0.019, 0.013));
    const c = [0, hb + head * 0.3, 0];
    s.add(`${prefix}.head`, 'metal', S.squash(S.smin(0.02,
      S.rcone([0, hb, 0], c, 0.011, 0.042),
      S.rcone(c, [0, tip, 0], 0.042, 0.001)), c, [1, 1, 0.22]));
    return { base: [0, 0, 0], top: [0, L, 0], tip: [0, tip, 0] };
  });
}

/**
 * Arrow from its tip to its nock: shaft, two crossed fletches near the nock and
 * an optional iron head (leave it out for an arrow stuck in the ground).
 * Returns { tip, nock }.
 */
export function arrow(sc, prefix, { tip = [0, 0, 0], nock = [0, 0.72, 0], r = 0.0075, head = true } = {}) {
  sc.add(`${prefix}.shaft`, 'wood', S.cyl(tip, nock, r));
  const a = lerp3(tip, nock, 0.86), b = lerp3(tip, nock, 0.99);
  const m = lerp3(a, b, 0.5), l = hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2;
  const tilt = atan2(nock[0] - tip[0], nock[1] - tip[1]);
  sc.add(`${prefix}.fletch.1`, 'cloth', S.xform(S.box(m, [0.022, l, 0.0025], 0.002), m, S.rotZ(-tilt)));
  sc.add(`${prefix}.fletch.2`, 'cloth', S.xform(S.box(m, [0.0025, l, 0.022], 0.002), m, S.rotZ(-tilt)));
  if (head) {
    const d = nrm([nock[0] - tip[0], nock[1] - tip[1], nock[2] - tip[2]]);
    sc.add(`${prefix}.head`, 'metalD', S.rcone([tip[0] + d[0] * 0.05, tip[1] + d[1] * 0.05, tip[2] + d[2] * 0.05], tip, r * 1.9, 0.0015));
  }
  return { tip: [...tip], nock: [...nock] };
}
