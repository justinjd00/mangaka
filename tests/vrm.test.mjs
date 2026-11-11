import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVRM, poseVRM, partNamer } from '../kit/vrm.mjs';
import { POSES } from '../kit/poses.mjs';

const MODEL = fileURLToPath(new URL('../models/fumiriya.vrm', import.meta.url));
const model = loadVRM(MODEL);

test('loads a VRM with metadata and a humanoid skeleton', () => {
  assert.equal(model.meta.licenseName, 'CC0');
  assert.ok(Object.keys(model.bones).length >= 50);
  assert.ok(model.prims.length > 0);
  assert.deepEqual(new Set(model.materials.map(m => m.cls)), new Set(['skin', 'hair', 'cloth', 'tex']));
});

test('standing pose lowers the hand below the shoulder', () => {
  const { bonePos } = poseVRM(model, { pose: POSES.stand });
  assert.ok(bonePos.leftHand[1] < bonePos.leftUpperArm[1]);
});

test('model faces +Z after the default flip and root moves it', () => {
  const { bonePos } = poseVRM(model);
  assert.ok(bonePos.leftFoot[2] > bonePos.hips[2] - 0.2);
  const moved = poseVRM(model, { root: { pos: [1, 0, 2], yaw: 0 } }).bonePos;
  assert.ok(Math.abs(moved.hips[0] - bonePos.hips[0] - 1) < 1e-6);
  assert.ok(Math.abs(moved.hips[2] - bonePos.hips[2] - 2) < 1e-6);
});

test('expression morphs change face vertices', () => {
  const rest = poseVRM(model).posed, open = poseVRM(model, { expr: { a: 1 } }).posed;
  const changed = rest.some((r, i) => {
    if (!/Face/.test(r.prim.name)) return false;
    const o = open[i].wp;
    for (let k = 0; k < o.length; k++) if (o[k] !== r.wp[k]) return true;
    return false;
  });
  assert.ok(changed);
});

test('partNamer gives stable names', () => {
  const name = partNamer('hero');
  const names = model.prims.map(p => name(p, model.materials[p.mat]));
  assert.deepEqual(names, model.prims.map(p => name(p, model.materials[p.mat])));
  assert.ok(names.includes('hero.skin'));
  assert.ok(names.some(n => /^hero\.hair\.\d+$/.test(n)));
  assert.ok(names.includes('hero.Tops'));
  assert.ok(names.includes('hero.FaceBrow'));
  assert.equal(new Set(names.filter(n => n.includes('.hair.'))).size, names.filter(n => n.includes('.hair.')).length);
});

function glb(json) {
  const body = Buffer.from(JSON.stringify(json));
  const pad = Buffer.alloc((4 - body.length % 4) % 4, 0x20);
  const chunk = Buffer.concat([body, pad]);
  const head = Buffer.alloc(20);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + chunk.length, 8);
  head.writeUInt32LE(chunk.length, 12); head.write('JSON', 16, 'ascii');
  return Buffer.concat([head, chunk]);
}
function crafted(json) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangaka-'));
  const file = path.join(dir, 'x.glb');
  fs.writeFileSync(file, glb(json));
  return file;
}

test('VRM 1.0 files are rejected', () => {
  const f = crafted({ asset: { version: '2.0' }, extensions: { VRMC_vrm: {} } });
  assert.throws(() => loadVRM(f), { message: 'VRM 1.0 is not supported yet; export as VRM 0.x' });
});

test('plain glTF files are rejected', () => {
  const f = crafted({ asset: { version: '2.0' } });
  assert.throws(() => loadVRM(f), { message: 'not a VRM file' });
});

test('poseVRM gives a world rotation per bone that carries the root yaw', () => {
  const a = poseVRM(model, { pose: POSES.stand });
  const b = poseVRM(model, { pose: POSES.stand, root: { pos: [1, 0, 2], yaw: 0.5 } });
  assert.deepEqual(Object.keys(a.boneRot).sort(), Object.keys(a.bonePos).sort());
  const c = Math.cos(0.5), s = Math.sin(0.5);
  for (const bone of ['hips', 'rightHand', 'head']) {
    const R = a.boneRot[bone], Q = b.boneRot[bone];
    // Q = rotY(0.5) R, column by column.
    for (let col = 0; col < 3; col++) {
      const x = R[col], y = R[3 + col], z = R[6 + col];
      assert.ok(Math.abs(Q[col] - (c * x + s * z)) < 1e-9 && Math.abs(Q[3 + col] - y) < 1e-9 && Math.abs(Q[6 + col] - (-s * x + c * z)) < 1e-9, bone);
    }
  }
  // Rest pose after the flip: X and Z turned around.
  const rest = poseVRM(model).boneRot.hips.map(v => Math.round(v * 1e6) / 1e6 + 0);
  assert.deepEqual(rest, [-1, 0, 0, 0, 1, 0, 0, 0, -1]);
});

test('skin: false poses the bones only, with the same bone frames', () => {
  const full = poseVRM(model, { pose: POSES.stand, root: { pos: [0.2, 0, 0], yaw: 1 } });
  const bones = poseVRM(model, { pose: POSES.stand, root: { pos: [0.2, 0, 0], yaw: 1 }, skin: false });
  assert.deepEqual(bones.posed, []);
  assert.deepEqual(bones.bonePos, full.bonePos);
  assert.deepEqual(bones.boneRot, full.boneRot);
});

test('readAccessor applies sparse values over the base data or over zeros', async () => {
  const { readAccessor } = await import('../kit/vrm.mjs');
  // Base: four VEC3 floats; sparse: indices (uint16) 1 and 3, then their two VEC3 values.
  const base = new Float32Array([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
  const idx = new Uint16Array([1, 3]);
  const vals = new Float32Array([9, 8, 7, 6, 5, 4]);
  const bin = Buffer.concat([Buffer.from(base.buffer), Buffer.from(idx.buffer), Buffer.from(vals.buffer)]);
  const json = {
    bufferViews: [{ byteOffset: 0, byteLength: 48 }, { byteOffset: 48, byteLength: 4 }, { byteOffset: 52, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', sparse: { count: 2, indices: { bufferView: 1, componentType: 5123 }, values: { bufferView: 2 } } },
      { componentType: 5126, count: 4, type: 'VEC3', sparse: { count: 2, indices: { bufferView: 1, componentType: 5123 }, values: { bufferView: 2 } } },
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', sparse: { count: 1, indices: { bufferView: 1, byteOffset: 2, componentType: 5123 }, values: { bufferView: 2, byteOffset: 12 } } },
    ],
  };
  assert.deepEqual([...readAccessor(json, bin, 0)], [1, 1, 1, 9, 8, 7, 3, 3, 3, 6, 5, 4]);
  assert.deepEqual([...readAccessor(json, bin, 1)], [0, 0, 0, 9, 8, 7, 0, 0, 0, 6, 5, 4]);
  assert.deepEqual([...readAccessor(json, bin, 2)], [1, 1, 1, 2, 2, 2, 3, 3, 3, 6, 5, 4]);
  assert.throws(() => readAccessor(json, bin, 7), /glTF accessor 7 does not exist/);
  const past = structuredClone(json); past.accessors[0].count = 2;
  assert.throws(() => readAccessor(past, bin, 0), /sparse index 3 is past its count 2/);
});
