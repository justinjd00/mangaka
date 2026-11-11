import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../kit/sdf.mjs';
import { makeCam, lightCam, project, rasterSDF, normalsSDF, shadowTerm, ambient } from '../kit/raster.mjs';

const W = 256, H = 256, scale = 200;
const cam = () => makeCam({ yaw: 0, pitch: 0, scale, cx: W / 2, cy: H / 2, W, H, target: [0, 0, 0] });
const ball = () => [S.part('ball', 'm', S.sphere([0, 0, 0], 0.5))];

test('sphere silhouette area, centre depth and centre normal', () => {
  const c = cam(), parts = ball();
  const buf = rasterSDF(parts, c);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (buf.id[i] === 1) n++;
  const ref = Math.PI * 100 * 100;
  assert.ok(Math.abs(n - ref) / ref < 0.02, `pixels ${n} vs ${ref}`);
  const ci = (H / 2) * W + W / 2;
  // depth is the coordinate along cam.fwd, which points at the viewer: larger is nearer
  assert.ok(Math.abs(buf.depth[ci] - 0.5) < 0.01, `depth ${buf.depth[ci]}`);
  assert.equal(buf.id[0], 0);
  const nrm = normalsSDF(parts, c, buf);
  assert.ok(nrm.nz[ci] > 0.99);
  assert.ok(nrm.wn.length === W * H * 3);
});

test('project puts the target at the screen centre and nearer points at larger depth', () => {
  const c = cam();
  const near = project(c, [0, 0, 0.5]), far = project(c, [0, 0, -0.5]);
  assert.ok(near[2] > far[2]);
  assert.deepEqual([near[0], near[1]], [W / 2, H / 2]);
});

test('the nearer part wins regardless of order, ids are 1-based', () => {
  const parts = [S.part('far', 'm', S.sphere([0, 0, -0.6], 0.3)), S.part('near', 'm', S.sphere([0, 0, 0.2], 0.3))];
  const buf = rasterSDF(parts, cam());
  assert.equal(buf.id[(H / 2) * W + W / 2], 2);
  const noPos = rasterSDF(parts, cam(), false);
  assert.equal(noPos.pos, null);
});

test('shadow and ambient terms behave on a sphere on a floor', () => {
  const parts = [
    S.part('ball', 'm', S.sphere([0, 0, 0], 0.4)),
    S.part('floor', 'm', S.box([0, -0.7, 0], [1.2, 0.3, 1.2])),
  ];
  const c = makeCam({ yaw: 0, pitch: 0.5, scale: 120, cx: 128, cy: 128, W: 256, H: 256, target: [0, 0, 0] });
  const buf = rasterSDF(parts, c);
  const lc = lightCam([0.5, -1, 0.3], [0, 0, 0], 120, 256);
  const lbuf = rasterSDF(parts, lc);
  const sh = shadowTerm(buf, lc, lbuf, 0.02);
  const nrm = normalsSDF(parts, c, buf);
  const ao = ambient(buf, nrm, 120, 12, 16, 0.3);
  let lit = 0, dark = 0, aoMin = 1;
  for (let i = 0; i < sh.length; i++) {
    if (!buf.id[i]) { assert.equal(sh[i], 1); continue; }
    if (sh[i] === 1) lit++; else if (sh[i] < 0.5) dark++;
    aoMin = Math.min(aoMin, ao[i]);
  }
  assert.ok(lit > 0 && dark > 0, `lit ${lit} dark ${dark}`);
  assert.ok(aoMin < 1);
});
