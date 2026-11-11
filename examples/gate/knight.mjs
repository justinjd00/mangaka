// The knight and the broken gate of the example page, built from kit forms.
// Every part is named under `knight.` or `gate.`; closures passed to raw() and
// disp() carry a tag that lists the numbers they capture.
import * as S from '../../kit/sdf.mjs';
import { rngFor } from '../../kit/rng.mjs';

const { abs, max, min, sin, cos, atan2, hypot, PI, floor } = Math;

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const nrm = a => { const l = hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ANY = [0, 0, 0, 9];
const tag = (...xs) => xs.flat(Infinity).join(':');

// Flutes: displacement ridges around the axis a-b.
const flutes = (a, b, k, A) => {
  const d = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const u = nrm(cross(d, abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), v = cross(d, u);
  return (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const ang = atan2(px * u[0] + py * u[1] + pz * u[2], px * v[0] + py * v[1] + pz * v[2]);
    return -A * (1 - abs(sin(ang * k / 2)));
  };
};
// Sawtooth steps along dir, for stacked lames.
const saw = (o, dir, pitch, A) => {
  const d = nrm(dir);
  return (x, y, z) => {
    const s = ((x - o[0]) * d[0] + (y - o[1]) * d[1] + (z - o[2]) * d[2]) / pitch;
    return -A * (s - floor(s));
  };
};
const dFlutes = (f, a, b, k, A, amp, st) => S.disp(f, flutes(a, b, k, A), amp, st, tag('flutes', k, A, a, b));
const dSaw = (f, o, dir, pitch, A, amp, st) => S.disp(f, saw(o, dir, pitch, A), amp, st, tag('saw', pitch, A, o, dir));

export function buildKnight() {
  const sc = S.scene();
  const P = (name, mat, form) => sc.add(name, mat, form);

  // Ground and rubble
  const ground = S.disp(S.ellipsoid([0, -0.62, 0.15], [3.2, 0.62, 2.4]),
    (x, y, z) => -0.035 * S.fbm(x * 3.1, 0, z * 3.1, 3) - 0.008 * S.noise3(x * 22, y * 22, z * 22), 0.05, 0.5, 'ground:fbm3.1:0.035:noise22:0.008');
  P('gate.ground', 'ground', ground);
  const rnd = rngFor('gate', 'rubble');
  for (let i = 0; i < 22; i++) {
    const a = rnd() * 6.28, r = 0.38 + rnd() * 1.3;
    const x = cos(a) * r * 1.3, z = sin(a) * r * 0.8 + 0.1;
    const s = 0.025 + rnd() * 0.065;
    const c = [x, s * 0.4 - 0.03 - 0.02 * (x * x + z * z), z];
    P(`gate.rubble.${i}`, 'stone', S.xform(S.box(c, [s, s * (0.5 + rnd() * 0.5), s * (0.6 + rnd() * 0.6)], s * 0.25), c, S.mmul(S.rotY(rnd() * 3), S.rotZ(rnd() * 0.8))));
  }

  // Arrows stuck in the ground
  const stick = (id, base, top, r) => {
    P(`gate.arrow.${id}`, 'wood', S.cyl(base, top, r));
    const a = lerp3(base, top, 0.86), b = lerp3(base, top, 0.99);
    const m = lerp3(a, b, 0.5), l = hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2;
    const tilt = atan2(top[0] - base[0], top[1] - base[1]);
    P(`gate.arrow.${id}.fletch1`, 'cloth', S.xform(S.box(m, [0.022, l, 0.0025], 0.002), m, S.rotZ(-tilt)));
    P(`gate.arrow.${id}.fletch2`, 'cloth', S.xform(S.box(m, [0.0025, l, 0.022], 0.002), m, S.rotZ(-tilt)));
  };
  stick('a', [-0.78, -0.05, 0.42], [-0.86, 0.62, 0.36], 0.0075);
  stick('b', [-0.66, -0.05, 0.6], [-0.6, 0.5, 0.52], 0.0075);
  stick('c', [0.86, -0.08, -0.05], [0.95, 0.6, -0.12], 0.0075);
  stick('d', [0.22, -0.08, -0.72], [0.14, 0.52, -0.78], 0.0075);
  {
    const c = [0.8, 0.2, 0.5], R = S.mmul(S.rotZ(-0.28), S.rotY(0.5));
    P('gate.sword.blade', 'metal', S.xform(S.inter(S.box([c[0], c[1] + 0.02, c[2]], [0.026, 0.3, 0.004]),
      S.raw((x, y, z) => (y - c[1] - 0.2) + 0.9 * (x - c[0]), ANY, 0.6, tag('sword.bevel', c, 0.2, 0.9))), c, R));
    P('gate.sword.guard', 'stone', S.xform(S.box([c[0] + 0.02, c[1] + 0.26, c[2]], [0.03, 0.012, 0.012], 0.004), c, R));
  }

  // Broken columns
  const column = (id, base, h, r, tilt) => {
    const top = [base[0] + tilt, base[1] + h, base[2]];
    const shaft = S.disp(S.ccone(base, top, r, r * 0.9), (x, y, z) => {
      const a = atan2(x - base[0] - tilt * (y / h), z - base[2]);
      return 0.012 * abs(sin(a * 8)) - 0.012 + 0.012 * S.noise3(x * 9, y * 9, z * 9) + 0.004 * S.noise3(x * 40, y * 40, z * 40);
    }, 0.03, 0.5, tag('column.flutes8', base, h, r, tilt));
    P(`gate.column.${id}`, 'stone', S.inter(shaft, S.raw((x, y, z) => y - (base[1] + h - 0.12 + 0.22 * S.noise3(x * 7 + 3, 1, z * 7) - 0.3 * (x - base[0])), ANY, 0.6, tag('column.break', base, h))));
    P(`gate.column.${id}.base`, 'stone', S.box([base[0], base[1] + 0.06, base[2]], [r * 1.35, 0.08, r * 1.35], 0.015));
    P(`gate.column.${id}.ring`, 'stone', S.ccone([base[0], base[1] + 0.14, base[2]], [base[0], base[1] + 0.2, base[2]], r * 1.22, r * 1.05));
  };
  column('a', [-1.02, -0.06, -1.0], 1.45, 0.17, 0.02);
  column('b', [0.42, -0.1, -1.35], 2.05, 0.19, -0.03);
  column('c', [-0.25, -0.12, -1.9], 0.7, 0.17, 0.0);

  // Cape
  const cape = S.raw((x, y, z) => {
    const t = (1.57 - y) / 1.4;
    const tc = max(0, min(1.15, t));
    const xs = x - 0.2 * tc * tc - 0.03 * tc;
    const zs = z + 0.1 + 0.17 * tc;
    const rx = 0.2 + 0.34 * tc, rz = 0.105 + 0.13 * tc;
    const a = atan2(xs / rx, zs / rz);
    let d = (hypot(xs / rx, zs / rz) - 1) * min(rx, rz);
    d += 0.02 * (0.25 + tc) * sin(a * 7 + 1.6 * sin(y * 4.2)) + 0.008 * (0.3 + tc) * sin(a * 19 + y * 8);
    const hem = 0.13 + 0.06 * sin(a * 5 + 1) + 0.035 * sin(a * 13 + 2) + 0.02 * sin(a * 31);
    return max(d, y - 1.58, hem - y);
  }, [0.12, 0.85, -0.25], 0.28, 'cape:v1');
  cape.b = [0.12, 0.85, -0.25, 1.05];
  P('knight.cape', 'cloth', cape);

  // Torso
  const bc = [0, 1.42, 0.035];
  const breast = S.disp(S.ellipsoid(bc, [0.21, 0.245, 0.16]), (x, y, z) => (z < -0.02 ? 0 : -0.012 * max(0, 1 - abs(x) / 0.022)), 0.02, 0.5, 'breast.groove:0.012:0.022');
  P('knight.breast', 'metal', breast);
  for (const dy of [0.15, 0.165]) for (const sx of [-1, 1])
    sc.lineOn(breast, Array.from({ length: 16 }, (_, i) => { const x = sx * (0.024 + i * 0.0115); return [x, 1.5 - dy + 0.42 * abs(x) * (dy > 0.1 ? -1.4 : 1), 0.6]; }), [0, 0, -1], { w: dy === 0.15 ? 2 : 1 });
  P('knight.neck.trim', 'metalD', S.inter(S.round(S.ellipsoid(bc, [0.21, 0.245, 0.16]), 0.005), S.raw((x, y, z) => (1.592 - 0.1 * abs(x)) - y, ANY, 0.6, 'neck.cut:1.592:0.1')));
  const plE = S.ellipsoid([0, 1.17, 0.03], [0.188, 0.2, 0.138]);
  const vTop = S.raw((x, y, z) => (y - (1.31 - 0.62 * abs(x))) * 0.8, ANY, 0.6, 'plack.vtop:1.31:0.62:0.8');
  P('knight.plackart', 'metal', S.inter(plE, vTop));
  const trim = S.inter(S.round(plE, 0.004), vTop, S.raw((x, y, z) => -(y - (1.278 - 0.62 * abs(x))) * 0.8, ANY, 0.6, 'plack.vlow:1.278:0.62:0.8'));
  P('knight.plackart.trim', 'metalD', trim);
  for (const sx of [-1, 1]) for (let i = 1; i <= 4; i++)
    sc.rivet(trim, [sx * i * 0.038, 1.294 - 0.62 * i * 0.038, 0.6], [0, 0, -1], 0.0048);

  P('knight.aventail', 'mail', S.squash(S.ccone([0, 1.69, 0], [0, 1.555, 0], 0.105, 0.176), [0, 1.6, 0], [1, 1, 0.9]));
  P('knight.gorget', 'metal', dSaw(S.squash(S.ccone([0, 1.605, 0.01], [0, 1.54, 0.01], 0.125, 0.19), [0, 1.57, 0.01], [1, 1, 0.82]), [0, 1.61, 0], [0, -1, 0], 0.033, 0.008, 0.01, 0.5));

  // Helm
  const helmCore = S.round(S.ccone([0, 1.652, 0.012], [0, 1.888, 0.012], 0.112, 0.097), 0.012);
  const prow = (x, y, z) => (z > 0 ? -0.018 * max(0, 1 - abs(x) / 0.045) : 0);
  const withProw = (f, amp, st) => S.disp(f, prow, amp, st, 'helm.prow:0.018:0.045');
  const slits = S.union(S.box([-0.054, 1.79, 0.11], [0.04, 0.0068, 0.07]), S.box([0.054, 1.79, 0.11], [0.04, 0.0068, 0.07]));
  const helm = S.sub(withProw(helmCore, 0.018, 0.6), slits);
  P('knight.helm', 'metal', helm);
  const band = S.sub(S.inter(withProw(S.round(helmCore, 0.006), 0.018, 0.6), S.box([0, 1.79, 0.012], [0.3, 0.027, 0.3])), slits);
  P('knight.helm.band', 'metalD', band);
  P('knight.helm.nasal', 'metalD', S.inter(withProw(S.round(helmCore, 0.009), 0.018, 0.6), S.box([0, 1.762, 0.1], [0.015, 0.125, 0.1])));
  P('knight.helm.rim', 'metalD', S.inter(S.round(helmCore, 0.007), S.box([0, 1.657, 0.012], [0.3, 0.013, 0.3])));
  P('knight.helm.top', 'metalD', S.inter(S.round(helmCore, 0.005), S.box([0, 1.893, 0.012], [0.3, 0.011, 0.3])));
  P('knight.helm.comb', 'metalD', S.box([0, 1.912, 0.0], [0.008, 0.022, 0.1], 0.006));
  for (let i = 0; i < 9; i++) {
    const a = -1.25 + i * 0.3125;
    if (abs(a) < 0.2) continue;
    for (const y of [1.811, 1.769]) sc.rivet(band, [sin(a) * 0.5, y, cos(a) * 0.5 + 0.012], [-sin(a), 0, -cos(a)], 0.0046);
  }
  for (const sgn of [-1, 1]) for (let r = 0; r < 4; r++) for (let c = 0; c < 4 - (r > 1 ? r - 1 : 0); c++) {
    const a = sgn * (0.26 + c * 0.13 + r * 0.03);
    sc.hole(helm, [sin(a) * 0.5, 1.735 - r * 0.021, cos(a) * 0.5], [-sin(a), 0, -cos(a)], 0.0042);
  }
  P('knight.plume', 'hair', S.smin(0.04,
    S.rcone([0, 1.9, -0.04], [0.04, 2.03, -0.09], 0.024, 0.05),
    S.rcone([0.04, 2.03, -0.09], [0.2, 2.09, -0.15], 0.05, 0.068),
    S.rcone([0.2, 2.09, -0.15], [0.42, 2.0, -0.21], 0.068, 0.055),
    S.rcone([0.42, 2.0, -0.21], [0.6, 1.8, -0.25], 0.055, 0.03),
    S.rcone([0.6, 1.8, -0.25], [0.66, 1.62, -0.27], 0.03, 0.006)));

  // Pauldrons
  const pauldron = sx => {
    const side = sx < 0 ? 'r' : 'l';
    const sh = [sx * 0.238, 1.53, 0];
    const c1 = add(sh, [sx * 0.02, 0.035, 0.005]);
    const main = dFlutes(S.ellipsoid(c1, [0.142, 0.11, 0.15]), add(c1, [-sx * 0.2, -0.05, 0]), add(c1, [sx * 0.2, 0.05, 0]), 16, 0.007, 0.008, 0.5);
    P(`knight.pauldron.${side}`, 'metal', main);
    const c2 = add(sh, [sx * 0.092, -0.085, 0.002]);
    P(`knight.pauldron.lames.${side}`, 'metal', dSaw(S.ellipsoid(c2, [0.112, 0.132, 0.126]), add(c2, [0, 0.13, 0]), [sx * 0.42, -1, 0], 0.043, 0.012, 0.013, 0.42));
    P(`knight.pauldron.haute.${side}`, 'metalD', S.xform(S.box(add(sh, [sx * -0.02, 0.135, 0.0]), [0.009, 0.062, 0.105], 0.008), add(sh, [0, 0.08, 0]), S.rotZ(sx * 0.28)));
    for (let i = 0; i < 6; i++) {
      const a = -1.0 + i * 0.4;
      sc.rivet(main, [c1[0] + sx * 0.5, c1[1] - 0.06 + 0.02 * cos(a), c1[2] + sin(a) * 0.12], [-sx, 0.1, 0], 0.005);
    }
  };
  pauldron(-1); pauldron(1);

  // Waist
  const flat = (f, o, k) => S.squash(f, o, [1, 1, k]);
  P('knight.belt', 'leather', flat(S.ccone([0, 1.062, 0.005], [0, 1.108, 0.005], 0.2, 0.194), [0, 1.08, 0.005], 0.74));
  P('knight.buckle', 'metalD', S.sub(S.box([0, 1.085, 0.153], [0.034, 0.032, 0.01], 0.006), S.box([0, 1.085, 0.16], [0.018, 0.016, 0.02], 0.003)));
  P('knight.fauld', 'metal', dSaw(flat(S.ccone([0, 1.065, 0], [0, 0.862, 0], 0.192, 0.25), [0, 1, 0], 0.74), [0, 1.068, 0], [0, -1, 0], 0.05, 0.012, 0.013, 0.42));
  const tabard = S.disp(S.box([0.0, 0.71, 0.172], [0.078, 0.2, 0.01], 0.006),
    (x, y, z) => 0.012 * sin(x * 70 + 1.5 * sin(y * 9)) * (1.05 - y) * 2.2, 0.02, 0.45, 'tabard.fold:0.012:70:9');
  P('knight.tabard', 'cloth', S.inter(tabard, S.raw((x, y, z) => (0.535 + 0.035 * sin(x * 55) + 0.02 * sin(x * 140 + 1)) - y, ANY, 0.6, 'tabard.hem:0.535:0.035:55:0.02:140')));
  P('knight.pouch', 'leather', S.box([-0.172, 1.0, 0.118], [0.045, 0.055, 0.03], 0.02));
  const flap = P('knight.pouch.flap', 'leather', S.box([-0.172, 1.035, 0.126], [0.048, 0.028, 0.03], 0.018));
  sc.rivet(flap, [-0.172, 1.02, 0.6], [0, 0, -1], 0.006);

  // Legs
  const leg = (sx, hip, kn, an, toe) => {
    const n = sx < 0 ? 'r' : 'l', L = s => `knight.leg.${n}.${s}`;
    const tx0 = hip[0] + sx * 0.022;
    const tas = S.xform(S.inter(S.box([tx0, 0.775, 0.0], [0.084, 0.1, 0.012], 0.01),
      S.raw((x, y, z) => (0.7 - 0.5 * (0.08 - abs(x - tx0))) - y, ANY, 0.6, tag('tasset.cut', tx0, 0.7, 0.5, 0.08))), [hip[0], 0.87, 0.0], S.rotX(-0.1));
    const tasW = S.raw((x, y, z) => tas(x, y, z - 0.12 + 3.2 * (x - tx0) ** 2) - 0.005 * (1 - abs(sin((x - tx0) * 150))) * (z > 0 ? 1 : 0), [tx0, 0.775, 0.11, 0.16], 0.45, tag('tasset.bow', n, hip, tx0, 0.12, 3.2, 0.005, 150));
    P(L('tasset'), 'metal', tasW);
    for (const dx of [-0.058, 0, 0.058]) sc.rivet(tasW, [tx0 + dx, 0.858, 0.6], [0, 0, -1], 0.005);
    P(L('cuisse'), 'metal', dFlutes(S.rcone(hip, kn, 0.098, 0.074), hip, kn, 14, 0.0055, 0.006, 0.5));
    const kc = add(kn, [0, 0, 0.022]);
    P(L('poleyn'), 'metal', S.disp(S.ellipsoid(kc, [0.076, 0.084, 0.076]), (x, y, z) => -0.008 * max(0, 1 - abs(y - kc[1]) / 0.012), 0.008, 0.5, tag('poleyn.groove', kc, 0.008, 0.012)));
    P(L('poleyn.fan'), 'metal', dFlutes(S.ellipsoid(add(kn, [sx * 0.074, 0, 0.0]), [0.016, 0.072, 0.068]), add(kn, [-1, 0, 0]), add(kn, [1, 0, 0]), 14, 0.004, 0.004, 0.5));
    P(L('poleyn.lame'), 'metal', S.rcone(add(kn, [0, -0.062, 0.012]), add(kn, [0, -0.1, 0.006]), 0.071, 0.065));
    P(L('poleyn.lame.upper'), 'metal', S.rcone(lerp3(kn, hip, 0.14), lerp3(kn, hip, 0.24), 0.078, 0.084));
    const calf = lerp3(kn, an, 0.32);
    const gr = S.smin(0.03, S.rcone(lerp3(kn, an, 0.12), an, 0.064, 0.047), S.ellipsoid(add(calf, [0, 0, -0.02]), [0.058, 0.12, 0.062]));
    const fr = nrm([an[0] - kn[0], an[1] - kn[1], an[2] - kn[2]]);
    P(L('greave'), 'metal', S.disp(gr, (x, y, z) => {
      const px = x - kn[0], py = y - kn[1], pz = z - kn[2];
      const t = px * fr[0] + py * fr[1] + pz * fr[2];
      const ox = px - fr[0] * t, oz = pz - fr[2] * t;
      return oz > 0 ? -0.007 * max(0, 1 - abs(ox) / 0.012) : 0;
    }, 0.007, 0.5, tag('greave.ridge', kn, fr, 0.007, 0.012)));
    P(L('greave.cuff'), 'metalD', S.rcone(lerp3(kn, an, 0.9), lerp3(kn, an, 0.985), 0.052, 0.054));
    const tl = hypot(toe[0], toe[2]), tx = toe[0] / tl, tz = toe[2] / tl;
    const ry = S.rotY(atan2(tx, tz));
    const fc = [an[0] + tx * 0.095, an[1] - 0.058, an[2] + tz * 0.095];
    const foot = S.xform(S.inter(S.ellipsoid(fc, [0.056, 0.058, 0.152]), S.raw((x, y, z) => (an[1] - 0.105) - y, ANY, 0.6, tag('sole', an[1], 0.105))), fc, ry);
    P(L('sabaton'), 'metal', dSaw(foot, an, [tx, 0, tz], 0.036, 0.008, 0.009, 0.42));
    P(L('heel'), 'metalD', S.rcone(add(an, [0, -0.02, -0.01]), add(an, [0, -0.07, -0.015]), 0.05, 0.054));
  };
  leg(-1, [-0.108, 0.955, 0.0], [-0.175, 0.535, 0.085], [-0.215, 0.1, 0.03], [-0.35, 0, 1]);
  leg(1, [0.108, 0.955, 0.0], [0.125, 0.525, 0.005], [0.15, 0.1, -0.06], [0.4, 0, 1]);

  // Axe
  const hb = [-0.432, -0.02, 0.165], ht = [-0.416, 2.26, 0.12];
  const haftAt = y => lerp3(hb, ht, (y - hb[1]) / (ht[1] - hb[1]));
  P('knight.axe.haft', 'wood', S.cyl(hb, ht, 0.0165));
  [0.04, 0.9, 1.72, 1.95, 2.02].forEach((y, i) => P(`knight.axe.collar.${i}`, 'metalD', S.cyl(haftAt(y), haftAt(y + 0.035), 0.0225)));
  P('knight.axe.wrap', 'leather', dSaw(S.cyl(haftAt(1.18), haftAt(1.6), 0.019), haftAt(1.18), [0.25, 1, 0], 0.022, 0.004, 0.004, 0.45));
  const Hd = haftAt(2.1);
  const blade2 = (u, v) => max(hypot(u + 0.05, v) - 0.185, -(hypot(u - 0.125, v) - 0.215));
  P('knight.axe.blade', 'metal', S.raw((x, y, z) => {
    const u = x - Hd[0], v = y - Hd[1];
    const e = -(hypot(u + 0.05, v) - 0.185);
    return max(blade2(u, v), abs(z - Hd[2]) - (0.0015 + 0.009 * min(1, max(0, e) / 0.045)));
  }, [Hd[0] - 0.12, Hd[1], Hd[2], 0.22], 0.6, tag('axe.blade', Hd, 0.185, 0.215, 0.125, 0.0015, 0.009, 0.045)));
  const neck = P('knight.axe.neck', 'metalD', S.box([Hd[0] - 0.045, Hd[1], Hd[2]], [0.06, 0.04, 0.012], 0.006));
  P('knight.axe.socket', 'metalD', S.cyl(haftAt(2.03), haftAt(2.2), 0.026));
  P('knight.axe.beak', 'metal', S.squash(S.rcone([Hd[0] + 0.02, Hd[1], Hd[2]], [Hd[0] + 0.19, Hd[1] - 0.035, Hd[2]], 0.034, 0.003), Hd, [1, 1, 0.45]));
  P('knight.axe.spike', 'metal', S.squash(S.rcone(haftAt(2.2), haftAt(2.47), 0.024, 0.002), haftAt(2.3), [1, 1, 0.6]));
  P('knight.axe.rondel', 'metalD', S.cyl(haftAt(2.19), haftAt(2.205), 0.045));
  for (const [u, v] of [[-0.03, 0.022], [-0.03, -0.022], [-0.075, 0]]) sc.rivet(neck, [Hd[0] + u, Hd[1] + v, 0.6], [0, 0, -1], 0.005);

  // Right arm and hand on the haft
  const shR = [-0.238, 1.53, 0], elR = [-0.385, 1.24, -0.07];
  const g = haftAt(1.365);
  const wrR = [g[0] + 0.05, 1.352, g[2] - 0.045];
  P('knight.arm.r.rerebrace', 'metal', S.rcone(add(shR, [-0.03, -0.07, 0]), elR, 0.064, 0.056));
  P('knight.arm.r.couter', 'metal', S.disp(S.sphere(elR, 0.066), (x, y, z) => -0.007 * max(0, 1 - abs(y - elR[1]) / 0.011), 0.007, 0.5, tag('couter.groove', elR, 0.007, 0.011)));
  P('knight.arm.r.couter.fan', 'metal', dFlutes(S.ellipsoid(add(elR, [-0.06, 0, 0.0]), [0.016, 0.064, 0.062]), add(elR, [-1, 0, 0]), add(elR, [1, 0, 0]), 12, 0.004, 0.004, 0.5));
  P('knight.arm.r.vambrace', 'metal', dFlutes(S.rcone(elR, wrR, 0.058, 0.045), elR, wrR, 10, 0.004, 0.004, 0.5));
  const cA = lerp3(wrR, elR, 0.44), cB = lerp3(wrR, elR, 0.04);
  P('knight.arm.r.cuff', 'metal', dSaw(S.ccone(cA, cB, 0.072, 0.05), cA, [cB[0] - cA[0], cB[1] - cA[1], cB[2] - cA[2]], 0.03, 0.007, 0.008, 0.42));
  P('knight.hand.r', 'metal', S.ellipsoid([g[0] + 0.04, 1.368, g[2] - 0.012], [0.036, 0.056, 0.04]));
  for (let i = 0; i < 4; i++) {
    const y = 1.327 + i * 0.0265, q = haftAt(y);
    const fing = P(`knight.hand.r.finger.${i}`, 'metal', S.rcone([q[0] + 0.036, y + 0.004, q[2] + 0.01], [q[0] - 0.02, y, q[2] + 0.024], 0.0135, 0.0125));
    P(`knight.hand.r.finger.${i}.tip`, 'metal', S.rcone([q[0] - 0.02, y, q[2] + 0.024], [q[0] - 0.03, y - 0.002, q[2] + 0.004], 0.012, 0.01));
    sc.rivet(fing, [q[0] + 0.02, y + 0.003, 0.6], [0, 0, -1], 0.0035);
  }
  { const q = haftAt(1.44); P('knight.hand.r.thumb', 'metal', S.rcone([q[0] + 0.04, 1.425, q[2] - 0.005], [q[0] + 0.0, 1.445, q[2] + 0.024], 0.015, 0.0125)); }

  // Left arm behind the shield
  const shL = [0.238, 1.53, 0], elL = [0.365, 1.25, -0.03], wrL = [0.4, 1.08, 0.15];
  P('knight.arm.l.rerebrace', 'metal', S.rcone(add(shL, [0.03, -0.07, 0]), elL, 0.064, 0.056));
  P('knight.arm.l.couter', 'metal', S.sphere(elL, 0.066));
  P('knight.arm.l.couter.fan', 'metal', S.ellipsoid(add(elL, [0.06, 0, 0.0]), [0.016, 0.062, 0.06]));
  P('knight.arm.l.vambrace', 'metal', S.rcone(elL, wrL, 0.058, 0.046));

  // Shield with its sun emblem
  const so = [0.45, 1.03, 0.25], sR = S.rotY(0.5);
  const sh2 = (u, v) => max(hypot(u - 0.3, v - 0.1) - 0.56, hypot(u + 0.3, v - 0.1) - 0.56, v - 0.37);
  const bend = u => 0.85 * u * u;
  const shieldL = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1], w = z - so[2] + bend(u);
    return max(sh2(u, v), abs(w) - 0.011) - 0.004;
  }, [...so, 0.56], 0.55, tag('shield.plate', so, 0.011));
  const rimL = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1], w = z - so[2] + bend(u);
    const d2 = sh2(u, v);
    return max(d2, -(d2 + 0.032), abs(w - 0.006) - 0.013) - 0.004;
  }, [...so, 0.56], 0.55, tag('shield.rim', so, 0.032, 0.013));
  const bossL = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1] - 0.07, w = z - so[2] + bend(u) - 0.012;
    return (hypot(u, v, w / 0.6) - 0.058) * 0.6;
  }, [so[0], so[1] + 0.07, so[2] + 0.012, 0.08], 0.7, tag('shield.boss', so, 0.07, 0.058));
  const bossRing = S.raw((x, y, z) => {
    const u = x - so[0], v = y - so[1] - 0.07, w = z - so[2] + bend(u) - 0.014;
    return hypot(hypot(u, v) - 0.072, w) - 0.011;
  }, [so[0], so[1] + 0.07, so[2] + 0.012, 0.1], 0.6, tag('shield.bossring', so, 0.072, 0.011));
  P('knight.shield', 'metal', S.xform(shieldL, so, sR));
  P('knight.shield.rim', 'metalD', S.xform(rimL, so, sR));
  P('knight.shield.boss', 'metal', S.xform(bossL, so, sR));
  P('knight.shield.boss.ring', 'metalD', S.xform(bossRing, so, sR));
  const onShield = (u, v, lift = 0.0155) => { const l = S.mapply(sR, [u, v, lift - bend(u)]); return [so[0] + l[0], so[1] + l[1], so[2] + l[2]]; };
  const ring = r => { const a = []; for (let i = 0; i <= 48; i++) { const t = i / 48 * 2 * PI; a.push(onShield(cos(t) * r, 0.07 + sin(t) * r)); } return a; };
  sc.line(ring(0.118), { w: 2, ko: true });
  sc.line(ring(0.132), { w: 1, ko: true });
  for (let i = 0; i < 16; i++) {
    const t = i / 16 * 2 * PI + 0.2, r1 = 0.142, r2 = i % 2 ? 0.185 : 0.25, da = 0.1;
    const tip = [cos(t) * r2, 0.07 + sin(t) * r2];
    if (sh2(tip[0], tip[1]) > -0.045) continue;
    sc.line([onShield(cos(t - da) * r1, 0.07 + sin(t - da) * r1), onShield(tip[0], tip[1]), onShield(cos(t + da) * r1, 0.07 + sin(t + da) * r1)], { w: 2, ko: true });
  }
  const offs = (dist, n, lift) => {
    const a = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n * 2 * PI;
      let lo = 0, hi = 0.6;
      for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (sh2(cos(t) * m, 0.02 + sin(t) * m) < -dist) lo = m; else hi = m; }
      a.push(onShield(cos(t) * lo, 0.02 + sin(t) * lo, lift));
    }
    return a;
  };
  sc.line(offs(0.05, 110), { w: 2, ko: true });
  sc.line(offs(0.062, 110), { w: 1, ko: true });
  for (const p of offs(0.016, 26, 0.0245).slice(0, -1)) sc.decals.push({ type: 'rivet', p, r: 0.0058 });

  return sc;
}
