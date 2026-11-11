import { hash32 } from './rng.mjs';

const { abs, max, min, sqrt, hypot, sin, cos, floor } = Math;

// Every form is a function (x, y, z) => distance carrying:
//   .b    bounding sphere [cx, cy, cz, r]
//   .st   safe step factor for sphere tracing
//   .desc plain-object description { op, ...params, args: [child descs] }
const mk = (f, b, st, desc) => { f.b = b; f.st = st; f.desc = desc; return f; };

const needTag = (op, tag) => {
  if (typeof tag !== 'string' || !tag) throw new Error(`${op}: a string tag is required to identify the closure`);
};

const bUnion = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const d = hypot(dx, dy, dz);
  if (d + b[3] <= a[3]) return a;
  if (d + a[3] <= b[3]) return b;
  const r = (d + a[3] + b[3]) / 2, t = (r - a[3]) / d;
  return [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t, r];
};

export const sphere = (c, r) => mk((x, y, z) => hypot(x - c[0], y - c[1], z - c[2]) - r, [...c, r], 1, { op: 'sphere', c, r, args: [] });

export const ellipsoid = (c, r) => {
  const ix = 1 / r[0], iy = 1 / r[1], iz = 1 / r[2];
  const jx = ix * ix, jy = iy * iy, jz = iz * iz;
  const rm = min(r[0], r[1], r[2]);
  return mk((x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const k0 = hypot(px * ix, py * iy, pz * iz);
    const k1 = hypot(px * jx, py * jy, pz * jz);
    return k1 < 1e-9 ? -rm : k0 * (k0 - 1) / k1;
  }, [...c, max(r[0], r[1], r[2])], 0.85, { op: 'ellipsoid', c, r, args: [] });
};

export const rcone = (a, b, r1, r2) => {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return mk((x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  }, bUnion([...a, r1], [...b, r2]), 1, { op: 'rcone', a, b, r1, r2, args: [] });
};

export const cyl = (a, b, r) => {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const baba = bax * bax + bay * bay + baz * baz;
  const L = sqrt(baba);
  return mk((x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const paba = pax * bax + pay * bay + paz * baz;
    const xx = hypot(pax * baba - bax * paba, pay * baba - bay * paba, paz * baba - baz * paba) - r * baba;
    const yy = abs(paba - baba * 0.5) - baba * 0.5;
    const x2 = xx * xx, y2 = yy * yy * baba;
    const d = max(xx, yy) < 0 ? -min(x2, y2) : (xx > 0 ? x2 : 0) + (yy > 0 ? y2 : 0);
    return Math.sign(d) * sqrt(abs(d)) / baba;
  }, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, hypot(L / 2, r)], 1, { op: 'cyl', a, b, r, args: [] });
};

export const ccone = (a, b, ra, rb) => {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const baba = bax * bax + bay * bay + baz * baz;
  const rba = rb - ra, k = rba * rba + baba;
  const L = sqrt(baba);
  return mk((x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const papa = pax * pax + pay * pay + paz * paz;
    const paba = (pax * bax + pay * bay + paz * baz) / baba;
    const xx = sqrt(max(0, papa - paba * paba * baba));
    const cax = max(0, xx - (paba < 0.5 ? ra : rb));
    const cay = abs(paba - 0.5) - 0.5;
    const f = min(1, max(0, (rba * (xx - ra) + paba * baba) / k));
    const cbx = xx - ra - f * rba, cby = paba - f;
    const s = cbx < 0 && cay < 0 ? -1 : 1;
    return s * sqrt(min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba));
  }, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, hypot(L / 2, max(ra, rb))], 1, { op: 'ccone', a, b, ra, rb, args: [] });
};

export const box = (c, h, r = 0) => mk((x, y, z) => {
  const qx = abs(x - c[0]) - h[0] + r, qy = abs(y - c[1]) - h[1] + r, qz = abs(z - c[2]) - h[2] + r;
  return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r;
}, [...c, hypot(h[0], h[1], h[2])], 1, { op: 'box', c, h, r, args: [] });

export const union = (...fs) => mk((x, y, z) => {
  let d = 1e9;
  for (let i = 0; i < fs.length; i++) { const v = fs[i](x, y, z); if (v < d) d = v; }
  return d;
}, fs.map(f => f.b).reduce(bUnion), min(...fs.map(f => f.st)), { op: 'union', args: fs.map(f => f.desc) });

export const smin = (k, ...fs) => {
  const b = fs.map(f => f.b).reduce(bUnion);
  return mk((x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) {
      const v = fs[i](x, y, z);
      const h = max(k - abs(d - v), 0) / k;
      d = min(d, v) - h * h * k * 0.25;
    }
    return d;
  }, [b[0], b[1], b[2], b[3] + k * 0.3], min(0.9, ...fs.map(f => f.st)), { op: 'smin', k, args: fs.map(f => f.desc) });
};

export const sub = (a, ...bs) => mk((x, y, z) => {
  let d = a(x, y, z);
  for (let i = 0; i < bs.length; i++) { const v = -bs[i](x, y, z); if (v > d) d = v; }
  return d;
}, a.b, a.st, { op: 'sub', args: [a, ...bs].map(f => f.desc) });

export const inter = (a, ...bs) => mk((x, y, z) => {
  let d = a(x, y, z);
  for (let i = 0; i < bs.length; i++) { const v = bs[i](x, y, z); if (v > d) d = v; }
  return d;
}, a.b, a.st, { op: 'inter', args: [a, ...bs].map(f => f.desc) });

export const round = (f, r) => mk((x, y, z) => f(x, y, z) - r, [f.b[0], f.b[1], f.b[2], f.b[3] + r], f.st, { op: 'round', r, args: [f.desc] });
export const shell = (f, t) => mk((x, y, z) => abs(f(x, y, z)) - t, [f.b[0], f.b[1], f.b[2], f.b[3] + t], f.st, { op: 'shell', t, args: [f.desc] });
export const disp = (f, g, amp, st = 0.6, tag) => {
  needTag('disp', tag);
  return mk((x, y, z) => f(x, y, z) + g(x, y, z), [f.b[0], f.b[1], f.b[2], f.b[3] + amp], min(st, f.st), { op: 'disp', amp, st, tag, args: [f.desc] });
};
export const raw = (f, b, st = 0.6, tag) => {
  needTag('raw', tag);
  // wrap so every form is a fresh function; mk mutates what it is given
  return mk((x, y, z) => f(x, y, z), b, st, { op: 'raw', b, st, tag, args: [] });
};

export const rotX = a => [1, 0, 0, 0, cos(a), -sin(a), 0, sin(a), cos(a)];
export const rotY = a => [cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a)];
export const rotZ = a => [cos(a), -sin(a), 0, sin(a), cos(a), 0, 0, 0, 1];
export const mmul = (A, B) => {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
};
export const mapply = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];

export const xform = (f, o, R) => {
  const c = mapply(R, [f.b[0] - o[0], f.b[1] - o[1], f.b[2] - o[2]]);
  return mk((x, y, z) => {
    const px = x - o[0], py = y - o[1], pz = z - o[2];
    return f(o[0] + R[0] * px + R[3] * py + R[6] * pz, o[1] + R[1] * px + R[4] * py + R[7] * pz, o[2] + R[2] * px + R[5] * py + R[8] * pz);
  }, [o[0] + c[0], o[1] + c[1], o[2] + c[2], f.b[3]], f.st, { op: 'xform', o, R, args: [f.desc] });
};

export const squash = (f, o, s) => {
  const m = min(s[0], s[1], s[2]), M = max(s[0], s[1], s[2]);
  return mk((x, y, z) => f(o[0] + (x - o[0]) / s[0], o[1] + (y - o[1]) / s[1], o[2] + (z - o[2]) / s[2]) * m,
    [o[0] + (f.b[0] - o[0]) * s[0], o[1] + (f.b[1] - o[1]) * s[1], o[2] + (f.b[2] - o[2]) * s[2], f.b[3] * M], min(f.st, 0.8), { op: 'squash', o, s, args: [f.desc] });
};

const hash = (x, y, z) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const sm = t => t * t * (3 - 2 * t);
export const noise3 = (x, y, z) => {
  const xi = floor(x), yi = floor(y), zi = floor(z);
  const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
};
export const fbm = (x, y, z, o = 3) => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
  return s;
};

export const surf = (f, o, d, maxT = 3) => {
  const l = hypot(d[0], d[1], d[2]);
  const dx = d[0] / l, dy = d[1] / l, dz = d[2] / l;
  let t = 0;
  for (let i = 0; i < 200 && t < maxT; i++) {
    const v = f(o[0] + dx * t, o[1] + dy * t, o[2] + dz * t);
    if (v < 0.0004) return [o[0] + dx * t, o[1] + dy * t, o[2] + dz * t];
    t += v * f.st;
  }
  return null;
};

export const ssub = (k, base, cut) => mk((x, y, z) => {
  const d2 = base(x, y, z), d1 = cut(x, y, z);
  const h = min(1, max(0, 0.5 - 0.5 * (d2 + d1) / k));
  return d2 + (-d1 - d2) * h + k * h * (1 - h);
}, base.b, min(0.8, base.st), { op: 'ssub', k, args: [base.desc, cut.desc] });
export const mirrorX = f => mk((x, y, z) => f(abs(x), y, z), [0, f.b[1], f.b[2], f.b[3] + abs(f.b[0])], f.st, { op: 'mirrorX', args: [f.desc] });

/** 8-char hex identity of a form, from its construction description. */
export const hashForm = form => hash32(JSON.stringify(form.desc)).toString(16).padStart(8, '0');

export const part = (name, mat, form, opts = {}) => ({ name, mat, sdf: form, hash: hashForm(form), ...opts });

/** Collects parts and decals (rivets, holes, lines, polys, strands) for one scene. */
export function scene() {
  const S = { parts: [], decals: [] };
  S.add = (name, mat, form, opts = {}) => { S.parts.push(part(name, mat, form, opts)); return form; };
  S.rivet = (form, from, dir, r = 0.006) => {
    const p = surf(form, from, dir);
    if (p) S.decals.push({ type: 'rivet', p, r });
  };
  S.hole = (form, from, dir, r = 0.0042) => {
    const p = surf(form, from, dir);
    if (p) S.decals.push({ type: 'hole', p, r });
  };
  S.line = (points, { w = 1, ko = false } = {}) => { S.decals.push({ type: 'line', pts: points, w, ko }); };
  S.lineOn = (form, origins, dir, { w = 1, ko = false } = {}) => {
    S.decals.push({ type: 'line', pts: origins.map(o => surf(form, o, dir)), w, ko });
  };
  S.poly = (points, { closed = true, fill = null, stroke = null, sw = 1 } = {}) => {
    S.decals.push({ type: 'poly', pts: points, closed, fill, stroke, sw });
  };
  S.strand = (points, { thr = 0.5 } = {}) => { S.decals.push({ type: 'strand', pts: points, thr }); };
  return S;
}
