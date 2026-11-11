import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as S from '../kit/sdf.mjs';
import { buildPage } from '../kit/page.mjs';
import { gradient, flat } from '../kit/backgrounds.mjs';
import { rain } from '../kit/effects.mjs';
import { caption, bubble } from '../kit/lettering.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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
  const src = regions => `import * as S from ${JSON.stringify(pathToFileURL(join(ROOT, 'kit/sdf.mjs')).href)};\n` +
    `import { gradient } from ${JSON.stringify(pathToFileURL(join(ROOT, 'kit/backgrounds.mjs')).href)};\n` +
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

test('diff locates a change by the vertices that moved off the other version', async () => {
  const { locateChange, geometryOf, pathPoints, diffPages, TOLERANCE } = await import('../scripts/diff.mjs');
  assert.equal(TOLERANCE, 1);
  // A long horizontal stroke at y = 50, one vertex every 10 px from x = 0 to 180.
  const line = (edit = {}) => 'M0 50' + Array.from({ length: 18 }, (_, i) => { const x = (i + 1) * 10; return `L${x} ${50 + (edit[x] ?? 0)}`; }).join('');
  const layer = d => new Map([[d, pathPoints(d)]]);
  const before = geometryOf(layer(line()));

  // Changed only at its far end: located at that end, not over the whole stroke.
  assert.deepEqual(locateChange(pathPoints(line({ 180: 6 })), before), [180, 56, 180, 56]);
  // A stroke found in one version only is located by its whole box.
  assert.deepEqual(locateChange(pathPoints('M20 10L60 30L40 35'), before), [20, 10, 60, 35]);
  assert.deepEqual(locateChange(pathPoints(line()), geometryOf(new Map())), [0, 50, 180, 50]);

  // Through diffPages on hand-built pages: an in-region change at x = 20 plus a far vertex at x = 180.
  const page = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g id="p" transform="translate(0 0)"><g clip-path="url(#p-clip)">` +
    `<g transform="scale(1)" fill="none" stroke="#000"><path d="${d}" stroke-width="0.6"/></g></g></g></svg>`;
  const map = { size: [200, 100], panels: [{ id: 'p', rect: [0, 0, 200, 100], parts: [], rle: [0, 5000] }], lettering: [] };
  const run = far => diffPages({ prev: page(line()), next: page(line({ 20: 6, 180: far })), map, panel: 'p', region: [0, 0.4, 0.2, 0.2], margin: 5 });
  const layerOf = r => r.panels[0].layers.find(l => l.name === 'hatchMid');
  assert.deepEqual(layerOf(run(0)), { name: 'hatchMid', inside: 2, outside: 0 });
  assert.deepEqual(layerOf(run(0.5)), { name: 'hatchMid', inside: 2, outside: 0 }, 'a 0.5 px wobble is tolerated');
  const shifted = run(3);
  assert.equal(layerOf(shifted).outside, 2, 'a far vertex moved by 3 px is a change outside');
  assert.equal(shifted.outside, 2);
});

test('rework.mjs warns about panels it cannot cache instead of counting them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-rework-warn-'));
  const file = join(dir, 'page.mjs');
  const src = black => `export default { size: [100, 50], panels: [\n` +
    `  { id: 'a', rect: [0, 0, 48, 50], camera: { scale: 1 }, regions: [{ rect: [5, 5, 10, 10], set: { black: ${black} } }] },\n` +
    `  { id: 'b', rect: [52, 0, 48, 50], camera: { scale: 1 }, background: () => 0.4 },\n] };\n`;
  const node = (...args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
  try {
    writeFileSync(file, src(0.8));
    assert.equal(node(join(ROOT, 'scripts/build.mjs'), 'page.mjs').status, 0);
    writeFileSync(file, src(0.5));
    const rw = node(join(ROOT, 'scripts/rework.mjs'), 'page.mjs', '--panel', 'a');
    assert.equal(rw.status, 0, rw.stderr);
    assert.match(rw.stdout, /panel a +rebuilt/);
    assert.match(rw.stderr, /^warning: panel b is not cacheable and was rebuilt \(background is a function with no description\)$/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rework.mjs on a cold cache builds every panel without failing; a changed key still counts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-rework-cold-'));
  const file = join(dir, 'page.mjs');
  const src = (a, b) => `export default { size: [100, 50], panels: [\n` +
    `  { id: 'a', rect: [0, 0, 48, 50], camera: { scale: 1 }, regions: [{ rect: [5, 5, 10, 10], set: { black: ${a} } }] },\n` +
    `  { id: 'b', rect: [52, 0, 48, 50], camera: { scale: 1 }, regions: [{ rect: [5, 5, 10, 10], set: { black: ${b} } }] },\n] };\n`;
  const node = (...args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
  try {
    // No cache at all: both panels are built, nothing counts against --panel a.
    writeFileSync(file, src(0.8, 0.8));
    const cold = node(join(ROOT, 'scripts/rework.mjs'), 'page.mjs', '--panel', 'a');
    assert.equal(cold.status, 0, cold.stdout + cold.stderr);
    assert.match(cold.stdout, /^panel a +built \(no cache yet\)$/m);
    assert.match(cold.stdout, /^panel b +built \(no cache yet\)$/m);
    assert.match(cold.stdout, /no cache entry yet for b/);
    // An entry for b exists under another key: that is a stray rebuild.
    writeFileSync(file, src(0.5, 0.6));
    const warm = node(join(ROOT, 'scripts/rework.mjs'), 'page.mjs', '--panel', 'a');
    assert.equal(warm.status, 1);
    assert.match(warm.stdout, /^panel a +rebuilt$/m);
    assert.match(warm.stdout, /^panel b +rebuilt$/m);
    assert.match(warm.stderr, /rebuilt more than panel "a": b also changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('page.html names the page file relative to the skill root, else to the current directory', async () => {
  const { pageLabel } = await import('../scripts/main.mjs');
  const { mkdirSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'mangaka-label-'));
  try {
    mkdirSync(join(root, 'skill', 'examples', 'x'), { recursive: true });
    writeFileSync(join(root, 'skill', 'SKILL.md'), '---\nname: t\n---\n');
    assert.equal(pageLabel(join(root, 'skill', 'examples', 'x', 'page.mjs')), 'examples/x/page.mjs');
    mkdirSync(join(root, 'loose'));
    assert.equal(pageLabel(join(root, 'loose', 'page.mjs')), relative(process.cwd(), join(root, 'loose', 'page.mjs')).split(sep).join('/'));
    // Through build.mjs, from a directory unrelated to the page.
    writeFileSync(join(root, 'skill', 'examples', 'x', 'page.mjs'), "export default { size: [60, 40], panels: [{ id: 'a', rect: [0, 0, 60, 40], camera: { scale: 1 } }] };\n");
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build.mjs'), join(root, 'skill', 'examples', 'x', 'page.mjs'), '--no-cache'], { cwd: join(root, 'loose'), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(root, 'skill', 'examples', 'x', 'page.html'), 'utf8'), /"pageFile":"examples\/x\/page\.mjs"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the kit fingerprint covers subdirectories such as kit/parts', async () => {
  const { treeFingerprint } = await import('../kit/page.mjs');
  const { mkdirSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'mangaka-kitprint-'));
  try {
    mkdirSync(join(root, 'parts'));
    writeFileSync(join(root, 'a.mjs'), 'export const a = 1;\n');
    writeFileSync(join(root, 'parts', 'b.mjs'), 'export const b = 0.5;\n');
    writeFileSync(join(root, 'notes.txt'), 'ignored');
    const one = treeFingerprint(root);
    assert.match(one, /^[0-9a-f]{64}$/);
    assert.equal(treeFingerprint(root), one);
    writeFileSync(join(root, 'notes.txt'), 'still ignored');
    assert.equal(treeFingerprint(root), one);
    writeFileSync(join(root, 'parts', 'b.mjs'), 'export const b = 0.6;\n');
    assert.notEqual(treeFingerprint(root), one);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
