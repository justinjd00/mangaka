import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import * as S from '../kit/sdf.mjs';
import { definePage, buildPage, decodeMap } from '../kit/page.mjs';
import { gradient, speedLines } from '../kit/backgrounds.mjs';
import { rain, snow, spatter } from '../kit/effects.mjs';
import { caption, bubble, sfx } from '../kit/lettering.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

const ballScene = () => {
  const sc = S.scene();
  sc.add('ground', 'ground', S.box([0, -0.05, 0], [1.2, 0.05, 1.2]));
  sc.add('ball', 'metal', S.sphere([0, 0.4, 0], 0.35));
  sc.rivet(sc.parts[1].sdf, [0, 0.4, 2], [0, 0, -1]);
  return sc;
};
const smallPage = () => ({
  size: [260, 200],
  panels: [
    { id: 'a', rect: [6, 6, 150, 101], ss: 1.5, scene: ballScene(), camera: { yaw: 0.2, pitch: 0.3, scale: 90, target: [0, 0.3, 0] },
      background: gradient(0.3, 0.7), effects: [rain({ density: 1 })] },
    { id: 'b', rect: [162, 6, 92, 101], scene: ballScene(), camera: { scale: 120, target: [0, 0.4, 0] },
      background: speedLines({ angle: 0.4 }), effects: [snow({ density: 2 }), spatter({ at: [0.5, 0.5], count: 10, radius: 20 })] },
    { id: 'c', rect: [190, 120, 60, 70], inset: true, scene: ballScene(), camera: { scale: 60, target: [0, 0.4, 0] } },
  ],
  lettering: [
    caption({ panel: 'a', text: 'It began here.', at: [0.04, 0.04] }),
    bubble({ panel: 'b', kind: 'shout', text: 'Now!', at: [0.5, 0.3], tail: [0.5, 0.8] }),
    sfx({ text: 'Bam', at: [0.1, 0.9], rotate: -10, size: 30 }),
  ],
});

let cached = null;
const built = () => (cached ??= buildPage(smallPage()));

test('definePage validates and names the panel and field', () => {
  const p = smallPage();
  const out = definePage(p);
  assert.equal(out.reading, 'rtl');
  assert.equal(out.panels[1].ss, 1);
  assert.equal(out.panels[0].frame, 4.5);
  assert.equal(out.panels[2].gutter, 7);
  assert.equal(out.panels[0].gutter, 0);
  const bad = (edit, re) => { const q = smallPage(); edit(q); assert.throws(() => definePage(q), re); };
  bad(q => { delete q.panels[1].rect; }, /panel "b": missing rect/);
  bad(q => { q.panels[1].rect = [0, 0, -5, 10]; }, /panel "b": rect/);
  bad(q => { q.panels[1].id = 'a'; }, /panel "a": duplicate id/);
  bad(q => { q.panels[0].camera = {}; }, /panel "a": camera.scale/);
  bad(q => { q.panels[0].actors = [{ name: 'kid', model: 'x.vrm', pose: 'moonwalk' }]; }, /panel "a": actor "kid": unknown pose "moonwalk"/);
  bad(q => { q.panels[0].ss = 0; }, /panel "a": ss/);
  bad(q => { q.reading = 'up'; }, /reading/);
  bad(q => { q.lettering[0].panel = 'zz'; }, /lettering\[0\]: unknown panel "zz"/);
  bad(q => { q.size = [10]; }, /size/);
});

test('buildPage is deterministic and writes four files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-page-'));
  try {
    const one = buildPage(smallPage(), { dir });
    const two = built();
    assert.equal(one.svg, two.svg);
    assert.equal(one.html, two.html);
    assert.deepEqual(one.map, two.map);
    assert.deepEqual(one.stats, two.stats);
    assert.equal(readFileSync(join(dir, 'page.svg'), 'utf8'), one.svg);
    assert.ok(readFileSync(join(dir, 'page.html'), 'utf8').startsWith('<!doctype html>'));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'page.map.json'), 'utf8')), one.map);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'page.stats.json'), 'utf8')), one.stats);

    const svg = one.svg;
    // Panel ids prefix every id; fonts are embedded once each.
    for (const m of svg.matchAll(/ id="([^"]+)"/g)) assert.match(m[1], /^(a|b|c|page)(-|$)/);
    assert.equal(svg.match(/@font-face/g).length, 2);
    // Inset after the other panels, lettering last, frame after the ink of its panel.
    assert.ok(svg.indexOf('<g id="c"') > svg.indexOf('<g id="b"'));
    assert.ok(svg.indexOf('class="mk-l"') > svg.indexOf('<g id="c"'));
    const a = svg.slice(svg.indexOf('<g id="a"'), svg.indexOf('<g id="b"'));
    // Layer order inside a panel: hatch, rivets, effects (rain), then the frame on top.
    const order = ['stroke-width="0.54"', '<g fill="#fff" stroke-width="0.9">', 'stroke="#fff" stroke-width="1.15"', 'stroke-width="4.5"'];
    const at = order.map(s => a.indexOf(s));
    assert.ok(at.every(i => i >= 0), JSON.stringify(at));
    assert.deepEqual([...at].sort((x, y) => x - y), at);
    assert.ok(a.lastIndexOf('<rect') > a.indexOf('clip-path="url(#a-clip)"'), 'frame after the clipped ink');
    assert.ok(Buffer.byteLength(svg) === one.stats.svgBytes);

    // Stats shares add up and count strokes per layer.
    for (const p of one.stats.panels) {
      assert.ok(Math.abs(p.black + p.tone + p.white - 1) < 1e-3, p.id);
      assert.ok(p.strokes.effects > 0 || p.id === 'c', p.id);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('map rle decodes to half-resolution panel pixels with valid part ids', () => {
  const { map } = built();
  assert.deepEqual(map.size, [260, 200]);
  for (const p of map.panels) {
    const ids = decodeMap(p.rle);
    assert.equal(ids.length, Math.ceil(p.rect[2] / 2) * Math.ceil(p.rect[3] / 2), p.id);
    assert.ok(ids.every(v => v >= 0 && v <= p.parts.length));
    assert.deepEqual(p.parts, ['ground', 'ball']);
    assert.ok(ids.includes(2) && ids.includes(0));
    assert.ok(p.camera.scale > 0 && p.camera.cx === p.rect[2] / 2);
  }
});

test('actors: models load relative to dir, poses by name, cameras and tails follow bones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-actor-'));
  const spec = {
    size: [200, 150],
    panels: [{ id: 'kid', rect: [0, 0, 120, 150], actors: [{ name: 'kid', model: relative(dir, join(ROOT, 'models/fumiriya.vrm')), pose: 'stand', hands: { left: 'fist' } }],
      camera: ({ bones }) => ({ scale: 80, target: [bones.kid.hips[0], 0.85, bones.kid.hips[2]] }) }],
    lettering: [bubble({ panel: 'kid', text: 'Hi', at: [0.8, 0.15], tail: { actor: 'kid', bone: 'head' } })],
  };
  let out;
  try { out = buildPage(spec, { dir }); } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.ok(out.map.panels[0].parts.some(n => n === 'kid.skin'));
  assert.ok(out.stats.panels[0].black > 0);
  spec.panels[0].actors[0].model = join(ROOT, 'models/fumiriya.vrm');
  assert.throws(() => buildPage({ ...spec, lettering: [bubble({ panel: 'kid', text: 'x', at: [0.5, 0.5], tail: { actor: 'kid', bone: 'tail' } })] }), /no bone "tail" on actor "kid"/);
});

test('effects are deterministic, seeded by the panel and local to their cells', () => {
  const r = rain({ density: 1 });
  assert.deepEqual(r.layers(300, 200, { seed: 'p1' }), r.layers(300, 200, { seed: 'p1' }));
  assert.notDeepEqual(r.layers(300, 200, { seed: 'p1' }), r.layers(300, 200, { seed: 'p2' }));
  assert.deepEqual(rain({ seed: 'x' }).layers(300, 200, { seed: 'p1' }), rain({ seed: 'x' }).layers(300, 200, { seed: 'p2' }));
  // Growing the panel keeps every streak already there.
  const small = r.layers(192, 192, { seed: 'p' }), big = r.layers(384, 384, { seed: 'p' });
  for (let i = 0; i < 2; i++) for (const m of small[i].d.match(/M[^M]+/g)) assert.ok(big[i].d.includes(m), m);
  for (const e of [snow({ seed: 's' }), spatter({ at: [0.3, 0.6], seed: 's' })]) {
    const l = e.layers(200, 150);
    assert.deepEqual(l, e.layers(200, 150));
    assert.ok(l[0].d.length > 0 && /^M[-\d.]/.test(l[0].d));
  }
});
