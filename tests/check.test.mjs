import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, readingBefore } from '../scripts/check.mjs';
import { pickDenseCells, strokeGrid } from '../scripts/sheet.mjs';
import { clampCrop, plan, partBox } from '../scripts/capture.mjs';

const good = () => ({
  stats: { svgBytes: 1000, panels: [
    { id: 'a', style: 'seinen-dense', balance: { black: [0.12, 0.6] }, black: 0.3, tone: 0.3, white: 0.4 },
    { id: 'b', style: 'seinen-dense', balance: { black: [0.12, 0.6] }, black: 0.2, tone: 0.3, white: 0.5 },
  ] },
  map: {
    size: [400, 300], reading: 'rtl',
    panels: [{ id: 'a', rect: [30, 30, 150, 240] }, { id: 'b', rect: [210, 30, 150, 240] }],
    lettering: [
      { index: 0, type: 'caption', kind: null, panel: 'a', box: [34, 34, 100, 30] },
      { index: 1, type: 'bubble', kind: 'speech', panel: 'b', box: [300, 60, 60, 40] },
      { index: 2, type: 'bubble', kind: 'speech', panel: 'b', box: [220, 70, 60, 40] },
      { index: 3, type: 'sfx', kind: null, panel: null, box: [150, 250, 80, 40] },
    ],
  },
  svgBytes: 1000,
});
const problemsAfter = edit => { const x = good(); edit(x); return checkPage(x); };

test('a clean page has no problems', () => assert.deepEqual(checkPage(good()), []));

test('black share outside the style range, and nearly empty or solid panels', () => {
  const low = problemsAfter(x => { x.stats.panels[0].black = 0.05; });
  assert.equal(low.length, 1);
  assert.match(low[0], /panel a: black share 5\.0% is outside seinen-dense's range 12\.0% to 60\.0%/);
  assert.match(problemsAfter(x => { x.stats.panels[1].black = 0.7; })[0], /panel b: black share 70\.0%/);
  const empty = problemsAfter(x => { Object.assign(x.stats.panels[0], { black: 0.15, tone: 0.01, white: 0.98 }); });
  assert.match(empty.join('\n'), /panel a: 98\.0% white/);
  const solid = problemsAfter(x => { Object.assign(x.stats.panels[0], { black: 0.98, tone: 0, white: 0.02 }); });
  assert.match(solid.join('\n'), /panel a: 98\.0% black, the panel is nearly solid/);
});

test('svg over 2 MB', () => {
  assert.match(problemsAfter(x => { x.svgBytes = 2 * 1024 * 1024 + 1; })[0], /over the 2 MB limit/);
  assert.deepEqual(problemsAfter(x => { x.svgBytes = 2 * 1024 * 1024; }), []);
});

test('lettering boxes must stay inside their panel (grown by 12 px) and the page', () => {
  // Captions and bubbles: 12 px of slack, then a problem.
  assert.deepEqual(problemsAfter(x => { x.map.lettering[0].box = [18, 40, 100, 30]; }), []);
  assert.match(problemsAfter(x => { x.map.lettering[0].box = [17, 40, 100, 30]; })[0], /lettering\[0\] \(caption in a\) leaves its panel/);
  assert.match(problemsAfter(x => { x.map.lettering[1].box = [300, 60, 73, 40]; })[0], /lettering\[1\] \(bubble in b\) leaves its panel/);
  // Outside the page is reported as leaving the page.
  assert.match(problemsAfter(x => { x.map.lettering[1].box = [350, 60, 60, 40]; })[0], /lettering\[1\].* leaves the page/);
  // A sound effect only has to stay on the page, even outside any panel.
  assert.deepEqual(problemsAfter(x => { x.map.lettering[3].box = [190, 280, 60, 20]; }), []);
  assert.match(problemsAfter(x => { x.map.lettering[3].box = [190, 280, 60, 21]; })[0], /lettering\[3\] \(sfx\) leaves the page/);
  // A sound effect that belongs to a panel is not held to it.
  assert.deepEqual(problemsAfter(x => { x.map.lettering[3] = { ...x.map.lettering[3], panel: 'a', box: [180, 100, 80, 40] }; }), []);
});

test('bubbles of a panel must be listed in reading order', () => {
  // In the good page, the right bubble comes first (rtl).
  const swapped = problemsAfter(x => { x.map.lettering[1].box = [220, 70, 60, 40]; x.map.lettering[2].box = [300, 60, 60, 40]; });
  assert.equal(swapped.length, 1);
  assert.match(swapped[0], /panel b: bubble lettering\[2\] reads before lettering\[1\] \(rtl\)/);
  // ltr mirrors the horizontal rule.
  assert.match(problemsAfter(x => { x.map.reading = 'ltr'; })[0], /\(ltr\)/);
  assert.deepEqual(problemsAfter(x => { x.map.reading = 'ltr'; x.map.lettering[1].box = [220, 70, 60, 40]; x.map.lettering[2].box = [300, 60, 60, 40]; }), []);
  // A clearly higher bubble goes first whatever its side.
  const high = problemsAfter(x => { x.map.lettering[1].box = [300, 190, 60, 40]; x.map.lettering[2].box = [220, 70, 60, 40]; });
  assert.match(high[0], /reads before/);
  // Captions and sound effects do not take part.
  assert.deepEqual(problemsAfter(x => { x.map.lettering.push({ index: 4, type: 'caption', kind: null, panel: 'b', box: [215, 35, 20, 10] }); }), []);
  // Bubbles in different panels are not compared.
  assert.deepEqual(problemsAfter(x => { x.map.lettering[1].panel = 'a'; x.map.lettering[1].box = [40, 60, 60, 40]; x.map.lettering[2].box = [300, 60, 60, 40]; }), []);
});

test('readingBefore: height needs more than half the smaller box height, else side decides', () => {
  const b = (x, y) => ({ box: [x, y, 50, 40] });
  assert.equal(readingBefore(b(0, 0), b(100, 21), 'rtl'), true);   // clearly higher
  assert.equal(readingBefore(b(0, 0), b(100, 20), 'rtl'), false);  // level, right one first
  assert.equal(readingBefore(b(100, 20), b(0, 0), 'rtl'), true);
  assert.equal(readingBefore(b(0, 20), b(100, 0), 'ltr'), true);
});

// ---- density picker and capture planning (no Chrome) ----
const dense = (id, x, y, n) => `<g id="${id}" transform="translate(${x} ${y})"><g clip-path="url(#${id}-clip)"><g transform="scale(0.5)"><path d="${n}"/></g></g></g>`;
const lines = (x, y, n) => `M${x} ${y}` + 'l1 1'.repeat(n);
const sheetMap = () => ({ size: [400, 400], panels: ['a', 'b', 'c'].map((id, i) => ({ id, rect: [i * 130, 0, 120, 300] })) });

test('strokeGrid counts segments per cell from start points in buffer pixels', () => {
  const svg = dense('a', 0, 0, lines(10, 10, 5) + lines(400, 400, 7));   // x0.5: (5,5) cell 0, (200,200) cell 6? 
  const [a] = strokeGrid(svg, { size: [400, 400], panels: [{ id: 'a', rect: [0, 0, 240, 240] }] });
  assert.equal(a.cells[0], 5);
  assert.equal(a.cells[8], 7);
});

test('pickDenseCells: six densest, at most two per panel, no touching cells of one panel', () => {
  const map = sheetMap();
  const svg = '<svg>' + [
    dense('a', 0, 0, lines(2, 2, 90) + lines(2, 14, 80) + lines(200, 400, 50) + lines(2, 600, 40)),   // cells (0,0) (0,0) (1,2) ...
    dense('b', 130, 0, lines(2, 2, 10) + lines(100, 300, 30) + lines(220, 590, 25)),
    dense('c', 260, 0, lines(100, 100, 5)),
  ].join('') + '</svg>';
  const picks = pickDenseCells({ svg, map });
  assert.ok(picks.length <= 6);
  const per = {}; for (const p of picks) per[p.panel] = (per[p.panel] || 0) + 1;
  assert.ok(Object.values(per).every(n => n <= 2), JSON.stringify(per));
  assert.equal(picks[0].panel, 'a');
  for (let i = 1; i < picks.length; i++) assert.ok(picks[i - 1].density >= picks[i].density);
  for (const p of picks) for (const q of picks) if (p !== q && p.panel === q.panel) assert.ok(Math.abs(p.col - q.col) > 1 || Math.abs(p.row - q.row) > 1);
  // Deterministic.
  assert.deepEqual(pickDenseCells({ svg, map }), picks);
});

test('capture plan: page, panel, part box and grid; clamping', () => {
  const rle = [0, 3, 1, 2, 0, 1, 1, 2, 0, 4];            // 4 x 3 cells: part 1 at cells (3,0), (0,1)... rows below
  const map = { size: [100, 100], panels: [{ id: 'a', rect: [10, 20, 8, 6], parts: ['x'], rle }, { id: 'b', rect: [40, 20, 8, 6], parts: ['y'], rle: [0, 12] }] };
  assert.deepEqual(plan(map, {}), [{ name: 'page', crop: [0, 0, 100, 100] }]);
  assert.equal(plan(map, { panel: 'b' })[0].name, 'panel-b');
  assert.throws(() => plan(map, { panel: 'zz' }), /no panel "zz"/);
  assert.throws(() => plan(map, { part: 'nope' }), /no part "nope"/);
  assert.equal(partBox(map.panels[1], 'y'), null);
  const [pa] = plan(map, { part: 'x' });
  assert.equal(pa.name, 'part-a-x');
  assert.deepEqual(partBox(map.panels[0], 'x'), [10, 20, 8, 4]);
  assert.equal(plan(map, { grid: 2 }).length, 4);
  assert.deepEqual(plan(map, { grid: 2 })[3].crop, [50, 50, 50, 50]);
  assert.deepEqual(clampCrop([-5, 90.2, 30, 30], [100, 100]), [0, 90, 25, 10]);
});
