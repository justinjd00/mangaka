import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../kit/sdf.mjs';
import { renderPanel } from '../kit/shade.mjs';
import { inkPanel } from '../kit/ink.mjs';
import { gradient } from '../kit/backgrounds.mjs';
import { encoder } from '../kit/ink.mjs';

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
// Bounding box of a path in the compact format: absolute M, then relative l deltas.
// Mail (q) and dots (h/v) use their first point grown by 8 px.
const NUM = /-?(?:\d+(?:\.\d*)?|\.\d+)/g;
const bbox = s => {
  if (s.startsWith('[')) { const [x, y, r] = JSON.parse(s); return [x - r, y - r, x + r, y + r]; }
  if (s.startsWith('{')) s = JSON.parse(s).d;
  const n = s.match(NUM).map(Number);
  let x = n[0], y = n[1];
  if (/[qhv]/.test(s)) return [x - 8, y - 8, x + 8, y + 8];
  let x0 = x, y0 = y, x1 = x, y1 = y;
  for (let i = 2; i + 1 < n.length; i += 2) {
    x += n[i]; y += n[i + 1];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
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

// Strict compact format: no leading zeros, no trailing ".0", no "-0".
const N = String.raw`-?(?:(?:0|[1-9]\d*)(?:\.[1-9])?|\.[1-9])`;
const SEP = String.raw`(?: |(?=-))`;
const PATH = new RegExp(String.raw`^M${N}${SEP}${N}(?:l${N}(?:${SEP}${N})*)?z?$`);
const MAIL = new RegExp(String.raw`^M${N} ${N}q${N}${SEP}${N} ${N} 0$`);
const DOT = new RegExp(String.raw`^M${N} ${N}h${N}v${N}h-${N}z$`);

test('encoder: relative deltas from rounded positions, shortest numbers', () => {
  const e1 = encoder(1), e2 = encoder(1.5);
  assert.equal(e1.path([0.04, 10, 1.26, 10.5, 2.5, 9.96]), 'M0 10l1.3 .5 1.2-.5');
  assert.equal(e2.path([0.4, 10, 1.6, 10.5, 2.5, 9.6, 2.6, 9.6], true), 'M0 10l2 1 1-1z');
  assert.equal(e2.path([3.2, 4.4, 3.4, 4.1]), 'M3 4');
  // Long chains do not drift: the end point is the rounded absolute end.
  const pts = [];
  for (let i = 0; i <= 200; i++) pts.push(i * 1.37, i * 0.73);
  const n = e1.path(pts).match(NUM).map(Number);
  let x = 0, y = 0;
  for (let i = 0; i < n.length; i += 2) { x += n[i]; y += n[i + 1]; }
  assert.ok(Math.abs(x - 274) < 1e-6 && Math.abs(y - 146) < 1e-6, `${x} ${y}`);
});

test('every path is in the compact format and hatch stays cheap per stroke', () => {
  for (const ss of [1, 1.5]) {
    const k = inkPanel(base, { style: 'seinen-dense', seed: 'p1', ss });
    const L = layers(k);
    let total = 0;
    for (const [name, list] of Object.entries(L)) for (const s of list) {
      total += s.length;
      if (name === 'rivets' || name === 'holes') continue;
      const d = name === 'shapes' ? JSON.parse(s).d : s;
      const re = name === 'mail' ? MAIL : name === 'dots' ? DOT : PATH;
      assert.match(d, re, `${name} at ss ${ss}`);
    }
    // All ink bytes per hatch stroke. Measured on this panel: 42.3 at ss 1 (one decimal),
    // 27.3 at ss 1.5 (integers); bounds leave about 25% headroom.
    const per = total / k.hatch[0].length;
    assert.ok(per < (ss === 1 ? 53 : 34), `ss ${ss}: ${per.toFixed(1)} bytes per hatch stroke`);
  }
});

test('brush outlines are local: splitting an outline at one end leaves its far part in place', async () => {
  const { pathPoints } = await import('../scripts/diff.mjs');
  // One long ellipsoid whose outline runs across the panel; a black region cuts it near the left end.
  const sc = S.scene();
  sc.add('bar', 'cloth', S.ellipsoid([0, 0, 0], [1.35, 0.3, 0.3]));
  const r = renderPanel({ scene: sc, cam, background: gradient(0.35, 0.75), light: { target: [0, 0, 0] } });
  // Wide brushes everywhere, so a change of pressure profile shows well above rounding.
  const wide = { rect: [0, 0, W, H], set: { brush: 4 } };
  const rect = [60, 60, 40, 60];
  const a = inkPanel(r, { style: 'seinen-dense', seed: 'p1', regions: [wide] });
  const b = inkPanel(r, { style: 'seinen-dense', seed: 'p1', regions: [wide, { rect, feather: 6, set: { black: 0.02 } }] });
  const far = rect[0] + rect[2] + 40;
  // The cut really splits an outline that reaches far past the region.
  const cut = b.brush.filter(d => !a.brush.includes(d)).map(pathPoints);
  assert.ok(cut.some(p => p.some(q => q[0] < rect[0] + rect[2] + 10) && p.some(q => q[0] > far + 60)), 'an edited outline spans the far side');
  // Every far vertex of either version lies on the other version's outlines (within 0.3 buffer px).
  const segs = ds => ds.map(pathPoints).flatMap(p => p.map((q, i) => [q, p[(i + 1) % p.length]]));
  const dist = (q, [u, v]) => {
    const dx = v[0] - u[0], dy = v[1] - u[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((q[0] - u[0]) * dx + (q[1] - u[1]) * dy) / l2)) : 0;
    return Math.hypot(q[0] - u[0] - t * dx, q[1] - u[1] - t * dy);
  };
  const off = (from, to) => {
    const sg = segs(to);
    let worst = 0, n = 0;
    for (const p of from.map(pathPoints)) for (const q of p) {
      if (q[0] < far) continue;
      n++;
      worst = Math.max(worst, Math.min(...sg.map(s => dist(q, s))));
    }
    assert.ok(n > 100, 'the far side carries outline vertices');
    return worst;
  };
  assert.ok(off(b.brush, a.brush) < 0.3, `far outline moved by ${off(b.brush, a.brush)}`);
  assert.ok(off(a.brush, b.brush) < 0.3, `far outline moved by ${off(a.brush, b.brush)}`);
});
