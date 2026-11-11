import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVRM, poseVRM } from '../kit/vrm.mjs';
import { HANDS, POSES, withHands, mirrorPose, mixPose } from '../kit/poses.mjs';

const model = loadVRM(new URL('../models/fumiriya.vrm', import.meta.url).pathname);

test('library has the documented names', () => {
  assert.deepEqual(Object.keys(HANDS), ['open', 'relaxed', 'fist', 'point', 'grip', 'hilt']);
  assert.deepEqual(Object.keys(POSES), ['tpose', 'stand', 'relaxed', 'guard', 'reach', 'walk', 'run', 'sit']);
});

test('every pose uses bones the model has and poses without error', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    for (const [bone, r] of Object.entries(pose)) {
      assert.ok(model.bones[bone] !== undefined, `${name}: unknown bone ${bone}`);
      assert.equal(r.length, 3);
      assert.ok(r.every(Number.isFinite));
    }
    const { posed } = poseVRM(model, { pose });
    assert.ok(posed[0].wp.every(Number.isFinite), name);
  }
});

test('withHands replaces only finger bones and accepts shapes by name', () => {
  const p = withHands({ head: [0.1, 0, 0] }, { left: 'fist' });
  assert.deepEqual(p.head, [0.1, 0, 0]);
  assert.ok(p.leftIndexProximal[2] > 1);
  assert.equal(p.rightIndexProximal, undefined);
  assert.throws(() => withHands({}, { left: 'nope' }));
});

test('mirrorPose swaps sides and negates Y and Z', () => {
  const m = mirrorPose({ leftUpperArm: [0.5, 0.2, 1.2], head: [0.1, 0.3, 0.4] });
  assert.deepEqual(m.rightUpperArm, [0.5, -0.2, -1.2]);
  assert.deepEqual(m.head, [0.1, -0.3, -0.4]);
  assert.deepEqual(mirrorPose(mirrorPose(POSES.guard)), POSES.guard);
});

test('mixPose interpolates and treats missing bones as rest', () => {
  const m = mixPose({ head: [0, 0, 0] }, { head: [1, 0, 0], spine: [0, 2, 0] }, 0.5);
  assert.deepEqual(m.head, [0.5, 0, 0]);
  assert.deepEqual(m.spine, [0, 1, 0]);
  assert.deepEqual(mixPose(POSES.stand, POSES.walk, 0).head, POSES.stand.head);
  assert.deepEqual(mixPose(POSES.stand, POSES.walk, 1).leftUpperLeg, POSES.walk.leftUpperLeg);
});

test('guard raises the fists above the stand pose hands', () => {
  const stand = poseVRM(model, { pose: POSES.stand }).bonePos, guard = poseVRM(model, { pose: POSES.guard }).bonePos;
  assert.ok(guard.leftHand[1] > stand.leftHand[1] + 0.2);
  assert.ok(guard.rightHand[1] > stand.rightHand[1] + 0.2);
});

// Same convention as poseVRM: Rz * Ry * Rx.
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qeuler = ([x, y, z]) => qmul([0, 0, Math.sin(z / 2), Math.cos(z / 2)], qmul([0, Math.sin(y / 2), 0, Math.cos(y / 2)], [Math.sin(x / 2), 0, 0, Math.cos(x / 2)]));

test('mirrorPose on quaternions matches mirroring the Euler angles', () => {
  for (const e of [[0.3, 0.5, 0.7], [-1.1, 0.2, 1.4], [0.9, -0.6, -0.2]]) {
    const got = mirrorPose({ leftHand: qeuler(e) }).rightHand;
    const want = qeuler([e[0], -e[1], -e[2]]);
    const sign = got.reduce((s, v, i) => s + v * want[i], 0) < 0 ? -1 : 1;
    got.forEach((v, i) => assert.ok(Math.abs(sign * v - want[i]) < 1e-9, `${e} component ${i}`));
  }
});

test('mixPose rejects quaternion entries', () => {
  assert.throws(() => mixPose({ head: [0, 0, 0, 1] }, { head: [0, 0, 0] }, 0.5), { message: 'mixPose supports Euler poses only (bone head)' });
  assert.throws(() => mixPose({}, { spine: [0, 0, 0, 1] }, 0.5), { message: 'mixPose supports Euler poses only (bone spine)' });
});
