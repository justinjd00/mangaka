// Ink styles: plain objects read by kit/ink.mjs.
//
// black        tone at and above which a pixel is solid black
// tone1/tone2  tone thresholds of the light and dark screentone regions
// toneMats     materials that get screentone; on them hatch layers 0 and 1 are skipped
// materials    per material { fields: [layer0, layer1, layer2], thresholds: [[lo, hi] x3], len: [min, max], crease }
//              fields: 'diag' | 'diag2' (straight scanlines), 'lat' | 'mer' | 'sil' | 'cross' |
//              'fix' | 'fix2' | 'flow' (streamlines), or null for no layer
// brush        line weights of the three line classes (crease, inner edge, silhouette)
// hatchSpacing spacing of the three hatch layers, px
// depthK       scale of the depth-step thresholds for edges (0.3 for close-ups)
// balance      allowed share of black pixels in a panel, { black: [min, max] }

const OFF = [[1, 1], [1, 1], [1, 1]];
const BASE = {
  metal: { fields: ['lat', 'mer', 'diag'], thresholds: [[0.13, 0.44], [0.42, 0.66], [0.62, 0.81]], len: [10, 36] },
  metalD: { fields: ['lat', 'mer', 'diag'], thresholds: [[0.12, 0.4], [0.38, 0.6], [0.56, 0.76]], len: [8, 26] },
  cloth: { fields: ['sil', 'cross', 'diag'], thresholds: [[0.14, 0.46], [0.5, 0.7], [0.62, 0.8]], len: [26, 90] },
  hair: { fields: ['sil', 'sil', 'diag'], thresholds: [[0.08, 0.5], [0.25, 0.7], [0.7, 0.82]], len: [30, 110] },
  leather: { fields: ['fix', 'fix2', 'diag'], thresholds: [[0.15, 0.45], [0.4, 0.65], [0.6, 0.78]], len: [7, 20] },
  wood: { fields: ['sil', 'cross', 'diag'], thresholds: [[0.1, 0.5], [0.55, 0.72], [0.66, 0.8]], len: [20, 60] },
  mail: { fields: [null, 'diag', null], thresholds: [[1, 1], [0.5, 0.7], [1, 1]], len: [6, 14] },
  stone: { fields: ['mer', 'lat', 'diag'], thresholds: [[0.16, 0.5], [0.42, 0.68], [0.58, 0.8]], len: [10, 44] },
  ground: { fields: ['lat', 'diag', 'diag2'], thresholds: [[0.18, 0.5], [0.44, 0.7], [0.6, 0.8]], len: [8, 34] },
  skin: { fields: ['diag', 'diag2', null], thresholds: [[0.3, 0.5], [0.58, 0.74], [1, 1]], len: [22, 70], crease: 0.5 },
  hairB: { fields: [null, null, null], thresholds: OFF, len: [24, 90], crease: 0.3 },
  fabric: { fields: ['diag', 'diag2', null], thresholds: [[0.3, 0.5], [0.58, 0.74], [1, 1]], len: [20, 60] },
  tex: { fields: [null, null, null], thresholds: OFF, len: [10, 20], crease: 0.2 },
  sky: { fields: ['flow', 'diag', 'diag2'], thresholds: [[0.12, 0.5], [0.4, 0.72], [0.62, 0.84]], len: [30, 120] },
};
const DEFAULT_CREASE = 0.84;
const FORM_MATS = ['metal', 'metalD', 'cloth', 'hair', 'leather', 'wood', 'mail', 'stone', 'ground'];

const clone = v => JSON.parse(JSON.stringify(v));
const withCrease = mats => Object.fromEntries(Object.entries(mats).map(([k, m]) => [k, { crease: DEFAULT_CREASE, ...m }]));
const keepOnly = (mats, hatched) => Object.fromEntries(Object.entries(mats).map(([k, m]) =>
  [k, hatched.includes(k) ? m : { ...m, fields: [null, null, null] }]));
const coreOnly = mats => Object.fromEntries(Object.entries(mats).map(([k, m]) => [k, { ...m, fields: [null, null, m.fields[2]] }]));

export const STYLES = {
  'seinen-dense': {
    name: 'seinen-dense',
    black: 0.83, tone1: 0.2, tone2: 0.52,
    toneMats: ['skin', 'fabric', 'tex'],
    materials: withCrease(BASE),
    brush: [0.8, 1.45, 2.45],
    hatchSpacing: [3.1, 3.0, 2.7],
    depthK: 1,
    balance: { black: [0.12, 0.6] },
  },
  'shonen-clean': {
    name: 'shonen-clean',
    black: 0.8, tone1: 0.22, tone2: 0.55,
    toneMats: ['sky', 'cloth', 'skin', 'fabric', 'tex'],
    materials: withCrease(keepOnly(BASE, ['metal', 'metalD', 'stone', 'ground'])),
    brush: [0.9, 1.6, 2.8],
    hatchSpacing: [3.4, 3.2, 2.9],
    depthK: 1,
    balance: { black: [0.05, 0.5] },
  },
  'tone-soft': {
    name: 'tone-soft',
    black: 0.86, tone1: 0.16, tone2: 0.46,
    toneMats: [...FORM_MATS, 'skin', 'hairB', 'fabric', 'tex', 'sky'],
    materials: withCrease(coreOnly(BASE)),
    brush: [0.7, 1.3, 2.2],
    hatchSpacing: [3.3, 3.2, 3.0],
    depthK: 1,
    balance: { black: [0.03, 0.45] },
  },
};

const REQUIRED = ['black', 'tone1', 'tone2', 'toneMats', 'materials', 'brush', 'hatchSpacing', 'depthK'];

/**
 * A style by preset name or as an object, with `overrides` applied on top.
 * `materials` merge per material and per key; every other key is replaced.
 * Returns a fresh object; the presets are never mutated.
 */
export function resolveStyle(nameOrObject = 'seinen-dense', overrides = {}) {
  let base;
  if (typeof nameOrObject === 'string') {
    base = STYLES[nameOrObject];
    if (!base) throw new Error(`unknown style "${nameOrObject}" (known: ${Object.keys(STYLES).join(', ')})`);
  } else base = nameOrObject;
  const out = clone(base);
  for (const [k, v] of Object.entries(overrides || {})) {
    if (k === 'materials') {
      for (const [m, mv] of Object.entries(v)) out.materials[m] = { crease: DEFAULT_CREASE, ...(out.materials[m] || {}), ...clone(mv) };
    } else out[k] = clone(v);
  }
  for (const k of REQUIRED) if (out[k] === undefined) throw new Error(`style "${out.name || '?'}": missing "${k}"`);
  for (const [m, cfg] of Object.entries(out.materials)) {
    if (!Array.isArray(cfg.fields) || cfg.fields.length !== 3) throw new Error(`style "${out.name || '?'}": material "${m}" needs fields [3]`);
    if (!Array.isArray(cfg.thresholds) || cfg.thresholds.length !== 3) throw new Error(`style "${out.name || '?'}": material "${m}" needs thresholds [3]`);
  }
  return out;
}
