// Render one panel: forms and actors into one z-buffer and one shadow map,
// then a tone per pixel from its material.
import { makeCam, lightCam, rasterSDF, normalsSDF, shadowTerm, ambient } from './raster.mjs';
import { rasterMesh } from './mesh.mjs';
import { partNamer } from './vrm.mjs';
import { MATERIALS } from './materials.mjs';
import { flat } from './backgrounds.mjs';

const { max, min, pow, hypot } = Math;
const norm = a => { const l = hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toCam = (v, cam) => [dot(v, cam.right), dot(v, cam.up), dot(v, cam.fwd)];

/** Actor material class to ink material. */
export const ACTOR_MATS = { skin: 'skin', hair: 'hairB', cloth: 'fabric', tex: 'tex' };

export const LIGHT_DEFAULTS = { dir: [-0.62, 0.62, 0.55], target: [0, 1.1, 0], scale: 240, bias: 0.022, size: 1100 };

/**
 * cam is a camera spec for makeCam ({ yaw, pitch, scale, cx, cy, W, H, target }).
 * Returns buffers plus the merged part list; ids in buf.id index `parts` 1-based.
 */
export function renderPanel({
  scene = null, actors = [], cam: camSpec, background = flat(0), light = {},
  fill = [0.75, -0.15, 0.5], aoRadius = 0.036, skinDetail = 0.32, shineAt = 0.45,
}) {
  const cam = makeCam(camSpec);
  const { W, H } = cam, N = W * H;
  const parts = scene ? scene.parts.map(p => ({ ...p })) : [];
  for (const p of parts) if (!MATERIALS[p.mat]) throw new Error(`part "${p.name}": unknown material "${p.mat}"`);

  const id = new Int16Array(N), depth = new Float32Array(N).fill(-1e9);
  const pos = new Float32Array(N * 3), wn = new Float32Array(N * 3), lum = new Float32Array(N).fill(1);
  if (scene && parts.length) {
    const sb = rasterSDF(parts, cam);
    const sn = normalsSDF(parts, cam, sb);
    id.set(sb.id); depth.set(sb.depth); pos.set(sb.pos); wn.set(sn.wn);
  }

  // One id per actor part name; partOwner maps a part id to its actor index (-1 for forms).
  const partOwner = parts.map(() => -1);
  const idOfs = actors.map((a, ai) => {
    if (!a.name) throw new Error(`actor ${ai}: missing name`);
    const nameOf = partNamer(a.name), ids = new Map();
    return (prim, mat) => {
      const name = nameOf(prim, mat);
      if (!ids.has(name)) {
        parts.push({ name, mat: ACTOR_MATS[mat.cls], cls: mat.cls, hair: a.hair || 'black' });
        partOwner.push(ai);
        ids.set(name, parts.length);
      }
      return ids.get(name);
    };
  });
  actors.forEach((a, ai) => {
    const mb = rasterMesh(a.model, a.posed, cam, idOfs[ai]);
    for (let i = 0; i < N; i++) if (mb.id[i] && mb.depth[i] > depth[i]) {
      id[i] = mb.id[i]; depth[i] = mb.depth[i]; lum[i] = mb.lum[i];
      for (let k = 0; k < 3; k++) { pos[i * 3 + k] = mb.pos[i * 3 + k]; wn[i * 3 + k] = mb.wn[i * 3 + k]; }
    }
  });
  const buf = { id, depth, pos, W, H };

  // Camera-space normals; mesh normals facing away are flipped (thin, two-sided cloth and hair).
  const nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!id[i]) continue;
    let a = wn[i * 3], b = wn[i * 3 + 1], c = wn[i * 3 + 2];
    const l = hypot(a, b, c) || 1; a /= l; b /= l; c /= l;
    let z = a * cam.fwd[0] + b * cam.fwd[1] + c * cam.fwd[2];
    if (z < 0 && parts[id[i] - 1].cls) { a = -a; b = -b; c = -c; z = -z; }
    wn[i * 3] = a; wn[i * 3 + 1] = b; wn[i * 3 + 2] = c;
    nx[i] = a * cam.right[0] + b * cam.right[1] + c * cam.right[2];
    ny[i] = a * cam.up[0] + b * cam.up[1] + c * cam.up[2];
    nz[i] = z;
  }
  const nrm = { nx, ny, nz, wn };

  // Shadow map holds forms and actors together.
  const L = { ...LIGHT_DEFAULTS, ...light };
  const Lw = norm(L.dir);
  const lc = lightCam(Lw, L.target, L.scale, L.size);
  const ld = new Float32Array(lc.W * lc.H).fill(-1e9);
  if (scene && parts.length) ld.set(rasterSDF(scene.parts, lc, false).depth);
  actors.forEach((a, ai) => {
    const m = rasterMesh(a.model, a.posed, lc, idOfs[ai], false);
    for (let i = 0; i < ld.length; i++) if (m.depth[i] > ld[i]) ld[i] = m.depth[i];
  });
  const sh = shadowTerm(buf, lc, { depth: ld }, L.bias);
  const ao = ambient(buf, nrm, cam.scale, max(6, cam.scale * aoRadius), 24, aoRadius * 8);

  // Mean texture luminance of skin and hair, per actor.
  const sums = actors.map(() => ({ s: 0, sn: 0, h: 0, hn: 0 }));
  for (let i = 0; i < N; i++) {
    const p = id[i];
    if (!p || partOwner[p - 1] < 0) continue;
    const acc = sums[partOwner[p - 1]], c = parts[p - 1].cls;
    if (c === 'skin') { acc.s += lum[i]; acc.sn++; } else if (c === 'hair') { acc.h += lum[i]; acc.hn++; }
  }
  const means = sums.map(a => ({ skin: a.sn ? a.s / a.sn : 0.8, hair: a.hn ? a.h / a.hn : 0.5 }));

  const D = new Float32Array(N), aux = new Float32Array(N);
  const Lc = toCam(Lw, cam), Fc = toCam(norm(fill), cam);
  const Hc = norm([Lc[0], Lc[1], Lc[2] + 1]);
  const toneFns = parts.map(p => MATERIALS[p.mat]);
  const ctx = { lam: 0, fill: 0, rim: 0, nz: 0, ao: 1, spec: 0, lum: 1, wy: 0, skinMean: 0.8, hairMean: 0.5, skinDetail, shineAt, hair: 'black', aux: 0 };
  for (let i = 0; i < N; i++) {
    const p = id[i];
    if (!p) { D[i] = background(i % W, (i / W) | 0, W, H); continue; }
    const a = nx[i], b = ny[i], c = nz[i];
    const owner = partOwner[p - 1];
    ctx.lam = max(0, a * Lc[0] + b * Lc[1] + c * Lc[2]) * sh[i];
    ctx.fill = max(0, a * Fc[0] + b * Fc[1] + c * Fc[2]);
    ctx.rim = pow(1 - max(0, c), 3.2);
    ctx.nz = c;
    ctx.ao = ao[i];
    ctx.spec = pow(max(0, a * Hc[0] + b * Hc[1] + c * Hc[2]), 60) * sh[i];
    ctx.lum = lum[i];
    ctx.wy = wn[i * 3 + 1];
    ctx.skinMean = owner >= 0 ? means[owner].skin : 0.8;
    ctx.hairMean = owner >= 0 ? means[owner].hair : 0.5;
    ctx.hair = parts[p - 1].hair || 'black';
    ctx.aux = 0;
    D[i] = min(1, max(0, toneFns[p - 1](ctx)));
    aux[i] = ctx.aux;
  }
  return { cam, buf, nrm, D, aux, W, H, parts, decals: scene ? scene.decals || [] : [] };
}
