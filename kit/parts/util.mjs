// Small helpers shared by the part builders: vector arithmetic, closure tags and
// the two displacement patterns (flutes and stacked lames) used on armour.
import * as S from '../sdf.mjs';

const { abs, sin, atan2, hypot, floor } = Math;

export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const nrm = a => { const l = hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A bound that never culls; for half-space cuts that only make sense inside inter(). */
export const ANY = [0, 0, 0, 9];
/** A closure tag from every number (and string) the closure reads. */
export const tag = (...xs) => xs.flat(Infinity).join(':');
/** p offset by [x, y, z]. */
export const at3 = (p, x, y, z) => [p[0] + x, p[1] + y, p[2] + z];

/** Rotation taking +Y to the unit direction d (shortest arc). Row-major, as kit/sdf.mjs. */
export function alignY(d) {
  const [x, y, z] = nrm(d);
  if (y > 0.999999) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (y < -0.999999) return [1, 0, 0, 0, -1, 0, 0, 0, -1];
  // Rodrigues with axis (z, 0, -x) / s, cos = y.
  const k = 1 / (1 + y);
  return [
    y + z * z * k, x, -x * z * k,
    -x, y, -z,
    -x * z * k, z, y + x * x * k,
  ];
}

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
/** k flutes of depth A around the axis a-b. */
export const dFlutes = (f, a, b, k, A, amp, st) => S.disp(f, flutes(a, b, k, A), amp, st, tag('flutes', k, A, a, b));
/** Lames: sawtooth steps of depth A every `pitch` along dir from o. */
export const dSaw = (f, o, dir, pitch, A, amp, st) => S.disp(f, saw(o, dir, pitch, A), amp, st, tag('saw', pitch, A, o, dir));
