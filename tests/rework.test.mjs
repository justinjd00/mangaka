import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import * as S from '../kit/sdf.mjs';
import { buildPage } from '../kit/page.mjs';
import { gradient, flat } from '../kit/backgrounds.mjs';
import { rain } from '../kit/effects.mjs';
import { caption, bubble } from '../kit/lettering.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

const ballScene = (r = 0.35) => {
  const sc = S.scene();
  sc.add('ground', 'ground', S.box([0, -0.05, 0], [1.2, 0.05, 1.2]));
  sc.add('ball', 'metal', S.sphere([0, 0.4, 0], r));
  return sc;
};
const page = () => ({
  size: [240, 120],
  panels: [
    { id: 'a', rect: [4, 4, 110, 112], scene: ballScene(), camera: { yaw: 0.2, pitch: 0.3, scale: 90, target: [0, 0.3, 0] },
      background: gradient(0.3, 0.7), effects: [rain({ density: 1 })] },
    { id: 'b', rect: [126, 4, 110, 112], scene: ballScene(), camera: { scale: 110, target: [0, 0.4, 0] } },
  ],
  lettering: [caption({ panel: 'a', text: 'Here.', at: [0.05, 0.05] })],
});

/** Build with a log of { id: 'cached' | 'built' | 'uncacheable' }. */
const build = (spec, opts) => {
  const log = {};
  const out = buildPage(spec, { ...opts, onPanel: e => { log[e.id] = e.cached ? 'cached' : e.uncacheable ? 'uncacheable' : 'built'; } });
  return { out, log };
};

test('the panel cache reuses untouched panels and gives byte-identical output', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'mangaka-cache-'));
  try {
    const plain = buildPage(page());
    const one = build(page(), { cacheDir });
    assert.deepEqual(one.log, { a: 'built', b: 'built' });
    const two = build(page(), { cacheDir });
    assert.deepEqual(two.log, { a: 'cached', b: 'cached' });
    for (const k of ['svg', 'html']) { assert.equal(two.out[k], plain[k]); assert.equal(one.out[k], plain[k]); }
    assert.equal(JSON.stringify(two.out.map), JSON.stringify(plain.map));
    assert.equal(JSON.stringify(two.out.stats), JSON.stringify(plain.stats));
    assert.deepEqual(readdirSync(cacheDir).filter(f => f.endsWith('.json')).map(f => f.replace(/-[0-9a-f]{64}\.json$/, '')).sort(), ['a', 'b']);

    // Each change rebuilds only its own panel.
    const changes = {
      camera: s => { s.panels[1].camera.yaw = 0.4; },
      region: s => { s.panels[0].regions = [{ rect: [20, 20, 30, 30], feather: 6, set: { hatch: 1.6, black: 0.7 } }]; },
      form: s => { s.panels[1].scene = ballScene(0.3); },
      background: s => { s.panels[0].background = gradient(0.2, 0.7); },
      effect: s => { s.panels[0].effects = [rain({ density: 0.5 })]; },
      style: s => { s.panels[1].style = 'shonen-clean'; },
    };
    const target = { camera: 'b', region: 'a', form: 'b', background: 'a', effect: 'a', style: 'b' };
    for (const [name, edit] of Object.entries(changes)) {
      const spec = page(); edit(spec);
      const { log, out } = build(spec, { cacheDir });
      const other = target[name] === 'a' ? 'b' : 'a';
      assert.deepEqual(log, { [target[name]]: 'built', [other]: 'cached' }, name);
      if (name === 'region') assert.equal(out.svg, buildPage(spec).svg, name);
      // Back to the original: the stale entry was replaced, so this panel builds again.
      assert.deepEqual(build(page(), { cacheDir }).log, { [target[name]]: 'built', [other]: 'cached' }, name);
    }
    // Lettering is laid out on every build and never invalidates a panel.
    const lettered = page(); lettered.lettering = [caption({ panel: 'a', text: 'Elsewhere.', at: [0.1, 0.5] })];
    assert.deepEqual(build(lettered, { cacheDir }).log, { a: 'cached', b: 'cached' });
  } finally { rmSync(cacheDir, { recursive: true, force: true }); }
});

test('panels holding a function without a description are never cached', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'mangaka-cache-'));
  try {
    const spec = () => { const s = page(); s.panels[1].background = () => 0.4; return s; };
    const reasons = [];
    buildPage(spec(), { cacheDir, onPanel: e => { if (e.uncacheable) reasons.push(`${e.id}: ${e.uncacheable}`); } });
    assert.deepEqual(reasons, ['b: background is a function with no description']);
    const { log, out } = build(spec(), { cacheDir });
    assert.deepEqual(log, { a: 'cached', b: 'uncacheable' });
    assert.equal(out.svg, buildPage(spec()).svg);
    // A function of your own with a `desc` is cached like the built-in ones.
    const own = () => ({ size: [40, 40], panels: [{ ...flatPanel(), background: Object.assign(() => 0.2, { desc: { kind: 'mine', v: 0.2 } }) }] });
    assert.deepEqual([build(own(), { cacheDir }).log.f, build(own(), { cacheDir }).log.f], ['built', 'cached']);
  } finally { rmSync(cacheDir, { recursive: true, force: true }); }
});
const flatPanel = () => ({ id: 'f', rect: [0, 0, 40, 40], camera: { scale: 1 }, background: flat(0.3) });

test('actor panels are cached with their bones, so cameras and tails still follow them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-actor-cache-'));
  const cacheDir = join(dir, '.mangaka', 'cache');
  const spec = () => ({
    size: [100, 90],
    panels: [{ id: 'kid', rect: [0, 0, 70, 90], actors: [{ name: 'kid', model: relative(dir, join(ROOT, 'models/shino.vrm')), pose: 'stand' }],
      camera: ({ bones }) => ({ scale: 45, target: [bones.kid.hips[0], 0.85, bones.kid.hips[2]] }) }],
    lettering: [bubble({ panel: 'kid', text: 'Hi', at: [0.8, 0.15], tail: { actor: 'kid', bone: 'head' } })],
  });
  try {
    const one = build(spec(), { dir, cacheDir, write: false });
    const two = build(spec(), { dir, cacheDir, write: false });
    assert.deepEqual([one.log.kid, two.log.kid], ['built', 'cached']);
    assert.equal(two.out.svg, one.out.svg);
    assert.equal(JSON.stringify(two.out.map), JSON.stringify(one.out.map));
    const moved = spec(); moved.panels[0].actors[0].root = { pos: [0.1, 0, 0], yaw: 0.3 };
    assert.equal(build(moved, { dir, cacheDir, write: false }).log.kid, 'built');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('buildPage names the page file in the viewer instruction', () => {
  const { html } = buildPage(page(), { pageFile: 'examples/x/page-01.mjs' });
  assert.ok(html.includes('"pageFile":"examples/x/page-01.mjs"'));
  assert.ok(buildPage(page()).html.includes('"pageFile":"page.mjs"'));
  assert.ok(html.includes(readFileSync(join(ROOT, 'kit/viewer-core.mjs'), 'utf8').match(/function formatInstruction[^\n]+/)[0]));
});

test('diff passes a region override and fails when a second, far region also changed', async () => {
  const { diffPages, pathPoints, pointsBox } = await import('../scripts/diff.mjs');
  // Compact relative path data: absolute M, relative l with glued negatives, arcs, close.
  assert.deepEqual(pointsBox(pathPoints('M10 20l5-3 .5 7-2 0z')), [10, 17, 15.5, 24]);
  assert.deepEqual(pointsBox(pathPoints('M5 5a2 2 0 1 0 4 0')), [3, 3, 11, 7]);

  const near = [{ rect: [10, 60, 30, 30], feather: 4, set: { black: 0.55, hatch: 1.8 } }];
  const far = { rect: [82, 4, 26, 26], feather: 4, set: { black: 0.4, hatch: 2 } };
  const withRegions = regions => { const s = page(); s.panels[0].regions = regions; return s; };
  const before = buildPage(page()), after = buildPage(withRegions(near)), both = buildPage(withRegions([...near, far]));
  const region = [10 / 110, 60 / 112, 30 / 110, 30 / 112];
  const diff = next => diffPages({ prev: before.svg, next: next.svg, map: next.map, panel: 'a', region, margin: 20 });

  const ok = diff(after);
  assert.equal(ok.outside, 0);
  const inside = ok.panels.find(p => p.id === 'a').layers.reduce((n, l) => n + l.inside, 0);
  assert.ok(inside > 0, 'the override changed some ink');
  assert.ok(ok.panels.filter(p => p.id !== 'a').every(p => p.layers.every(l => !l.inside && !l.outside)));

  const bad = diff(both);
  assert.ok(bad.outside > 0);
  const named = bad.panels.find(p => p.id === 'a').layers.filter(l => l.outside).map(l => l.name);
  assert.ok(named.length > 0, 'the failing layers are named');
  // --allow-part adds the part's box in the map, grown by three margins.
  const { partBox } = await import('../scripts/capture.mjs');
  const wide = diffPages({ prev: before.svg, next: after.svg, map: after.map, panel: 'a', region, margin: 5, allowParts: ['ball'] });
  const pb = partBox(after.map.panels[0], 'ball');
  assert.deepEqual(wide.allowed[1], [pb[0] - 15, pb[1] - 15, pb[2] + 30, pb[3] + 30]);
  assert.throws(() => diffPages({ prev: before.svg, next: both.svg, map: both.map, panel: 'a', region, allowParts: ['nope'] }), /no part "nope" in panel "a"/);
});

test('rework.mjs and diff.mjs: rebuild one panel, then prove the change stayed in its region', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-rework-'));
  const file = join(dir, 'page.mjs');
  const src = regions => `import * as S from ${JSON.stringify(join(ROOT, 'kit/sdf.mjs'))};\n` +
    `import { gradient } from ${JSON.stringify(join(ROOT, 'kit/backgrounds.mjs'))};\n` +
    `const ball = () => { const sc = S.scene(); sc.add('ground', 'ground', S.box([0, -0.05, 0], [1.2, 0.05, 1.2])); sc.add('ball', 'metal', S.sphere([0, 0.4, 0], 0.35)); return sc; };\n` +
    `export default { size: [240, 120], panels: [\n` +
    `  { id: 'a', rect: [4, 4, 110, 112], scene: ball(), camera: { yaw: 0.2, pitch: 0.3, scale: 90, target: [0, 0.3, 0] }, background: gradient(0.3, 0.7), regions: ${JSON.stringify(regions.a)} },\n` +
    `  { id: 'b', rect: [126, 4, 110, 112], scene: ball(), camera: { scale: 110, target: [0, 0.4, 0] }, regions: ${JSON.stringify(regions.b)} },\n] };\n`;
  const node = (...args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
  const near = [{ rect: [10, 60, 30, 30], feather: 4, set: { black: 0.55, hatch: 1.8 } }];
  try {
    writeFileSync(file, src({ a: [], b: [] }));
    assert.equal(node(join(ROOT, 'scripts/build.mjs'), 'page.mjs').status, 0);
    writeFileSync(file, src({ a: near, b: [] }));
    const rw = node(join(ROOT, 'scripts/rework.mjs'), 'page.mjs', '--panel', 'a');
    assert.equal(rw.status, 0, rw.stderr);
    assert.match(rw.stdout, /panel a +rebuilt/);
    assert.match(rw.stdout, /panel b +cached/);
    assert.ok(existsSync(join(dir, 'page.prev.svg')));
    const region = [10 / 110, 60 / 112, 30 / 110, 30 / 112].map(v => v.toFixed(3)).join(',');
    const pass = node(join(ROOT, 'scripts/diff.mjs'), '.', '--panel', 'a', '--region', region, '--margin', '20');
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /^panel b: unchanged$/m);
    assert.match(pass.stdout, /changed inside/);

    // An edit in another panel: rework names it and diff fails on it.
    writeFileSync(file, src({ a: [{ ...near[0], set: { black: 0.5, hatch: 1.8 } }], b: near }));
    const rw2 = node(join(ROOT, 'scripts/rework.mjs'), 'page.mjs', '--panel', 'a');
    assert.equal(rw2.status, 1);
    assert.match(rw2.stderr, /rebuilt more than panel "a": b also changed/);
    const fail = node(join(ROOT, 'scripts/diff.mjs'), '.', '--panel', 'a', '--region', region, '--margin', '20');
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /FAIL: changes outside .*b\//);
    assert.equal(node(join(ROOT, 'scripts/diff.mjs'), '.', '--panel', 'a', '--region', '2,0,1,1').status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
