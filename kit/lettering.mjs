// Lettering: captions, speech bubbles and sound effects, measured with the
// real font metrics so text always fits its balloon.
//
// caption(), bubble() and sfx() build plain lettering items for a page spec.
// layoutLettering(item, frame) turns one item into SVG plus its geometry.
// `at` (and a point `tail`) are fractions of frame.rect: the top-left corner of
// a caption, the centre of a bubble, the baseline start of a sound effect.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { rand01 } from './rng.mjs';

const { max, min, sqrt, cos, sin, atan2, hypot, round, PI, SQRT2 } = Math;
const f1 = v => String(round(v * 10) / 10);
const FONT_DIR = new URL('./fonts/', import.meta.url);

/** Fonts used on a page. tracking is letter spacing in em. */
export const FONTS = {
  dialogue: { family: 'mk-dialogue', weight: 700, file: 'comic-neue-latin-700-normal', tracking: 0.026 },
  sfx: { family: 'mk-sfx', weight: 400, file: 'bangers-latin-400-normal', tracking: 0.1 },
};

/**
 * Metrics of a WOFF 1 font: { unitsPerEm, ascender, descender, lineGap, capHeight,
 * glyph(codePoint), advance(codePoint) } with advances in font units.
 */
export function fontMetrics(woff) {
  const b = Buffer.from(woff.buffer ? woff : new Uint8Array(woff));
  if (b.toString('latin1', 0, 4) !== 'wOFF') throw new Error('fontMetrics: not a WOFF 1 file');
  const numTables = b.readUInt16BE(12);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = b.toString('latin1', e, e + 4), off = b.readUInt32BE(e + 4);
    const comp = b.readUInt32BE(e + 8), orig = b.readUInt32BE(e + 12);
    const raw = b.subarray(off, off + comp);
    tables[tag] = comp < orig ? inflateSync(raw) : raw;
  }
  for (const t of ['cmap', 'hmtx', 'head', 'hhea']) if (!tables[t]) throw new Error(`fontMetrics: missing table ${t}`);
  const { head, hhea, hmtx, cmap } = tables;
  const unitsPerEm = head.readUInt16BE(18);
  const ascender = hhea.readInt16BE(4), descender = hhea.readInt16BE(6), lineGap = hhea.readInt16BE(8);
  const nh = hhea.readUInt16BE(34);
  const os2 = tables['OS/2'];
  const capHeight = os2 && os2.readUInt16BE(0) >= 2 ? os2.readInt16BE(88) : round(unitsPerEm * 0.7);

  // cmap: prefer a full-Unicode format 12 subtable, else Unicode BMP format 4.
  const subs = [];
  for (let i = 0, n = cmap.readUInt16BE(2); i < n; i++) {
    const r = 4 + i * 8, pid = cmap.readUInt16BE(r), eid = cmap.readUInt16BE(r + 2), off = cmap.readUInt32BE(r + 4);
    if (pid === 0 || (pid === 3 && (eid === 1 || eid === 10))) subs.push({ off, fmt: cmap.readUInt16BE(off) });
  }
  const s12 = subs.find(s => s.fmt === 12), s4 = subs.find(s => s.fmt === 4);
  let glyph;
  if (s12) {
    const o = s12.off, n = cmap.readUInt32BE(o + 12);
    glyph = c => {
      for (let g = 0; g < n; g++) {
        const p = o + 16 + g * 12, a = cmap.readUInt32BE(p), z = cmap.readUInt32BE(p + 4);
        if (c >= a && c <= z) return cmap.readUInt32BE(p + 8) + c - a;
      }
      return 0;
    };
  } else if (s4) {
    const o = s4.off, seg = cmap.readUInt16BE(o + 6) / 2;
    const ends = o + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
    glyph = c => {
      if (c > 0xffff) return 0;
      for (let i = 0; i < seg; i++) {
        if (c > cmap.readUInt16BE(ends + i * 2)) continue;
        const start = cmap.readUInt16BE(starts + i * 2);
        if (c < start) return 0;
        const delta = cmap.readInt16BE(deltas + i * 2), ro = cmap.readUInt16BE(ranges + i * 2);
        if (!ro) return (c + delta) & 0xffff;
        const g = cmap.readUInt16BE(ranges + i * 2 + ro + 2 * (c - start));
        return g ? (g + delta) & 0xffff : 0;
      }
      return 0;
    };
  } else throw new Error('fontMetrics: no Unicode cmap subtable');
  const advOf = g => hmtx.readUInt16BE(min(g, nh - 1) * 4);
  const cache = new Map();
  const advance = c => {
    let a = cache.get(c);
    if (a === undefined) { a = advOf(glyph(c)); cache.set(c, a); }
    return a;
  };
  return { unitsPerEm, ascender, descender, lineGap, capHeight, glyph, advance };
}

const loaded = new Map();
/** The FONTS entry (by name or as given) with its metrics loaded. */
function fontOf(font) {
  const f = typeof font === 'string' ? FONTS[font] : font;
  if (!f) throw new Error(`unknown font "${font}" (known: ${Object.keys(FONTS).join(', ')})`);
  if (f.metrics) return f;
  if (!loaded.has(f.file)) loaded.set(f.file, fontMetrics(readFileSync(new URL(f.file + '.woff', FONT_DIR))));
  return { ...f, metrics: loaded.get(f.file) };
}

/** Width in px of one line of text, including letter spacing after every character. */
export function measure(text, font, size) {
  const f = fontOf(font), m = f.metrics;
  let units = 0, n = 0;
  for (const ch of text) { units += m.advance(ch.codePointAt(0)); n++; }
  return units / m.unitsPerEm * size + n * f.tracking * size;
}

/**
 * Greedy word wrap. Explicit '\n' breaks lines; a word wider than maxWidth is
 * split between characters. No returned line is wider than maxWidth.
 */
export function wrap(text, font, size, maxWidth) {
  const out = [];
  const fits = s => measure(s, font, size) <= maxWidth;
  for (const para of String(text).split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? line + ' ' + word : word;
      if (fits(cand)) { line = cand; continue; }
      if (line) { out.push(line); line = ''; }
      while (!fits(word)) {
        let k = 1;
        while (k < word.length && fits(word.slice(0, k + 1))) k++;
        out.push(word.slice(0, k));
        word = word.slice(k);
      }
      line = word;
    }
    if (line || !out.length) out.push(line);
  }
  return out;
}

const escapeXml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Dialogue style: upper case with typographic apostrophes. */
const dialogueText = s => String(s).toUpperCase().replace(/'/g, '’');

const KINDS = ['speech', 'thought', 'shout', 'whisper'];
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** A caption box. `width` in page px fixes the box width; otherwise it fits the text. */
export function caption({ text, at, width = null, panel = null } = {}) {
  return { type: 'caption', panel, text, at, width };
}

/** A balloon. tail: a point (fraction of the frame, the tip lands there) or { actor, bone }. */
export function bubble({ kind = 'speech', text, at, tail = null, width = null, panel = null } = {}) {
  return { type: 'bubble', panel, kind, text, at, tail, width };
}

/** A sound effect: Bangers, white with a black outline, rotated by `rotate` degrees. */
export function sfx({ text, at, rotate = 0, size = 44, panel = null } = {}) {
  return { type: 'sfx', panel, text, at, rotate, size };
}

/** Checks one lettering item; returns an error message or null. */
export function checkLettering(item) {
  if (!item || !['caption', 'bubble', 'sfx'].includes(item.type)) return `unknown type "${item && item.type}"`;
  if (typeof item.text !== 'string' || !item.text.trim()) return 'missing text';
  if (!isPoint(item.at)) return 'at must be [x, y]';
  if (item.type === 'bubble') {
    if (!KINDS.includes(item.kind)) return `unknown bubble kind "${item.kind}" (known: ${KINDS.join(', ')})`;
    const t = item.tail;
    if (t !== null && t !== undefined && !isPoint(t) && !(t && typeof t.actor === 'string' && typeof t.bone === 'string'))
      return 'tail must be [x, y] or { actor, bone }';
  }
  return null;
}

/** @font-face rules for the named FONTS entries, each embedded once as base64 WOFF2. */
export function fontCss(names) {
  return names.map(n => {
    const f = FONTS[n];
    const data = readFileSync(new URL(f.file + '.woff2', FONT_DIR)).toString('base64');
    return `@font-face{font-family:"${f.family}";font-weight:${f.weight};src:url(data:font/woff2;base64,${data}) format("woff2")}`;
  }).join('') + '.mk-l text{font-kerning:none}';
}

/** Font names an item uses. */
export const fontsOf = item => (item.type === 'sfx' ? ['sfx'] : ['dialogue']);

const textAttrs = (f, size) =>
  `font-family="${f.family}" font-weight="${f.weight}" font-size="${f1(size)}" letter-spacing="${round(f.tracking * size * 100) / 100}"`;

/** Lines of text centred on cx, the block's top at `top`. Returns { svg, lines }. */
function textBlock(rows, f, size, lh, cx, top) {
  const capH = f.metrics.capHeight / f.metrics.unitsPerEm * size;
  const lines = rows.map((t, i) => {
    const w = measure(t, f, size), y0 = top + i * lh;
    return { text: t, x: cx, y: y0 + lh / 2 + capH / 2, w, box: [cx - w / 2, y0, cx + w / 2, y0 + lh] };
  });
  const svg = lines.map(l => `<text x="${f1(l.x)}" y="${f1(l.y)}">${escapeXml(l.text)}</text>`).join('');
  return { svg, lines };
}

const SIZES = { speech: 15.5, thought: 15.5, shout: 17, whisper: 14 };
const STROKE = 2.2;

/**
 * Lay out one item. frame: { rect: [x, y, w, h] in page px, bone(actor, bone) => [x, y] page px }.
 * Returns { svg, lines, box } and, for bubbles, ellipse { cx, cy, rx, ry } (the outline
 * holding the text) and tip (the tail's end, or null).
 */
export function layoutLettering(item, frame) {
  const err = checkLettering(item);
  if (err) throw new Error(`lettering: ${err}`);
  const [rx0, ry0, rw, rh] = frame.rect;
  const ax = rx0 + item.at[0] * rw, ay = ry0 + item.at[1] * rh;
  if (item.type === 'sfx') return layoutSfx(item, ax, ay);
  const f = fontOf('dialogue');
  const text = dialogueText(item.text);
  if (item.type === 'caption') {
    const size = 15.5, lh = 19, pad = 14;
    const maxW = item.width ? item.width - 2 * pad : 280;
    const rows = wrap(text, f, size, maxW);
    const tw = max(...rows.map(r => measure(r, f, size)));
    const bw = item.width || tw + 2 * pad, bh = rows.length * lh + 16;
    const tb = textBlock(rows, f, size, lh, ax + bw / 2, ay + 8);
    const svg = `<rect x="${f1(ax)}" y="${f1(ay)}" width="${f1(bw)}" height="${f1(bh)}" fill="#fff" stroke="#000" stroke-width="${STROKE}"/>` +
      `<g ${textAttrs(f, size)} text-anchor="middle" fill="#000">${tb.svg}</g>`;
    return { svg, lines: tb.lines, box: [ax, ay, ax + bw, ay + bh] };
  }
  return layoutBubble(item, f, text, ax, ay, frame);
}

function layoutSfx(item, ax, ay) {
  const f = fontOf('sfx'), size = item.size;
  const text = String(item.text).toUpperCase();
  const w = measure(text, f, size);
  const svg = `<g transform="translate(${f1(ax)} ${f1(ay)}) rotate(${f1(item.rotate)})">` +
    `<text ${textAttrs(f, size)} fill="#fff" stroke="#000" stroke-width="${f1(size * 0.14)}" stroke-linejoin="round" paint-order="stroke">${escapeXml(text)}</text></g>`;
  // Box of the unrotated text, rotated about the baseline start.
  const a = item.rotate * PI / 180, c = cos(a), s = sin(a);
  const corners = [[0, -size * 0.8], [w, -size * 0.8], [w, size * 0.1], [0, size * 0.1]].map(([x, y]) => [ax + x * c - y * s, ay + x * s + y * c]);
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  const box = [min(...xs), min(...ys), max(...xs), max(...ys)];
  return { svg, lines: [{ text, x: ax, y: ay, w, box }], box };
}

function layoutBubble(item, f, text, cx, cy, frame) {
  const kind = item.kind, size = SIZES[kind], lh = round(size * 1.23);
  // Wrap to a width that gives a balloon a little wider than tall.
  const natural = measure(text.replace(/\n/g, ' '), f, size);
  const longest = max(...text.split(/\s+/).filter(Boolean).map(w => measure(w, f, size)));
  const target = item.width || min(240, max(56, sqrt(natural * lh * 3.4)));
  const rows = wrap(text, f, size, max(target, longest));
  const bw = max(...rows.map(r => measure(r, f, size))), bh = rows.length * lh;
  // The ellipse through the corners of the text block, plus padding.
  const rx = bw / SQRT2 + 16, ry = bh / SQRT2 + 10;
  const tb = textBlock(rows, f, size, lh, cx, cy - bh / 2);

  // Tail target in page px.
  let tip = null, aim = null;
  if (item.tail) {
    if (isPoint(item.tail)) {
      const [x0, y0, w0, h0] = frame.rect;
      tip = aim = [x0 + item.tail[0] * w0, y0 + item.tail[1] * h0];
    } else {
      if (!frame.bone) throw new Error('lettering: a bone tail needs a panel');
      aim = frame.bone(item.tail.actor, item.tail.bone);
    }
  }
  const E = (t, k = 1) => [cx + cos(t) * rx * k, cy + sin(t) * ry * k];
  const th = aim ? atan2((aim[1] - cy) / ry, (aim[0] - cx) / rx) : 0;
  if (aim && !tip) {
    // Aim at the bone but stop short so the tail does not cover the face.
    const e = E(th), d = hypot(aim[0] - e[0], aim[1] - e[1]) || 1;
    const l = max(10, min(0.55 * d, 60));
    tip = [e[0] + (aim[0] - e[0]) / d * l, e[1] + (aim[1] - e[1]) / d * l];
  }
  const P = p => `${f1(p[0])} ${f1(p[1])}`;
  const seed = (...k) => rand01('bubble', item.text, ...k);
  let body, tailSvg = '', cover = '';
  const sw = kind === 'whisper' ? 1.6 : STROKE;
  const dash = kind === 'whisper' ? ' stroke-dasharray="5 4"' : '';
  if (kind === 'thought') {
    // Cloud: outward arcs between points just outside the ellipse.
    const per = PI * (3 * (rx + ry) - sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const n = max(8, round(per / 30));
    const pts = [];
    for (let k = 0; k < n; k++) pts.push(E(th + (k + 0.5 + 0.5 * (seed('t', k) - 0.5)) / n * 2 * PI, 1.08));
    let d = `M${P(pts[0])}`;
    for (let k = 1; k <= n; k++) {
      const a = pts[k - 1], b = pts[k % n], r = hypot(b[0] - a[0], b[1] - a[1]) * 0.6;
      d += `A${f1(r)} ${f1(r)} 0 0 1 ${P(b)}`;
    }
    body = `<path d="${d}z" fill="#fff" stroke="#000" stroke-width="${STROKE}"/>`;
    if (tip) {
      // Trailing circles from just outside the cloud to the tip, shrinking.
      const e = E(th, 1.22);
      tailSvg = [[0.12, 6.5], [0.55, 4.6], [1, 3]].map(([u, r]) => {
        const x = e[0] + (tip[0] - e[0]) * u, y = e[1] + (tip[1] - e[1]) * u;
        return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="#fff" stroke="#000" stroke-width="${f1(STROKE * 0.8)}"/>`;
      }).join('');
    }
  } else {
    if (kind === 'shout') {
      const per = PI * (3 * (rx + ry) - sqrt((3 * rx + ry) * (rx + 3 * ry)));
      const n = max(10, round(per / 24));
      const pts = [];
      for (let k = 0; k < 2 * n; k++) {
        const t = (k + 0.3 * (seed('s', k) - 0.5)) / (2 * n) * 2 * PI;
        const out = k % 2 === 0, j = seed('r', k);
        const kx = out ? 1 + (14 + 10 * j) / rx : 1.06, ky = out ? 1 + (12 + 8 * j) / ry : 1.06;
        pts.push([cx + cos(t) * rx * kx, cy + sin(t) * ry * ky]);
      }
      body = `<path d="M${pts.map(P).join('L')}z" fill="#fff" stroke="#000" stroke-width="${STROKE}" stroke-linejoin="miter" stroke-miterlimit="8"/>`;
    } else {
      body = `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="#fff" stroke="#000" stroke-width="${f1(sw)}"${dash}/>`;
    }
    if (tip) {
      // Wedge drawn under the body, then its fill again over the body's outline at the mouth.
      const w = min(0.3, 15 / min(rx, ry));
      const p1 = E(th - w), p2 = E(th + w);
      const d = `M${P(p1)}L${P(tip)}L${P(p2)}`;
      const a = atan2(tip[1] - cy, tip[0] - cx);
      tailSvg = `<path d="${d}" fill="#fff" stroke="#000" stroke-width="${f1(sw)}" stroke-linejoin="round"${dash}/>`;
      cover = `<path d="${d}" fill="#fff" stroke="none" transform="translate(${f1(-cos(a) * 3)} ${f1(-sin(a) * 3)})"/>`;
    }
  }
  const svg = tailSvg + body + cover + `<g ${textAttrs(f, size)} text-anchor="middle" fill="#000">${tb.svg}</g>`;
  const pad = kind === 'shout' ? 26 : kind === 'thought' ? 12 : 2;
  const box = [cx - rx - pad, cy - ry - pad, cx + rx + pad, cy + ry + pad];
  const bodyBox = [...box];
  if (tip) { box[0] = min(box[0], tip[0]); box[1] = min(box[1], tip[1]); box[2] = max(box[2], tip[0]); box[3] = max(box[3], tip[1]); }
  return { svg, lines: tb.lines, box, bodyBox, ellipse: { cx, cy, rx, ry }, tip };
}
