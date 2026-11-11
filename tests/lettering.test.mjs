import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fontMetrics, measure, wrap, caption, bubble, sfx, layoutLettering, fontCss, FONTS } from '../kit/lettering.mjs';

const woff = name => readFileSync(new URL(`../kit/fonts/${name}.woff`, import.meta.url));

test('fontMetrics reads head, hhea, hmtx and cmap from WOFF 1', () => {
  const m = fontMetrics(woff(FONTS.dialogue.file));
  assert.equal(m.unitsPerEm, 1000);
  assert.ok(m.ascender > 0 && m.descender < 0);
  assert.ok(m.capHeight > 500 && m.capHeight < 800);
  assert.ok(m.glyph(0x41) > 0, 'A is mapped');
  assert.ok(m.glyph(0x2019) > 0, 'right single quote is mapped');
  assert.ok(m.advance(0x57) > m.advance(0x49), 'W is wider than I');
  assert.equal(m.glyph(0x4e00), 0, 'no CJK in the Latin subset');
  const b = fontMetrics(woff(FONTS.sfx.file));
  assert.ok(b.glyph(0x47) > 0);
  assert.throws(() => fontMetrics(Buffer.from('nope, not a font at all......')), /not a WOFF 1/);
});

test('measure scales with size and adds letter spacing', () => {
  const a = measure('HELLO', 'dialogue', 10), b = measure('HELLO', 'dialogue', 20);
  assert.ok(Math.abs(b - 2 * a) < 1e-9);
  assert.ok(measure('HELLO WORLD', 'dialogue', 15) > measure('HELLO', 'dialogue', 15));
  assert.throws(() => measure('X', 'gothic', 10), /unknown font "gothic"/);
});

test('wrap never exceeds maxWidth, keeps every word and honours newlines', () => {
  const text = 'NINE HUNDRED YEARS OF SILENCE. THEN THE GATE OPENED, AND NOTHING WAS EVER THE SAME AGAIN.';
  for (const maxW of [40, 70, 120, 200, 400]) {
    const lines = wrap(text, 'dialogue', 15.5, maxW);
    for (const l of lines) assert.ok(measure(l, 'dialogue', 15.5) <= maxW, `"${l}" > ${maxW}`);
    assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  }
  assert.deepEqual(wrap('A\nB', 'dialogue', 15.5, 400), ['A', 'B']);
  // A word longer than the width is split.
  const long = wrap('SUPERCALIFRAGILISTIC', 'dialogue', 15.5, 50);
  assert.ok(long.length > 1);
  for (const l of long) assert.ok(measure(l, 'dialogue', 15.5) <= 50);
});

const frame = { rect: [100, 50, 400, 300], bone: () => [300, 300] };
const inside = (e, x, y) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1 + 1e-9;

test('a bubble ellipse contains every wrapped line box, for every kind', () => {
  const texts = ['...it moved?!', "I'm not running.", 'Hey', 'You will never understand what it means to stand at that gate alone.'];
  for (const kind of ['speech', 'thought', 'shout', 'whisper']) for (const text of texts) {
    const out = layoutLettering(bubble({ kind, text, at: [0.5, 0.5], tail: [0.1, 0.9] }), frame);
    assert.ok(out.lines.length >= 1);
    for (const l of out.lines) {
      const [x0, y0, x1, y1] = l.box;
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) assert.ok(inside(out.ellipse, x, y), `${kind} "${l.text}"`);
    }
    assert.ok(out.svg.includes('<text'));
  }
});

test('bubble text is upper case, escaped, centred at `at`; tails reach their target', () => {
  const out = layoutLettering(bubble({ text: 'a < b & "c"', at: [0.5, 0.5], tail: [0.25, 0.75] }), frame);
  assert.equal(out.ellipse.cx, 300);
  assert.equal(out.ellipse.cy, 200);
  assert.equal(out.lines.map(l => l.text).join(" "), 'A < B & "C"');
  assert.match(out.svg, /A &lt; B &amp;/);
  assert.match(out.svg, /&quot;C&quot;/);
  assert.deepEqual(out.tip, [200, 275]);
  assert.match(out.svg, /L200 275/);
  // A bone tail aims at the bone but stops short of it.
  const b = layoutLettering(bubble({ text: 'hey', at: [0.2, 0.2], tail: { actor: 'kid', bone: 'head' } }), frame);
  const dir = [300 - b.ellipse.cx, 300 - b.ellipse.cy], t = [b.tip[0] - b.ellipse.cx, b.tip[1] - b.ellipse.cy];
  assert.ok(Math.abs(dir[0] * t[1] - dir[1] * t[0]) / Math.hypot(...dir) < 25, 'tip lies near the line to the bone');
  assert.ok(Math.hypot(300 - b.tip[0], 300 - b.tip[1]) > 5);
  assert.throws(() => layoutLettering(bubble({ kind: 'yell', text: 'x', at: [0, 0] }), frame), /unknown bubble kind "yell"/);
  assert.match(layoutLettering(bubble({ kind: 'whisper', text: 'psst', at: [0.5, 0.5] }), frame).svg, /stroke-dasharray/);
});

test('captions and sound effects', () => {
  const c = layoutLettering(caption({ text: 'Nine hundred years of silence. Then the gate opened.', at: [0.1, 0.1], width: 286 }), frame);
  assert.deepEqual(c.box.slice(0, 2), [140, 80]);
  assert.equal(c.box[2] - c.box[0], 286);
  for (const l of c.lines) assert.ok(l.box[0] >= c.box[0] && l.box[2] <= c.box[2] && l.box[3] <= c.box[3]);
  const s = layoutLettering(sfx({ text: 'grip!', at: [0.5, 0.5], rotate: 12, size: 46 }), frame);
  assert.match(s.svg, /translate\(300 200\) rotate\(12\)/);
  assert.match(s.svg, />GRIP!</);
  assert.match(s.svg, /font-family="mk-sfx"/);
  const css = fontCss(['dialogue', 'sfx']);
  assert.equal(css.match(/@font-face/g).length, 2);
  assert.match(css, /data:font\/woff2;base64,d09GMg/);
});

test('a thought bubble trails three shrinking circles ending on its tail point', () => {
  const out = layoutLettering(bubble({ kind: 'thought', text: 'Maybe.', at: [0.5, 0.3], tail: [0.25, 0.75] }), frame);
  const circles = [...out.svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
  assert.equal(circles.length, 3);
  assert.deepEqual(circles[2].slice(0, 2), [200, 275]);
  assert.ok(circles[0][2] > circles[1][2] && circles[1][2] > circles[2][2]);
  assert.doesNotMatch(out.svg, /<path d="M[^"]*L200 275/, 'no wedge tail on a thought bubble');
});
