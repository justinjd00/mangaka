// Plate armour builders. Each takes (sc, prefix, params), adds parts named
// `<prefix>.<sub>` plus decals to the scene sc, and returns anchor points.
// Defaults fit a 1.8 m figure standing at the origin and facing +Z (the knight
// of examples/gate): every builder called with defaults gives a piece that sits
// where it would on that figure. Side is +1 for the figure's left (+X), -1 for
// its right.
import * as S from '../sdf.mjs';
import { ANY, tag, add, at3, lerp3, nrm, dFlutes, dSaw } from './util.mjs';

const { abs, max, min, sin, cos, atan2, hypot, PI } = Math;
const flat = (f, o, k) => S.squash(f, o, [1, 1, k]);

/**
 * Great helm with eye slits, breaths, a riveted band, a comb and a plume.
 * at: centre of the helm's lower rim. Returns { base, top, visor }.
 */
export function greatHelm(sc, prefix, { at = [0, 1.652, 0.012], plume = true } = {}) {
  const A = (x, y, z) => at3(at, x, y, z);
  const core = S.round(S.ccone(at, A(0, 0.236, 0), 0.112, 0.097), 0.012);
  const prow = (x, y, z) => (z > at[2] - 0.012 ? -0.018 * max(0, 1 - abs(x - at[0]) / 0.045) : 0);
  const withProw = (f, amp, st) => S.disp(f, prow, amp, st, tag('helm.prow', at, 0.012, 0.018, 0.045));
  const slits = S.union(S.box(A(-0.054, 0.138, 0.098), [0.04, 0.0068, 0.07]), S.box(A(0.054, 0.138, 0.098), [0.04, 0.0068, 0.07]));
  const shell = S.sub(withProw(core, 0.018, 0.6), slits);
  sc.add(`${prefix}.shell`, 'metal', shell);
  const band = S.sub(S.inter(withProw(S.round(core, 0.006), 0.018, 0.6), S.box(A(0, 0.138, 0), [0.3, 0.027, 0.3])), slits);
  sc.add(`${prefix}.band`, 'metalD', band);
  sc.add(`${prefix}.nasal`, 'metalD', S.inter(withProw(S.round(core, 0.009), 0.018, 0.6), S.box(A(0, 0.11, 0.088), [0.015, 0.125, 0.1])));
  sc.add(`${prefix}.rim`, 'metalD', S.inter(S.round(core, 0.007), S.box(A(0, 0.005, 0), [0.3, 0.013, 0.3])));
  sc.add(`${prefix}.top`, 'metalD', S.inter(S.round(core, 0.005), S.box(A(0, 0.241, 0), [0.3, 0.011, 0.3])));
  sc.add(`${prefix}.comb`, 'metalD', S.box(A(0, 0.26, -0.012), [0.008, 0.022, 0.1], 0.006));
  for (let i = 0; i < 9; i++) {
    const a = -1.25 + i * 0.3125;
    if (abs(a) < 0.2) continue;
    for (const y of [0.159, 0.117]) sc.rivet(band, A(sin(a) * 0.5, y, cos(a) * 0.5), [-sin(a), 0, -cos(a)], 0.0046);
  }
  for (const sgn of [-1, 1]) for (let r = 0; r < 4; r++) for (let c = 0; c < 4 - (r > 1 ? r - 1 : 0); c++) {
    const a = sgn * (0.26 + c * 0.13 + r * 0.03);
    sc.hole(shell, A(sin(a) * 0.5, 0.083 - r * 0.021, cos(a) * 0.5 - 0.012), [-sin(a), 0, -cos(a)], 0.0042);
  }
  if (plume) {
    sc.add(`${prefix}.plume`, 'hair', S.smin(0.04,
      S.rcone(A(0, 0.248, -0.052), A(0.04, 0.378, -0.102), 0.024, 0.05),
      S.rcone(A(0.04, 0.378, -0.102), A(0.2, 0.438, -0.162), 0.05, 0.068),
      S.rcone(A(0.2, 0.438, -0.162), A(0.42, 0.348, -0.222), 0.068, 0.055),
      S.rcone(A(0.42, 0.348, -0.222), A(0.6, 0.148, -0.262), 0.055, 0.03),
      S.rcone(A(0.6, 0.148, -0.262), A(0.66, -0.032, -0.282), 0.03, 0.006)));
  }
  return { base: [...at], top: A(0, 0.27, 0), visor: A(0, 0.138, 0.11) };
}

/**
 * Breastplate with a centre groove, plackart, neck trim, mail aventail and a
 * gorget of stacked lames. at: centre of the chest. Returns { chest, neck }.
 */
export function breastplate(sc, prefix, { at = [0, 1.42, 0.035] } = {}) {
  const B = (x, y, z) => at3(at, x, y, z);
  const shape = S.ellipsoid(at, [0.21, 0.245, 0.16]);
  const breast = S.disp(shape, (x, y, z) => (z < at[2] - 0.055 ? 0 : -0.012 * max(0, 1 - abs(x - at[0]) / 0.022)), 0.02, 0.5, tag('breast.groove', at, 0.055, 0.012, 0.022));
  sc.add(`${prefix}.breast`, 'metal', breast);
  for (const dy of [0.15, 0.165]) for (const sx of [-1, 1]) {
    sc.lineOn(breast, Array.from({ length: 16 }, (_, i) => { const x = sx * (0.024 + i * 0.0115); return B(x, 0.08 - dy - 0.588 * abs(x), 0.565); }), [0, 0, -1], { w: dy === 0.15 ? 2 : 1 });
  }
  sc.add(`${prefix}.neck.trim`, 'metalD', S.inter(S.round(shape, 0.005), S.raw((x, y, z) => (at[1] + 0.172 - 0.1 * abs(x - at[0])) - y, ANY, 0.6, tag('neck.cut', at, 0.172, 0.1))));
  const plE = S.ellipsoid(B(0, -0.25, -0.005), [0.188, 0.2, 0.138]);
  const vTop = S.raw((x, y, z) => (y - (at[1] - 0.11 - 0.62 * abs(x - at[0]))) * 0.8, ANY, 0.6, tag('plack.vtop', at, 0.11, 0.62, 0.8));
  sc.add(`${prefix}.plackart`, 'metal', S.inter(plE, vTop));
  const trim = S.inter(S.round(plE, 0.004), vTop, S.raw((x, y, z) => -(y - (at[1] - 0.142 - 0.62 * abs(x - at[0]))) * 0.8, ANY, 0.6, tag('plack.vlow', at, 0.142, 0.62, 0.8)));
  sc.add(`${prefix}.plackart.trim`, 'metalD', trim);
  for (const sx of [-1, 1]) for (let i = 1; i <= 4; i++) sc.rivet(trim, B(sx * i * 0.038, -0.126 - 0.62 * i * 0.038, 0.565), [0, 0, -1], 0.0048);
  sc.add(`${prefix}.aventail`, 'mail', S.squash(S.ccone(B(0, 0.27, -0.035), B(0, 0.135, -0.035), 0.105, 0.176), B(0, 0.18, -0.035), [1, 1, 0.9]));
  sc.add(`${prefix}.gorget`, 'metal', dSaw(S.squash(S.ccone(B(0, 0.185, -0.025), B(0, 0.12, -0.025), 0.125, 0.19), B(0, 0.15, -0.025), [1, 1, 0.82]), B(0, 0.19, -0.035), [0, -1, 0], 0.033, 0.008, 0.01, 0.5));
  return { chest: [...at], neck: B(0, 0.25, -0.035) };
}

/**
 * Fluted pauldron with stacked lames, a haute-piece and a row of rivets.
 * side: +1 left, -1 right; shoulder: the shoulder joint. Returns { shoulder, top }.
 */
export function pauldron(sc, prefix, { side = 1, shoulder = [side * 0.238, 1.53, 0] } = {}) {
  const sx = side, sh = shoulder;
  const c1 = add(sh, [sx * 0.02, 0.035, 0.005]);
  const main = dFlutes(S.ellipsoid(c1, [0.142, 0.11, 0.15]), add(c1, [-sx * 0.2, -0.05, 0]), add(c1, [sx * 0.2, 0.05, 0]), 16, 0.007, 0.008, 0.5);
  sc.add(`${prefix}.shell`, 'metal', main);
  const c2 = add(sh, [sx * 0.092, -0.085, 0.002]);
  sc.add(`${prefix}.lames`, 'metal', dSaw(S.ellipsoid(c2, [0.112, 0.132, 0.126]), add(c2, [0, 0.13, 0]), [sx * 0.42, -1, 0], 0.043, 0.012, 0.013, 0.42));
  sc.add(`${prefix}.haute`, 'metalD', S.xform(S.box(add(sh, [sx * -0.02, 0.135, 0.0]), [0.009, 0.062, 0.105], 0.008), add(sh, [0, 0.08, 0]), S.rotZ(sx * 0.28)));
  for (let i = 0; i < 6; i++) {
    const a = -1.0 + i * 0.4;
    sc.rivet(main, [c1[0] + sx * 0.5, c1[1] - 0.06 + 0.02 * cos(a), c1[2] + sin(a) * 0.12], [-sx, 0.1, 0], 0.005);
  }
  return { shoulder: [...sh], top: add(c1, [0, 0.11, 0]) };
}

/**
 * Waist: belt and buckle, a laminated fauld, a tabard, two tassets hanging over
 * the hips and a pouch. at: front of the belt centre line; hips: half the
 * distance between the hip joints. Returns { belt, hipL, hipR }.
 */
export function fauld(sc, prefix, { at = [0, 1.085, 0.005], hips = 0.108 } = {}) {
  const F = (x, y, z) => at3(at, x, y, z);
  sc.add(`${prefix}.belt`, 'leather', flat(S.ccone(F(0, -0.023, 0), F(0, 0.023, 0), 0.2, 0.194), F(0, -0.005, 0), 0.74));
  sc.add(`${prefix}.buckle`, 'metalD', S.sub(S.box(F(0, 0, 0.148), [0.034, 0.032, 0.01], 0.006), S.box(F(0, 0, 0.155), [0.018, 0.016, 0.02], 0.003)));
  sc.add(`${prefix}.skirt`, 'metal', dSaw(flat(S.ccone(F(0, -0.02, -0.005), F(0, -0.223, -0.005), 0.192, 0.25), F(0, -0.085, -0.005), 0.74), F(0, -0.017, -0.005), [0, -1, 0], 0.05, 0.012, 0.013, 0.42));
  const tabard = S.disp(S.box(F(0, -0.375, 0.167), [0.078, 0.2, 0.01], 0.006),
    (x, y, z) => { const ly = y - at[1]; return 0.012 * sin((x - at[0]) * 70 + 1.5 * sin(ly * 9 + 9.765)) * (-0.035 - ly) * 2.2; }, 0.02, 0.45, tag('tabard.fold', at, 0.012, 70, 9, 9.765, 0.035, 2.2));
  sc.add(`${prefix}.tabard`, 'cloth', S.inter(tabard, S.raw((x, y, z) => { const lx = x - at[0]; return (at[1] - 0.55 + 0.035 * sin(lx * 55) + 0.02 * sin(lx * 140 + 1)) - y; }, ANY, 0.6, tag('tabard.hem', at, 0.55, 0.035, 55, 0.02, 140))));
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'r' : 'l', hx = at[0] + sx * hips, tx0 = hx + sx * 0.022, z0 = at[2] - 0.005;
    const tas = S.xform(S.inter(S.box([tx0, at[1] - 0.31, z0], [0.084, 0.1, 0.012], 0.01),
      S.raw((x, y, z) => (at[1] - 0.385 - 0.5 * (0.08 - abs(x - tx0))) - y, ANY, 0.6, tag('tasset.cut', at, tx0, 0.385, 0.5, 0.08))), [hx, at[1] - 0.215, z0], S.rotX(-0.1));
    const tasW = S.raw((x, y, z) => tas(x, y, z - (z0 + 0.12) + 3.2 * (x - tx0) ** 2) - 0.005 * (1 - abs(sin((x - tx0) * 150))) * (z > z0 ? 1 : 0),
      [tx0, at[1] - 0.31, z0 + 0.11, 0.16], 0.45, tag('tasset.bow', at, hips, sx, 0.12, 3.2, 0.005, 150));
    sc.add(`${prefix}.tasset.${n}`, 'metal', tasW);
    for (const dx of [-0.058, 0, 0.058]) sc.rivet(tasW, [tx0 + dx, at[1] - 0.227, z0 + 0.6], [0, 0, -1], 0.005);
  }
  sc.add(`${prefix}.pouch`, 'leather', S.box(F(-0.172, -0.085, 0.113), [0.045, 0.055, 0.03], 0.02));
  const flap = sc.add(`${prefix}.pouch.flap`, 'leather', S.box(F(-0.172, -0.05, 0.121), [0.048, 0.028, 0.03], 0.018));
  sc.rivet(flap, F(-0.172, -0.065, 0.595), [0, 0, -1], 0.006);
  return { belt: [...at], hipL: F(hips, -0.13, -0.005), hipR: F(-hips, -0.13, -0.005) };
}

/**
 * Arm harness from shoulder to hand: rerebrace, couter with its fan, vambrace,
 * and with detail a fluted vambrace, a flared cuff and a mitten gauntlet. With
 * grip { at, axis } the gauntlet closes around a haft through `at` running
 * along the unit vector `axis` (fingers wrap from the outside in); without it,
 * and with detail, the hand is a closed fist past the wrist.
 * Returns { hand, wrist, elbow }.
 */
export function gauntlet(sc, prefix, {
  side = -1, shoulder = [side * 0.238, 1.53, 0], elbow = [side * 0.375, 1.245, -0.05],
  wrist = [side * 0.4, 1.08, 0.15], grip = null, detail = true,
} = {}) {
  const m = -side, el = elbow;
  let wr = wrist, hand = null;
  // Points around the grip: dx mirrored with the side, dy along the haft.
  const G = grip && ((dx, dy, dz) => [grip.at[0] + m * dx + grip.axis[0] * dy, grip.at[1] + grip.axis[1] * dy, grip.at[2] + dz + grip.axis[2] * dy]);
  if (G) wr = G(0.05, -0.013, -0.045);
  sc.add(`${prefix}.rerebrace`, 'metal', S.rcone(add(shoulder, [side * 0.03, -0.07, 0]), el, 0.064, 0.056));
  if (detail) {
    sc.add(`${prefix}.couter`, 'metal', S.disp(S.sphere(el, 0.066), (x, y, z) => -0.007 * max(0, 1 - abs(y - el[1]) / 0.011), 0.007, 0.5, tag('couter.groove', el, 0.007, 0.011)));
    sc.add(`${prefix}.couter.fan`, 'metal', dFlutes(S.ellipsoid(add(el, [side * 0.06, 0, 0]), [0.016, 0.064, 0.062]), add(el, [-1, 0, 0]), add(el, [1, 0, 0]), 12, 0.004, 0.004, 0.5));
    sc.add(`${prefix}.vambrace`, 'metal', dFlutes(S.rcone(el, wr, 0.058, 0.045), el, wr, 10, 0.004, 0.004, 0.5));
    const cA = lerp3(wr, el, 0.44), cB = lerp3(wr, el, 0.04);
    sc.add(`${prefix}.cuff`, 'metal', dSaw(S.ccone(cA, cB, 0.072, 0.05), cA, [cB[0] - cA[0], cB[1] - cA[1], cB[2] - cA[2]], 0.03, 0.007, 0.008, 0.42));
  } else {
    sc.add(`${prefix}.couter`, 'metal', S.sphere(el, 0.066));
    sc.add(`${prefix}.couter.fan`, 'metal', S.ellipsoid(add(el, [side * 0.06, 0, 0]), [0.016, 0.064, 0.062]));
    sc.add(`${prefix}.vambrace`, 'metal', S.rcone(el, wr, 0.058, 0.045));
  }
  if (G) {
    hand = G(0.04, 0.003, -0.012);
    sc.add(`${prefix}.hand`, 'metal', S.ellipsoid(hand, [0.036, 0.056, 0.04]));
    for (let i = 0; i < 4; i++) {
      const dy = -0.038 + i * 0.0265;
      const tip = G(-0.02, dy, 0.024);
      const fing = sc.add(`${prefix}.finger.${i}`, 'metal', S.rcone(G(0.036, dy + 0.004, 0.01), tip, 0.0135, 0.0125));
      sc.add(`${prefix}.finger.${i}.tip`, 'metal', S.rcone(tip, G(-0.03, dy - 0.002, 0.004), 0.012, 0.01));
      const r = G(0.02, dy + 0.003, 0);
      sc.rivet(fing, [r[0], r[1], grip.at[2] + 0.6], [0, 0, -1], 0.0035);
    }
    sc.add(`${prefix}.thumb`, 'metal', S.rcone(G(0.04, 0.06, -0.005), G(0, 0.08, 0.024), 0.015, 0.0125));
  } else if (detail) {
    const d = nrm([wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]]);
    hand = add(wr, [d[0] * 0.06, d[1] * 0.06, d[2] * 0.06]);
    sc.add(`${prefix}.hand`, 'metal', S.ellipsoid(hand, [0.045, 0.05, 0.045]));
  }
  return { hand: hand ?? [...wr], wrist: [...wr], elbow: [...el] };
}

/**
 * Leg harness from hip to ankle: fluted cuisse, poleyn with fan and lames, a
 * ridged greave and its cuff. side: +1 left, -1 right. Returns { knee, ankle }.
 */
export function greave(sc, prefix, { side = -1, hip = [side * 0.108, 0.955, 0], knee = [side * 0.15, 0.53, 0.045], ankle = [side * 0.18, 0.1, 0] } = {}) {
  const sx = side, kn = knee, an = ankle;
  sc.add(`${prefix}.cuisse`, 'metal', dFlutes(S.rcone(hip, kn, 0.098, 0.074), hip, kn, 14, 0.0055, 0.006, 0.5));
  const kc = add(kn, [0, 0, 0.022]);
  sc.add(`${prefix}.poleyn`, 'metal', S.disp(S.ellipsoid(kc, [0.076, 0.084, 0.076]), (x, y, z) => -0.008 * max(0, 1 - abs(y - kc[1]) / 0.012), 0.008, 0.5, tag('poleyn.groove', kc, 0.008, 0.012)));
  sc.add(`${prefix}.poleyn.fan`, 'metal', dFlutes(S.ellipsoid(add(kn, [sx * 0.074, 0, 0.0]), [0.016, 0.072, 0.068]), add(kn, [-1, 0, 0]), add(kn, [1, 0, 0]), 14, 0.004, 0.004, 0.5));
  sc.add(`${prefix}.poleyn.lame`, 'metal', S.rcone(add(kn, [0, -0.062, 0.012]), add(kn, [0, -0.1, 0.006]), 0.071, 0.065));
  sc.add(`${prefix}.poleyn.lame.upper`, 'metal', S.rcone(lerp3(kn, hip, 0.14), lerp3(kn, hip, 0.24), 0.078, 0.084));
  const calf = lerp3(kn, an, 0.32);
  const gr = S.smin(0.03, S.rcone(lerp3(kn, an, 0.12), an, 0.064, 0.047), S.ellipsoid(add(calf, [0, 0, -0.02]), [0.058, 0.12, 0.062]));
  const fr = nrm([an[0] - kn[0], an[1] - kn[1], an[2] - kn[2]]);
  sc.add(`${prefix}.greave`, 'metal', S.disp(gr, (x, y, z) => {
    const px = x - kn[0], py = y - kn[1], pz = z - kn[2];
    const t = px * fr[0] + py * fr[1] + pz * fr[2];
    const ox = px - fr[0] * t, oz = pz - fr[2] * t;
    return oz > 0 ? -0.007 * max(0, 1 - abs(ox) / 0.012) : 0;
  }, 0.007, 0.5, tag('greave.ridge', kn, fr, 0.007, 0.012)));
  sc.add(`${prefix}.greave.cuff`, 'metalD', S.rcone(lerp3(kn, an, 0.9), lerp3(kn, an, 0.985), 0.052, 0.054));
  return { knee: [...kn], ankle: [...an] };
}

/**
 * Laminated sabaton and heel cup. ankle: the ankle joint; toe: horizontal
 * direction the foot points in. Returns { ankle, toe }.
 */
export function sabaton(sc, prefix, { ankle = [0, 0.1, 0], toe = [0, 0, 1] } = {}) {
  const an = ankle;
  const tl = hypot(toe[0], toe[2]), tx = toe[0] / tl, tz = toe[2] / tl;
  const ry = S.rotY(atan2(tx, tz));
  const fc = [an[0] + tx * 0.095, an[1] - 0.058, an[2] + tz * 0.095];
  const foot = S.xform(S.inter(S.ellipsoid(fc, [0.056, 0.058, 0.152]), S.raw((x, y, z) => (an[1] - 0.105) - y, ANY, 0.6, tag('sole', an[1], 0.105))), fc, ry);
  sc.add(`${prefix}.foot`, 'metal', dSaw(foot, an, [tx, 0, tz], 0.036, 0.008, 0.009, 0.42));
  sc.add(`${prefix}.heel`, 'metalD', S.rcone(add(an, [0, -0.02, -0.01]), add(an, [0, -0.07, -0.015]), 0.05, 0.054));
  return { ankle: [...an], toe: [fc[0] + tx * 0.15, an[1] - 0.1, fc[2] + tz * 0.15] };
}

/**
 * Curved heater shield with rim, boss and a sun emblem drawn as knocked-out
 * lines and a ring of rivets. at: the shield's centre; yaw: turn about Y (the
 * face looks along +Z before turning). Returns { center, boss }.
 */
export function heaterShield(sc, prefix, { at = [0.45, 1.03, 0.25], yaw = 0.5, emblem = true } = {}) {
  const so = at, sR = S.rotY(yaw);
  const sh2 = (u, v) => max(hypot(u - 0.3, v - 0.1) - 0.56, hypot(u + 0.3, v - 0.1) - 0.56, v - 0.37);
  const bend = u => 0.85 * u * u;
  const plate = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1], w = z - so[2] + bend(u);
    return max(sh2(u, v), abs(w) - 0.011) - 0.004;
  }, [...so, 0.56], 0.55, tag('shield.plate', so, 0.011));
  const rim = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1], w = z - so[2] + bend(u);
    const d2 = sh2(u, v);
    return max(d2, -(d2 + 0.032), abs(w - 0.006) - 0.013) - 0.004;
  }, [...so, 0.56], 0.55, tag('shield.rim', so, 0.032, 0.013));
  const boss = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1] - 0.07, w = z - so[2] + bend(u) - 0.012;
    return (hypot(u, v, w / 0.6) - 0.058) * 0.6;
  }, [so[0], so[1] + 0.07, so[2] + 0.012, 0.08], 0.7, tag('shield.boss', so, 0.07, 0.058));
  const bossRing = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1] - 0.07, w = z - so[2] + bend(u) - 0.014;
    return hypot(hypot(u, v) - 0.072, w) - 0.011;
  }, [so[0], so[1] + 0.07, so[2] + 0.012, 0.1], 0.6, tag('shield.bossring', so, 0.072, 0.011));
  sc.add(`${prefix}.plate`, 'metal', S.xform(plate, so, sR));
  sc.add(`${prefix}.rim`, 'metalD', S.xform(rim, so, sR));
  sc.add(`${prefix}.boss`, 'metal', S.xform(boss, so, sR));
  sc.add(`${prefix}.boss.ring`, 'metalD', S.xform(bossRing, so, sR));
  const onShield = (u, v, lift = 0.0155) => { const l = S.mapply(sR, [u, v, lift - bend(u)]); return [so[0] + l[0], so[1] + l[1], so[2] + l[2]]; };
  if (emblem) {
    const ring = r => { const a = []; for (let i = 0; i <= 48; i++) { const t = i / 48 * 2 * PI; a.push(onShield(cos(t) * r, 0.07 + sin(t) * r)); } return a; };
    sc.line(ring(0.118), { w: 2, ko: true });
    sc.line(ring(0.132), { w: 1, ko: true });
    for (let i = 0; i < 16; i++) {
      const t = i / 16 * 2 * PI + 0.2, r1 = 0.142, r2 = i % 2 ? 0.185 : 0.25, da = 0.1;
      const tip = [cos(t) * r2, 0.07 + sin(t) * r2];
      if (sh2(tip[0], tip[1]) > -0.045) continue;
      sc.line([onShield(cos(t - da) * r1, 0.07 + sin(t - da) * r1), onShield(tip[0], tip[1]), onShield(cos(t + da) * r1, 0.07 + sin(t + da) * r1)], { w: 2, ko: true });
    }
  }
  const offs = (dist, n, lift) => {
    const a = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n * 2 * PI;
      let lo = 0, hi = 0.6;
      for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (sh2(cos(t) * mid, 0.02 + sin(t) * mid) < -dist) lo = mid; else hi = mid; }
      a.push(onShield(cos(t) * lo, 0.02 + sin(t) * lo, lift));
    }
    return a;
  };
  sc.line(offs(0.05, 110), { w: 2, ko: true });
  sc.line(offs(0.062, 110), { w: 1, ko: true });
  for (const p of offs(0.016, 26, 0.0245).slice(0, -1)) sc.decals.push({ type: 'rivet', p, r: 0.0058 });
  return { center: [...so], boss: onShield(0, 0.07, 0.05) };
}

/**
 * A cape hanging from the shoulders and flaring towards a scalloped hem, blown
 * sideways by `sweep`. at: back of the neck; length: drop to about the hem.
 * Returns { neck, hem }.
 */
export function cape(sc, prefix, { at = [0, 1.57, -0.1], length = 1.4, sweep = 0.2 } = {}) {
  const [ax, ay, az] = at, L = length, k = L / 1.4;
  const form = S.raw((x, y, z) => {
    const t = (ay - y) / L;
    const tc = max(0, min(1.15, t));
    const xs = x - ax - sweep * tc * tc - 0.03 * tc;
    const zs = z - az + 0.17 * tc;
    const rx = 0.2 + 0.34 * tc, rz = 0.105 + 0.13 * tc;
    const a = atan2(xs / rx, zs / rz);
    let d = (hypot(xs / rx, zs / rz) - 1) * min(rx, rz);
    d += 0.02 * (0.25 + tc) * sin(a * 7 + 1.6 * sin(y * 4.2)) + 0.008 * (0.3 + tc) * sin(a * 19 + y * 8);
    const hem = ay - 1.44 * k + 0.06 * sin(a * 5 + 1) + 0.035 * sin(a * 13 + 2) + 0.02 * sin(a * 31);
    return max(d, y - (ay + 0.01), hem - y);
  }, [ax + 0.12 * k, ay - 0.72 * k, az - 0.15 * k, max(1.05 * k, 0.75 + sweep)], 0.28, tag('cape', at, L, sweep, 0.03, 0.17, 0.34, 0.13, 1.44, 'waves7-19-5-13-31'));
  sc.add(`${prefix}.cloth`, 'cloth', form);
  return { neck: [...at], hem: [ax + sweep, ay - 1.44 * k, az - 0.17] };
}
