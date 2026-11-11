import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import * as S from '../kit/sdf.mjs';
import * as armor from '../kit/parts/armor.mjs';
import * as weapons from '../kit/parts/weapons.mjs';
import * as architecture from '../kit/parts/architecture.mjs';
import * as props from '../kit/parts/props.mjs';
import { alignY } from '../kit/parts/util.mjs';
import { boneFrame, attachTo, toWorld } from '../kit/attach.mjs';
import { loadVRM, poseVRM } from '../kit/vrm.mjs';
import { POSES, withHands } from '../kit/poses.mjs';
import { buildPage } from '../kit/page.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const MODEL = join(ROOT, 'models/shino.vrm');
const model = loadVRM(MODEL);

// Every builder with its default parameters plus a few non-default calls.
const BUILDERS = [
  ...Object.entries({ ...armor, ...weapons, ...architecture, ...props }).map(([name, fn]) => [name, sc => fn(sc, `t.${name}`)]),
  ['sword moved', sc => weapons.sword(sc, 't.sw', { at: [1, 1, 0.5], R: S.mmul(S.rotZ(0.7), S.rotX(-1.2)), blade: 0.9 })],
  ['gauntlet gripping', sc => armor.gauntlet(sc, 't.g', { side: 1, elbow: [0.38, 1.24, -0.05], grip: { at: [0.42, 1.36, 0.15], axis: [0, 1, 0] } })],
  ['column whole', sc => architecture.column(sc, 't.c', { h: 2, broken: false })],
  ['ground slab', sc => architecture.ground(sc, 't.gs', { slab: true, size: [2, 0.1, 2] })],
  ['wall with joints', sc => architecture.wall(sc, 't.w', { from: [0, 0, 0], to: [1, 0, 1], courses: 0.25 })],
  ['railing with bars', sc => architecture.railing(sc, 't.r', { from: [0, 0, 0], to: [3, 0, 0.5], bars: 0.15, rails: 2 })],
  ['cape short', sc => armor.cape(sc, 't.cs', { length: 0.9, sweep: 0.05 })],
  ['poleaxe short', sc => weapons.poleaxe(sc, 't.pa', { length: 1.6, at: [0.3, 0, 0], R: alignY([0.2, 1, 0.1]) })],
];

const DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) DIRS.push([x, y, z]);

test('every builder makes forms whose surface lies inside their bounds', () => {
  for (const [name, build] of BUILDERS) {
    const sc = S.scene();
    build(sc);
    assert.ok(sc.parts.length > 0, `${name}: no parts`);
    for (const p of sc.parts) {
      assert.ok(p.name.startsWith('t.'), `${name}: part ${p.name} is not under its prefix`);
      const [cx, cy, cz, r] = p.sdf.b;
      let hits = 0;
      for (const d of DIRS) {
        const l = Math.hypot(...d), o = [cx + d[0] / l * r * 1.6, cy + d[1] / l * r * 1.6, cz + d[2] / l * r * 1.6];
        const q = S.surf(p.sdf, o, [-d[0], -d[1], -d[2]], r * 3.2);
        if (!q) continue;
        hits++;
        const dist = Math.hypot(q[0] - cx, q[1] - cy, q[2] - cz);
        assert.ok(dist <= r * 1.001 + 5e-4, `${name}: ${p.name} has surface at ${dist.toFixed(4)} from its bound centre, radius ${r.toFixed(4)}`);
      }
      assert.ok(hits > 0, `${name}: no ray reaches ${p.name}`);
    }
  }
});

test('builders are deterministic and name parts uniquely', () => {
  for (const [name, build] of BUILDERS) {
    const a = S.scene(), b = S.scene();
    build(a); build(b);
    assert.deepEqual(a.parts.map(p => [p.name, p.hash]), b.parts.map(p => [p.name, p.hash]), name);
    assert.deepEqual(a.decals, b.decals, name);
    const names = a.parts.map(p => p.name);
    assert.equal(new Set(names).size, names.length, `${name}: duplicate part names`);
  }
});

test('alignY takes +Y to the direction and is a rotation', () => {
  for (const d of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0.3, 0.5, -0.8]]) {
    const R = alignY(d), l = Math.hypot(...d), y = S.mapply(R, [0, 1, 0]);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(y[i] - d[i] / l) < 1e-9);
    const RtR = S.mmul([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], R);
    RtR.forEach((v, i) => assert.ok(Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-9));
  }
});

const handPose = arm => withHands({ ...POSES.stand, ...arm }, { right: 'grip' });

test('boneFrame gives the hand position and an orthonormal rotation', () => {
  const res = poseVRM(model, { pose: POSES.stand, root: { pos: [0.5, 0, -1], yaw: 0.7 } });
  const f = boneFrame(model, res, 'rightHand');
  assert.deepEqual(f.origin, res.bonePos.rightHand);
  const R = f.R, RtR = S.mmul([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], R);
  RtR.forEach((v, i) => assert.ok(Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-6));
  assert.ok(Math.abs(R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]) - 1) < 1e-6);
  // The documented axes: fingers along +X, thumb side -Z, in any pose.
  const local = p => { const d = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]]; return [0, 1, 2].map(c => R[c] * d[0] + R[3 + c] * d[1] + R[6 + c] * d[2]); };
  assert.ok(local(res.bonePos.rightMiddleProximal)[0] > 0.05);
  assert.ok(local(res.bonePos.rightIndexProximal)[2] < local(res.bonePos.rightLittleProximal)[2]);
  assert.throws(() => boneFrame(model, res, 'tail'), /no bone "tail"/);
});

test('attachTo moves a prop with the hand and maps decals and anchors', () => {
  const swordIn = res => {
    const sc = S.scene();
    const frame = boneFrame(model, res, 'rightHand');
    const a = attachTo(sc, frame, local => weapons.sword(local, 'kid.sword', { at: [0.08, -0.03, 0], R: S.rotX(-Math.PI / 2) }));
    return { sc, frame, a };
  };
  const down = poseVRM(model, { pose: handPose({}) });
  const up = poseVRM(model, { pose: handPose({ rightUpperArm: [0, 1.2, -0.2], rightLowerArm: [0, 0.4, 0] }) });
  const A = swordIn(down), B = swordIn(up);
  const moved = Math.hypot(...[0, 1, 2].map(i => up.bonePos.rightHand[i] - down.bonePos.rightHand[i]));
  assert.ok(moved > 0.3, 'the two poses should move the hand');
  for (const { sc, frame, a } of [A, B]) {
    // Anchors come back in world space, and the forms sit on them.
    assert.deepEqual(a.grip, toWorld(frame, [0.08, -0.03, 0]));
    assert.ok(Math.hypot(...[0, 1, 2].map(i => a.grip[i] - frame.origin[i])) < 0.1);
    const blade = sc.parts.find(p => p.name === 'kid.sword.blade').sdf;
    const mid = [0, 1, 2].map(i => (a.guard[i] + a.tip[i]) / 2);
    assert.ok(blade(...mid) < 0, 'the blade passes between guard and tip');
    const line = sc.decals.find(d => d.type === 'line');
    assert.ok(Math.abs(blade(...line.pts[0])) < 0.003, 'decals move with the forms');
  }
  // The grip follows the hand.
  const gripMoved = [0, 1, 2].map(i => B.a.grip[i] - A.a.grip[i]);
  const handMoved = [0, 1, 2].map(i => up.bonePos.rightHand[i] - down.bonePos.rightHand[i]);
  assert.ok(Math.hypot(...gripMoved.map((v, i) => v - handMoved[i])) < 0.15);
  assert.notDeepEqual(A.sc.parts.map(p => p.hash), B.sc.parts.map(p => p.hash));
});

test('a scene function is called with the posed actors, cached and rebuilt when its result changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-scene-fn-'));
  const cacheDir = join(dir, 'cache');
  const calls = [];
  const spec = ({ blade = 0.6, arm = {} } = {}) => ({
    size: [90, 100],
    panels: [{
      id: 'kid', rect: [0, 0, 90, 100],
      actors: [{ name: 'kid', model: relative(dir, MODEL), pose: handPose(arm) }],
      scene: ({ actors }) => {
        calls.push(Object.keys(actors));
        const sc = S.scene();
        attachTo(sc, boneFrame(actors.kid.model, actors.kid.result, 'rightHand'), local => weapons.sword(local, 'kid.sword', { at: [0.08, -0.03, 0], R: S.rotX(-Math.PI / 2), blade }));
        return sc;
      },
      camera: ({ bones }) => ({ scale: 40, target: [bones.kid.hips[0], 0.9, bones.kid.hips[2]] }),
    }],
  });
  const run = s => { let log = null; const out = buildPage(s, { dir, cacheDir, write: false, onPanel: e => { log = e.cached ? 'cached' : e.uncacheable ? e.uncacheable : 'built'; } }); return { out, log }; };
  try {
    const one = run(spec()), two = run(spec());
    assert.deepEqual([one.log, two.log], ['built', 'cached']);
    assert.equal(two.out.svg, one.out.svg);
    assert.ok(one.out.map.panels[0].parts.includes('kid.sword.blade'));
    assert.deepEqual(calls[0], ['kid']);
    assert.equal(run(spec({ blade: 0.4 })).log, 'built');
    const bent = { arm: { rightLowerArm: [0, 1.2, 0] } };
    assert.equal(run(spec(bent)).log, 'built');
    assert.equal(run(spec(bent)).log, 'cached');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
