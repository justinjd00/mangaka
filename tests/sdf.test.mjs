import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../kit/sdf.mjs';

const { hypot } = Math;
const raw0 = (x, y, z) => hypot(x, y, z) - 0.2;

const prims = {
  sphere: () => S.sphere([0.1, 0.2, 0.3], 0.4),
  ellipsoid: () => S.ellipsoid([0.1, 0.2, 0.3], [0.4, 0.3, 0.5]),
  rcone: () => S.rcone([0, 0, 0], [0, 1, 0], 0.3, 0.1),
  cyl: () => S.cyl([0, 0, 0], [0, 1, 0], 0.3),
  ccone: () => S.ccone([0, 0, 0], [0, 1, 0], 0.3, 0.1),
  box: () => S.box([0, 0, 0], [0.3, 0.2, 0.4], 0.05),
  union: () => S.union(S.sphere([0, 0, 0], 0.3), S.sphere([0.4, 0, 0], 0.3)),
  smin: () => S.smin(0.1, S.sphere([0, 0, 0], 0.3), S.sphere([0.4, 0, 0], 0.3)),
  round: () => S.round(S.box([0, 0, 0], [0.3, 0.3, 0.3]), 0.05),
  xform: () => S.xform(S.box([0.2, 0, 0], [0.3, 0.1, 0.1]), [0, 0, 0], S.rotZ(0.7)),
  squash: () => S.squash(S.sphere([0, 0, 0], 0.3), [0, 0, 0], [1, 0.5, 1.2]),
  mirrorX: () => S.mirrorX(S.sphere([0.3, 0, 0], 0.2)),
  raw: () => S.raw(raw0, [0, 0, 0, 0.2], 0.6, 'ball'),
  disp: () => S.disp(S.sphere([0, 0, 0], 0.3), () => 0, 0.01, 0.5, 'flat'),
};
// Solid forms: centre of mass inside, far outside.
const centre = {
  sphere: [0.1, 0.2, 0.3], ellipsoid: [0.1, 0.2, 0.3], rcone: [0, 0.2, 0], cyl: [0, 0.5, 0], ccone: [0, 0.2, 0],
  box: [0, 0, 0], union: [0, 0, 0], smin: [0.2, 0, 0], round: [0, 0, 0], xform: [0.2 * Math.cos(0.7), 0.2 * Math.sin(0.7), 0],
  squash: [0, 0, 0], mirrorX: [0.3, 0, 0], raw: [0, 0, 0], disp: [0, 0, 0],
};

for (const [name, make] of Object.entries(prims)) {
  test(`${name}: negative inside, positive far away, carries b/st/desc`, () => {
    const f = make();
    assert.ok(f(...centre[name]) < 0, 'inside');
    assert.ok(f(9, 9, 9) > 0, 'far');
    assert.equal(f.b.length, 4);
    assert.ok(f.st > 0 && f.st <= 1);
    assert.equal(typeof f.desc.op, 'string');
    assert.ok(Array.isArray(f.desc.args));
  });
}

test('sub, inter, ssub, shell', () => {
  const a = S.sphere([0, 0, 0], 0.5), b = S.sphere([0.5, 0, 0], 0.3);
  assert.ok(S.sub(a, b)(0.45, 0, 0) > 0);
  assert.ok(S.sub(a, b)(-0.2, 0, 0) < 0);
  assert.ok(S.inter(a, b)(0.3, 0, 0) < 0);
  assert.ok(S.inter(a, b)(-0.3, 0, 0) > 0);
  assert.ok(S.ssub(0.05, a, b)(-0.2, 0, 0) < 0);
  assert.ok(S.ssub(0.05, a, b)(0.5, 0, 0) > 0);
  const sh = S.shell(a, 0.02);
  assert.ok(sh(0, 0, 0) > 0);
  assert.ok(sh(0.5, 0, 0) < 0);
});

test('surf samples from 64 directions (through an interior point) land inside .b', () => {
  const forms = Object.values(prims).map(m => m());
  for (const f of forms) {
    const [cx, cy, cz, r] = f.b;
    const c = centre[Object.keys(prims)[forms.indexOf(f)]];
    for (let i = 0; i < 64; i++) {
      const z = 1 - 2 * (i + 0.5) / 64, rr = Math.sqrt(1 - z * z), a = i * 2.399963;
      const d = [rr * Math.cos(a), rr * Math.sin(a), z];
      const o = [c[0] - d[0] * (r + 1), c[1] - d[1] * (r + 1), c[2] - d[2] * (r + 1)];
      const p = S.surf(f, o, d, 2 * r + 3);
      assert.ok(p, 'ray through an interior point hits a solid form');
      assert.ok(hypot(p[0] - cx, p[1] - cy, p[2] - cz) <= r + 1e-3, 'hit inside the bounding sphere');
    }
  }
});

test('surf misses return null', () => {
  assert.equal(S.surf(S.sphere([0, 0, 0], 0.1), [5, 5, 5], [1, 0, 0]), null);
});

test('noise3 is a pure hash noise in [0,1]', () => {
  assert.equal(S.noise3(1.3, 2.7, -0.4), S.noise3(1.3, 2.7, -0.4));
  for (let i = 0; i < 100; i++) { const v = S.noise3(i * 0.37, i * 0.11, i * 0.53); assert.ok(v >= 0 && v <= 1); }
  assert.ok(S.fbm(1, 2, 3) >= 0);
});

test('hashForm: equal for equal construction, changes with one number', () => {
  const mkf = r => S.smin(0.1, S.sphere([0, 0, 0], r), S.cyl([0, 0, 0], [0, 1, 0], 0.2));
  assert.match(S.hashForm(mkf(0.3)), /^[0-9a-f]{8}$/);
  assert.equal(S.hashForm(mkf(0.3)), S.hashForm(mkf(0.3)));
  assert.notEqual(S.hashForm(mkf(0.3)), S.hashForm(mkf(0.31)));
  assert.notEqual(S.hashForm(S.raw(raw0, [0, 0, 0, 0.2], 0.6, 'a')), S.hashForm(S.raw(raw0, [0, 0, 0, 0.2], 0.6, 'b')));
});

test('raw and disp require a tag', () => {
  assert.throws(() => S.raw(raw0, [0, 0, 0, 1], 0.6), /tag/);
  assert.throws(() => S.disp(S.sphere([0, 0, 0], 1), () => 0, 0.1, 0.6), /tag/);
});

test('part and scene collect parts and decals', () => {
  const sc = S.scene();
  const ball = sc.add('ball', 'metal', S.sphere([0, 0, 0], 0.5), { layer: 2 });
  assert.equal(sc.parts[0].name, 'ball');
  assert.equal(sc.parts[0].layer, 2);
  assert.equal(sc.parts[0].hash, S.hashForm(ball));
  assert.equal(sc.parts[0].sdf, ball);
  sc.rivet(ball, [0, 0, 2], [0, 0, -1], 0.01);
  sc.hole(ball, [0, 0, 2], [0, 0, -1], 0.02);
  sc.rivet(ball, [5, 5, 5], [1, 0, 0], 0.01); // miss: nothing recorded
  sc.line([[0, 0, 0], [1, 1, 1]], { w: 2, ko: true });
  sc.lineOn(ball, [[0, 0, 2], [3, 3, 3]], [0, 0, -1], { w: 1 });
  sc.poly([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { closed: true, fill: '#000', stroke: null, sw: 1 });
  sc.strand([[0, 0, 0], [1, 0, 0]], { thr: 0.4 });
  const types = sc.decals.map(d => d.type);
  assert.deepEqual(types, ['rivet', 'hole', 'line', 'line', 'poly', 'strand']);
  assert.ok(Math.abs(sc.decals[0].p[2] - 0.5) < 1e-3);
  assert.equal(sc.decals[0].r, 0.01);
  assert.equal(sc.decals[2].ko, true);
  assert.equal(sc.decals[3].pts[1], null);
  assert.ok(sc.decals[3].pts[0]);
  assert.equal(sc.decals[5].thr, 0.4);
});

test('raw wraps the closure so forms built from one function stay independent', () => {
  const a = S.raw(raw0, [0, 0, 0, 0.2], 0.6, 'a');
  const b = S.raw(raw0, [1, 1, 1, 0.5], 0.4, 'b');
  assert.notEqual(a, b);
  assert.deepEqual(a.b, [0, 0, 0, 0.2]);
  assert.equal(a.st, 0.6);
  assert.equal(a.desc.tag, 'a');
  assert.deepEqual(b.b, [1, 1, 1, 0.5]);
  assert.equal(b.desc.tag, 'b');
  assert.notEqual(S.hashForm(a), S.hashForm(b));
  assert.equal(a(0, 0, 0), raw0(0, 0, 0));
});
