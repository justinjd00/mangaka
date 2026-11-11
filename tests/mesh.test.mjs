import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVRM, poseVRM, partNamer } from '../kit/vrm.mjs';
import { rasterMesh } from '../kit/mesh.mjs';
import { makeCam } from '../kit/raster.mjs';
import { POSES } from '../kit/poses.mjs';

const model = loadVRM(new URL('../models/fumiriya.vrm', import.meta.url).pathname);
const { posed, bonePos } = poseVRM(model, { pose: POSES.stand });
const namer = partNamer('a');
const ids = new Map();
// Head only: the body mesh would run off the bottom edge of a close-up.
const idOf = (prim, mat) => {
  if (prim.name.startsWith('Body')) return 0;
  const n = namer(prim, mat);
  if (!ids.has(n)) ids.set(n, ids.size + 1);
  return ids.get(n);
};
const S = 360;
const cam = makeCam({ yaw: 0.2, pitch: 0, scale: 800, cx: S / 2, cy: S / 2, W: S, H: S, target: [bonePos.head[0], bonePos.head[1] + 0.08, bonePos.head[2]] });

test('head close-up shows several parts and stays inside the frame', () => {
  const r = rasterMesh(model, posed, cam, idOf, false);
  const seen = new Set(r.id);
  seen.delete(0);
  assert.ok(seen.size >= 5, `distinct ids: ${seen.size}`);
  for (let k = 0; k < S; k++) {
    for (const i of [k, (S - 1) * S + k, k * S, k * S + S - 1]) assert.equal(r.id[i], 0, `border pixel ${i}`);
  }
});

test('raster is deterministic', () => {
  const a = rasterMesh(model, posed, cam, idOf, true), b = rasterMesh(model, posed, cam, idOf, true);
  for (const k of ['id', 'depth', 'pos', 'wn', 'lum']) assert.deepEqual(a[k], b[k], k);
});

test('idOf returning 0 skips a primitive', () => {
  const r = rasterMesh(model, posed, cam, () => 0, false);
  assert.ok(r.id.every(v => v === 0));
  assert.ok(r.depth.every(v => v === -1e9));
});
