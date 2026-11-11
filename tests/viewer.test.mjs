import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeRle, partsInRect, formatInstruction } from '../kit/viewer-core.mjs';
import { viewerHtml } from '../kit/viewer.mjs';

// p1 is 8 x 6 page px, so its grid is 4 x 3 cells:
//   0 1 1 2
//   0 1 1 2
//   0 0 2 2
// p3 is a small inset over p1's lower right corner; p2 is a separate panel.
const crafted = () => ({
  size: [60, 40], reading: 'rtl',
  panels: [
    { id: 'p1', rect: [10, 20, 8, 6], ss: 1, parts: ['a', 'b'], rle: [0, 1, 1, 2, 2, 1, 0, 1, 1, 2, 2, 1, 0, 2, 2, 2] },
    { id: 'p2', rect: [30, 20, 20, 2], ss: 1, parts: 'abcdefghij'.split(''), rle: [1, 1, 2, 1, 3, 1, 4, 1, 5, 1, 6, 1, 7, 1, 8, 1, 9, 1, 10, 1] },
    { id: 'p3', rect: [16, 24, 2, 2], ss: 1, parts: ['c'], rle: [1, 1] },
  ],
  lettering: [],
});

test('decodeRle expands a panel grid row-major', () => {
  const ids = decodeRle(crafted().panels[0]);
  assert.deepEqual([...ids], [0, 1, 1, 2, 0, 1, 1, 2, 0, 0, 2, 2]);
});

test('partsInRect finds the panel, the region and the parts with shares', () => {
  const map = crafted();
  const one = partsInRect(map, [12, 20, 4, 4]);
  assert.equal(one.panel, 'p1');
  assert.deepEqual(one.region, [0.25, 0, 0.5, 0.67]);
  assert.deepEqual(one.parts, [{ name: 'a', share: 100 }]);

  // The whole of p1: 12 cells, a 4, b 4 (ties go by name), background 4 (left out of the list).
  const all = partsInRect(map, [10, 20, 8, 6]);
  assert.equal(all.panel, 'p1');
  assert.deepEqual(all.region, [0, 0, 1, 1]);
  assert.deepEqual(all.parts, [{ name: 'a', share: 33 }, { name: 'b', share: 33 }]);

  // A rectangle hanging over the panel edge is clipped to it.
  const edge = partsInRect(map, [4, 18, 10, 6]);
  assert.equal(edge.panel, 'p1');
  assert.deepEqual(edge.region, [0, 0, 0.5, 0.67]);
  assert.deepEqual(edge.parts, [{ name: 'a', share: 50 }]);
});

test('partsInRect prefers the inset under the centre and keeps the top eight', () => {
  const map = crafted();
  assert.equal(partsInRect(map, [16.5, 24.5, 1, 1]).panel, 'p3');
  const many = partsInRect(map, [30, 20, 20, 2]);
  assert.equal(many.panel, 'p2');
  assert.equal(many.parts.length, 8);
  assert.deepEqual(many.parts[0], { name: 'a', share: 10 });
  assert.equal(partsInRect(map, [0, 0, 5, 5]).panel, null);
});

test('formatInstruction gives the block from the design, line for line', () => {
  const text = formatInstruction({
    pageFile: 'examples/rain/page-01.mjs', panel: 'p1', region: [0.42, 0.31, 0.18, 0.22],
    parts: [{ name: 'bust.hair.fringe-3', share: 41 }, { name: 'bust.head', share: 33 }, { name: 'bust.hair.fringe-4', share: 12 }],
    request: 'make the fringe fall lower over the eye and add more loose strands',
  });
  assert.equal(text, [
    '/mangaka rework examples/rain/page-01.mjs',
    'panel: p1   region: [0.42, 0.31, 0.18, 0.22]',
    'parts: bust.hair.fringe-3 (41%), bust.head (33%), bust.hair.fringe-4 (12%)',
    'request: make the fringe fall lower over the eye and add more loose strands',
  ].join('\n'));
  const bare = formatInstruction({ panel: 'p2', region: [0.5, 0, 0.25, 1], parts: [], request: '  two\nlines ' });
  assert.equal(bare, '/mangaka rework page.mjs\npanel: p2   region: [0.50, 0.00, 0.25, 1.00]\nparts: none\nrequest: two lines');
});

test('viewerHtml is one self-contained file with the page, the map and the core', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" width="60" height="40"><rect width="60" height="40" fill="#fff"/></svg>';
  const map = crafted();
  map.panels[0].parts[0] = 'a</script>';
  const html = viewerHtml({ svg, map, pageFile: 'examples/x/page.mjs', title: 'X' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes(svg));
  assert.ok(!/<(script|link|img)[^>]+(src|href)=/i.test(html), 'no external resources');
  assert.ok(!/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')), 'no URLs');
  assert.equal(html.match(/<\/script>/g).length, html.match(/<script/g).length, 'map text cannot close its script tag');
  assert.ok(!/\bexport\s/.test(html), 'export keywords stripped');
  assert.ok(html.includes('function partsInRect'));
  assert.ok(html.includes('"examples/x/page.mjs"'));
  assert.equal(html, viewerHtml({ svg, map, pageFile: 'examples/x/page.mjs', title: 'X' }));
});

test('viewer-core has no imports and no Node APIs', () => {
  const src = readFileSync(new URL('../kit/viewer-core.mjs', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(src));
  assert.ok(!/\b(require|process|Buffer|node:)\b/.test(src));
});
