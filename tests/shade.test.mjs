import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../kit/sdf.mjs';
import { renderPanel } from '../kit/shade.mjs';
import { toneOf, MATERIALS } from '../kit/materials.mjs';
import { flat, gradient, split, storm, focusLines, speedLines, scaled } from '../kit/backgrounds.mjs';
import { loadVRM, poseVRM } from '../kit/vrm.mjs';
import { POSES } from '../kit/poses.mjs';
import { project } from '../kit/raster.mjs';

const model = loadVRM(new URL('../models/fumiriya.vrm', import.meta.url).pathname);
const { posed } = poseVRM(model, { pose: POSES.stand });
const ctx = over => ({ lam: 0.5, fill: 0.2, rim: 0.1, nz: 0.8, ao: 1, spec: 0, lum: 0.8, wy: 0.2, skinMean: 0.8, hairMean: 0.5, ...over });

test('every material gives a tone in [0, 1] and less light is darker', () => {
  for (const m of Object.keys(MATERIALS)) {
    const lit = toneOf(m, ctx({ lam: 1 })), dark = toneOf(m, ctx({ lam: 0, fill: 0, ao: 0.5 }));
    for (const v of [lit, dark]) assert.ok(v >= 0 && v <= 1, `${m}: ${v}`);
    if (m !== 'tex') assert.ok(dark >= lit, `${m}: ${dark} < ${lit}`);
  }
  assert.throws(() => toneOf('glass', ctx()), /unknown material "glass"/);
});

test('black hair sets aux on its shine band; light hair is lighter', () => {
  const c = ctx({ lam: 1, wy: 0.45 });
  const black = toneOf('hairB', c);
  assert.ok(c.aux > 0.5);
  const light = toneOf('hairB', ctx({ lam: 1, wy: 0.9, hair: 'light' }));
  assert.ok(light < toneOf('hairB', ctx({ lam: 1, wy: 0.9 })));
  assert.ok(black >= 0);
});

test('backgrounds are pure, in range and describe themselves', () => {
  const fns = [flat(0.3), gradient(0, 1), split(0.5, 0.2, 0.9), storm({ moon: [100, 80, 50], seed: 'a' }), storm({ seed: 'a' }),
    focusLines({ cx: 100, cy: 100, r0: 40, seed: 'f' }), speedLines({ angle: -0.5, seed: 's' })];
  for (const f of fns) {
    assert.ok(f.desc && f.desc.kind);
    for (const [x, y] of [[0, 0], [37, 151], [199, 99], [120, 20]]) {
      const v = f(x, y, 200, 160);
      assert.ok(v >= 0 && v <= 1, `${f.desc.kind} ${v}`);
      assert.equal(f(x, y, 200, 160), v);
    }
  }
  assert.equal(gradient(0, 1)(5, 0, 10, 11), 0);
  assert.equal(split(0.5, 0.2, 0.9)(9, 0, 10, 10), 0.9);
  const s = storm({ moon: [100, 80, 50], seed: 'a' });
  assert.equal(scaled(s, 2)(60, 40, 400, 320), s(30, 20, 200, 160));
  assert.equal(scaled(s, 2).desc.ss, 2);
  assert.notEqual(storm({ seed: 'a' })(31, 17), storm({ seed: 'b' })(31, 17));
  // Focus lines leave the centre clear and reach the corners.
  const f = focusLines({ cx: 100, cy: 100, r0: 40, count: 60, density: 1, seed: 'f' });
  assert.equal(f(100, 100), 0);
  let hits = 0;
  for (let a = 0; a < 360; a++) hits += f(100 + 95 * Math.cos(a * Math.PI / 180), 100 + 95 * Math.sin(a * Math.PI / 180));
  assert.ok(hits > 30, `hits ${hits}`);
});

test('renderPanel merges forms and an actor; the actor shadows the ground', () => {
  const sc = S.scene();
  sc.add('ground', 'ground', S.box([0, -0.05, 0], [1.6, 0.05, 1.6]));
  const W = 240, H = 240;
  const r = renderPanel({
    scene: sc, actors: [{ name: 'kid', model, posed }], background: flat(0),
    cam: { yaw: 0, pitch: 0.45, scale: 95, cx: W / 2, cy: H / 2 + 20, W, H, target: [0, 0.6, 0] },
  });
  assert.equal(r.W, W);
  assert.equal(r.parts[0].name, 'ground');
  assert.ok(r.parts.some(p => p.name === 'kid.skin' && p.mat === 'skin' && p.cls === 'skin'));
  assert.ok(r.parts.some(p => p.name.startsWith('kid.hair.') && p.mat === 'hairB'));
  const ids = new Set(r.buf.id);
  assert.ok(ids.has(1) && [...ids].some(i => i > 1));
  // Background pixels take the background tone.
  assert.equal(r.D[0], 0);

  // Ground tone at a point: mean over a small window, ground pixels only.
  const toneAt = p => {
    const [sx, sy] = project(r.cam, p);
    let s = 0, n = 0;
    for (let y = Math.round(sy) - 3; y <= Math.round(sy) + 3; y++) for (let x = Math.round(sx) - 3; x <= Math.round(sx) + 3; x++) {
      const i = y * W + x;
      if (r.buf.id[i] === 1) { s += r.D[i]; n++; }
    }
    assert.ok(n > 10, `ground visible at ${p}`);
    return s / n;
  };
  // The default light comes from (-x, +y, +z): the body's shadow falls towards +x, -z.
  const shadowed = toneAt([0.45, 0, -0.4]), open = toneAt([-0.45, 0, -0.4]);
  assert.ok(shadowed > open + 0.15, `shadow ${shadowed} vs open ${open}`);
});

test('renderPanel rejects unknown materials and unnamed actors', () => {
  const sc = S.scene();
  sc.add('x', 'glass', S.sphere([0, 0, 0], 0.3));
  const cam = { scale: 100, cx: 20, cy: 20, W: 40, H: 40 };
  assert.throws(() => renderPanel({ scene: sc, cam }), /part "x": unknown material "glass"/);
  assert.throws(() => renderPanel({ actors: [{ model, posed }], cam }), /missing name/);
});
