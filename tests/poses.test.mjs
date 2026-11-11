import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVRM, poseVRM } from '../kit/vrm.mjs';
import { HANDS, POSES, withHands, mirrorPose, mixPose } from '../kit/poses.mjs';

const model = loadVRM(new URL('../models/fumiriya.vrm', import.meta.url).pathname);

test('library has the documented names', () => {
  assert.deepEqual(Object.keys(HANDS), ['open', 'relaxed', 'fist', 'point', 'grip']);
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
