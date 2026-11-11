// Tone per material: light terms in, tone out (0 white to 1 black).
//
// ctx carries the light terms of one pixel:
//   lam   direct light (Lambert term times shadow), 0..1
//   fill  fill light, 0..1
//   rim   rim term pow(1 - nz, 3.2)
//   nz    normal towards the viewer, -1..1
//   ao    ambient visibility, 0 (occluded) .. 1 (open)
//   spec  specular term, 0..1
//   lum   texture luminance (actors), 0..1
//   wy    world-space normal y (hair shine band)
//   skinMean, hairMean  mean texture luminance of the actor's skin and hair
//   skinDetail, shineAt, hair ('black' | 'light')  per-panel options
// A material may set ctx.aux (hair shine strength for strand decals).
const { max, min, pow, abs } = Math;
const sst = (a, b, x) => { const t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const formLight = c => 0.06 + 0.95 * c.lam + 0.28 * c.fill;
const occlude = (I, c) => 1 - I * (0.34 + 0.66 * c.ao);
const rimLift = (I, c, k, amount) => I + (1 - I) * min(1, c.rim * k) * amount;

const metalBase = c => {
  const I = sst(0.12, 0.74, formLight(c));
  return c.spec > 0.45 ? 1 : I;
};

export const MATERIALS = {
  // Forms built from distance fields.
  metal: c => occlude(rimLift(metalBase(c), c, 1.5, 0.92), c),
  metalD: c => {
    const I = c.spec > 0.45 ? 1 : sst(0.12, 0.74, formLight(c)) * 0.72;
    return occlude(rimLift(I, c, 1.5, 0.92), c);
  },
  cloth: c => occlude(rimLift(sst(0.05, 0.95, formLight(c)) * 0.8, c, 1.1, 0.6), c),
  hair: c => occlude(rimLift(sst(0.1, 0.9, formLight(c)) * 0.5, c, 1.6, 0.85), c),
  leather: c => occlude(rimLift(formLight(c) * 0.62, c, 1.3, 0.7), c),
  wood: c => occlude(rimLift(formLight(c) * 0.62, c, 1.3, 0.7), c),
  mail: c => occlude(formLight(c) * 0.6 + 0.08, c),
  stone: c => occlude(rimLift(sst(0, 1, formLight(c)) * 0.92, c, 1, 0.5), c),
  ground: c => occlude(sst(0, 0.85, formLight(c)) * 0.95, c),

  // Actors from VRM models.
  skin: c => {
    const I = sst(0.1, 0.5, 0.36 + c.lam + 0.25 * c.fill);
    const sm = c.skinMean || 0.8;
    const detail = max(0, min(1, ((sm - c.lum) / sm - (c.skinDetail ?? 0.32)) * 3.5));
    return max(1 - I * (0.62 + 0.38 * c.ao), detail);
  },
  hairB: c => {
    const dv = abs(c.wy - (c.shineAt ?? 0.45));
    const texture = sst(0.85, 1.2, c.lum / (c.hairMean || 0.5));
    if (c.hair === 'light') {
      // Light hair: open white with a soft shadow side and a darker texture streak.
      c.aux = 0;
      const I = sst(0.05, 0.6, 0.2 + c.lam + 0.2 * c.fill) * (0.55 + 0.45 * texture);
      return 1 - I * (0.6 + 0.4 * c.ao);
    }
    const rim = min(1, pow(1 - max(0, c.nz), 5) * 1.4) * 0.6;
    const shine = (1 - sst(0.03, 0.13, dv)) * sst(0.1, 0.5, c.lam) * (0.3 + 0.7 * texture) * 0.92;
    c.aux = (1 - sst(0.04, 0.5, dv)) * sst(0.02, 0.4, c.lam);
    return 1 - (shine + (1 - shine) * rim);
  },
  fabric: c => {
    const I = pow(c.lum, 0.9) * (0.3 + 0.7 * sst(0.1, 0.6, c.lam + 0.2 * c.fill));
    return 1 - rimLift(I, c, 1, 0.35) * (0.45 + 0.55 * c.ao);
  },
  tex: c => 1 - sst(0.3, 0.8, c.lum),
};

/** Tone of one pixel for material `mat`. Throws on an unknown material. */
export function toneOf(mat, ctx) {
  const f = MATERIALS[mat];
  if (!f) throw new Error(`unknown material "${mat}" (known: ${Object.keys(MATERIALS).join(', ')})`);
  return f(ctx);
}
