import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../kit/sdf.mjs';
import { renderPanel } from '../kit/shade.mjs';
import { inkPanel } from '../kit/ink.mjs';
import { gradient } from '../kit/backgrounds.mjs';

// Two spheres 400 px apart on a graded sky.
const W = 600, H = 240;
const cam = { yaw: 0, pitch: 0, scale: 200, cx: W / 2, cy: H / 2, W, H, target: [0, 0, 0] };
const twoBalls = leftR => {
  const sc = S.scene();
  sc.add('left', 'cloth', S.sphere([-1, 0, 0], leftR));
  sc.add('right', 'metal', S.sphere([1, 0, 0], 0.4));
  sc.rivet(sc.parts[1].sdf, [1, 0, 2], [0, 0, -1]);
  return sc;
};
const render = leftR => renderPanel({ scene: twoBalls(leftR), cam, background: gradient(0.35, 0.75), light: { target: [0, 0, 0] } });
const base = render(0.4);

// Every layer as a flat list of [name, string] (shapes and circles serialised).
const layers = k => {
  const out = {
    tone1: k.tone1, tone2: k.tone2, blacks: k.blacks, thin: k.hatch[0], mid: k.hatch[1], core: k.hatch[2],
    mail: k.mail, dots: k.dots, brush: k.brush,
    ko: k.decals.ko, lines: k.decals.lines.flat(), shapes: k.decals.shapes.map(s => JSON.stringify(s)),
    strandsWhite: k.decals.strandsWhite, strandsBlack: k.decals.strandsBlack,
    rivets: k.decals.rivets.map(c => JSON.stringify(c)), holes: k.decals.holes.map(c => JSON.stringify(c)),
  };
  return out;
};
// Bounding box of a path: absolute M/L pairs; for relative commands only the first point (grown by 6 px).
const bbox = s => {
  if (s.startsWith('[')) { const [x, y, r] = JSON.parse(s); return [x - r, y - r, x + r, y + r]; }
  if (s.startsWith('{')) s = JSON.parse(s).d;
  const relative = /[a-z]/.test(s);
  const nums = s.match(/-?\d+(\.\d+)?/g).map(Number);
  const pts = relative ? nums.slice(0, 2) : nums;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  return relative ? [x0 - 6, y0 - 6, x1 + 6, y1 + 6] : [x0, y0, x1, y1];
};
const changed = (a, b) => {
  const out = [];
  const la = layers(a), lb = layers(b);
  for (const name of Object.keys(la)) {
    const sa = new Set(la[name]), sb = new Set(lb[name]);
    for (const s of sa) if (!sb.has(s)) out.push([name, s]);
    for (const s of sb) if (!sa.has(s)) out.push([name, s]);
  }
  return out;
};

test('inkPanel is deterministic and every layer is filled', () => {
  const a = inkPanel(base, { style: 'seinen-dense', seed: 'p1' });
  const b = inkPanel(base, { style: 'seinen-dense', seed: 'p1' });
  assert.deepEqual(a, b);
  for (const name of ['blacks', 'thin', 'mid', 'core', 'brush', 'rivets']) assert.ok(layers(a)[name].length > 0, name);
  for (const s of a.brush) assert.match(s, /^M[-\d. L]+Z$/);
});

test('the seed changes the hatching', () => {
  const a = inkPanel(base, { style: 'seinen-dense', seed: 'p1' });
  const b = inkPanel(base, { style: 'seinen-dense', seed: 'p2' });
  assert.notDeepEqual(a.hatch[0], b.hatch[0]);
  assert.deepEqual(a.blacks, b.blacks);
});

test('locality: changing the left sphere leaves the right third unchanged', () => {
  const other = render(0.45);
  const a = inkPanel(base, { style: 'seinen-dense', seed: 'p1' });
  const b = inkPanel(other, { style: 'seinen-dense', seed: 'p1' });
  const right = changed(a, b).filter(([, s]) => bbox(s)[0] >= W * 2 / 3);
  assert.deepEqual(right, []);
  // The change is real on the left.
  assert.ok(changed(a, b).some(([, s]) => bbox(s)[2] < W / 3));
  // And the right third carries ink worth comparing.
  assert.ok(a.hatch[0].filter(s => bbox(s)[0] >= W * 2 / 3).length > 50);
});

test('switching style changes at least one layer', () => {
  const a = layers(inkPanel(base, { style: 'seinen-dense', seed: 'p1' }));
  for (const style of ['shonen-clean', 'tone-soft']) {
    const b = layers(inkPanel(base, { style, seed: 'p1' }));
    assert.ok(Object.keys(a).some(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])), style);
  }
});

test('a region override changes only paths near the region', () => {
  const rect = [440, 60, 80, 80];
  const a = inkPanel(base, { style: 'seinen-dense', seed: 'p1' });
  const b = inkPanel(base, { style: 'seinen-dense', seed: 'p1', regions: [{ rect, feather: 10, set: { black: 0.5, hatch: 2, brush: 1.6, tone1: 0.1 } }] });
  const diff = changed(a, b);
  assert.ok(diff.length > 0);
  const g = [rect[0] - 40, rect[1] - 40, rect[0] + rect[2] + 40, rect[1] + rect[3] + 40];
  const far = diff.filter(([, s]) => { const [x0, y0, x1, y1] = bbox(s); return x1 < g[0] || x0 > g[2] || y1 < g[1] || y0 > g[3]; });
  assert.deepEqual(far, []);
});

test('hatch 0 in a region removes the hatching there', () => {
  const rect = [0, 0, W, H];
  const k = inkPanel(base, { style: 'seinen-dense', seed: 'p1', regions: [{ rect, feather: 0, set: { hatch: 0 } }] });
  assert.equal(k.hatch[0].length, 0);
});

test('ss scales stroke weights and spacing', () => {
  const a = inkPanel(base, { style: 'seinen-dense', seed: 'p1' });
  const b = inkPanel(base, { style: 'seinen-dense', seed: 'p1', ss: 2 });
  assert.ok(b.hatch[0].length < a.hatch[0].length * 0.75, `${b.hatch[0].length} vs ${a.hatch[0].length}`);
});

test('inkPanel requires a string seed', () => {
  assert.throws(() => inkPanel(base, { style: 'seinen-dense' }), /seed/);
});
