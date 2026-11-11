#!/usr/bin/env node
// Prove a region rework stayed in its region:
//   node scripts/diff.mjs <dir> --panel id --region x,y,w,h [--margin 40] [--allow-part name ...]
// Compares <dir>/page.prev.svg (saved by rework.mjs) with <dir>/page.svg. The
// region is given as in the rework instruction: fractions of the panel rect.
// Each panel layer is compared as a set of strokes; a changed stroke is allowed
// when the bounding box of its changed vertices (those off the other version's
// strokes) lies inside the region grown by the margin (page px),
// or inside the bounding box of an --allow-part part grown by three margins (its
// shadow and occlusion reach). Prints a summary per layer and writes nothing.
// Exit 0 when every change is allowed, 1 when something changed outside, 2 on
// bad arguments or missing files.
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partBox } from './capture.mjs';

const TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;
const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };

const snap = v => Math.round(v * 100) / 100;

/**
 * The vertices of SVG path data in its own coordinates, as [x, y, r]: end and
 * control points with r = 0, arc ends with r = the arc radius (an arc stays
 * within r of its ends). Coordinates snap to 0.01 so a vertex reached through
 * different relative steps compares equal.
 */
export function pathPoints(d) {
  const t = d.match(TOKEN) || [], pts = [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = null, i = 0;
  while (i < t.length) {
    if (/[a-z]/i.test(t[i])) {
      cmd = t[i++];
      if (cmd === 'z' || cmd === 'Z') { x = sx; y = sy; continue; }
    }
    if (!cmd) { i++; continue; }
    const C = cmd.toUpperCase(), rel = cmd !== C, n = ARGS[C];
    if (!n || i + n > t.length) break;
    const v = t.slice(i, i + n).map(Number);
    i += n;
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'H') { x = snap(ox + v[0]); pts.push([x, y, 0]); continue; }
    if (C === 'V') { y = snap(oy + v[0]); pts.push([x, y, 0]); continue; }
    if (C === 'A') {
      const r = Math.max(Math.abs(v[0]), Math.abs(v[1]));
      pts.push([x, y, r]); x = snap(ox + v[5]); y = snap(oy + v[6]); pts.push([x, y, r]);
      continue;
    }
    for (let k = 0; k < n; k += 2) pts.push([snap(ox + v[k]), snap(oy + v[k + 1]), 0]);
    x = snap(ox + v[n - 2]); y = snap(oy + v[n - 1]);
    if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
  }
  return pts;
}

/** Bounding box [x0, y0, x1, y1] of [x, y, r] points. */
export function pointsBox(pts) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y, r] of pts) {
    if (x - r < b[0]) b[0] = x - r; if (y - r < b[1]) b[1] = y - r;
    if (x + r > b[2]) b[2] = x + r; if (y + r > b[3]) b[3] = y + r;
  }
  return b;
}

/** Bounding box of SVG path data in its own coordinates. */
export const pathBox = d => pointsBox(pathPoints(d));

// Line weights of panelSvg's stroke layers in buffer px per ss, by layer name.
const STROKED = { hatchThin: 0.36, hatchMid: 0.6, hatchCore: 0.86, mail: 0.55, lines: 0.7, linesHeavy: 1.5, strandsBlack: 0.5, rivetArcs: 1 };
const WHITE = { knockouts: 4.2, strandsWhite: 0.75 };
const nearest = (table, w) => Object.entries(table).reduce((a, e) => (Math.abs(e[1] - w) < Math.abs(a[1] - w) ? e : a))[0];

/** Name of an ink layer from its path attributes (dots and brush share theirs and are compared together). */
function layerName(attrs, ss) {
  const w = Number((attrs.match(/stroke-width="([-\d.]+)"/) || [])[1]) / ss;
  if (/fill="url\(#[^)]*-t1\)"/.test(attrs)) return 'tone1';
  if (/fill="url\(#[^)]*-t2\)"/.test(attrs)) return 'tone2';
  if (/^\s*fill="#000" stroke="none"\s*$/.test(attrs)) return 'dots+brush';
  if (/^\s*fill="#000" stroke-width=/.test(attrs)) return 'blacks';
  if (/^\s*stroke="#fff" stroke-width=/.test(attrs)) return nearest(WHITE, w);
  if (/^\s*stroke-width=/.test(attrs)) return nearest(STROKED, w);
  return 'shapes';
}

const circlePoints = c => {
  const n = k => Number((c.match(new RegExp(` ${k}="([-\\d.]+)"`)) || [])[1]);
  return [[n('cx'), n('cy'), n('r')]];
};

/**
 * Split a page SVG into panels and layers: { panels: Map id -> { ox, oy, k,
 * layers: Map name -> Map stroke -> points, frame }, lettering: Map id -> { index, markup } }.
 * Points are in the layer's own coordinates; page = (ox, oy) + point * k, with
 * k = 1 / ss for ink layers and 1 for effects (kept per layer as `scale`).
 * `frame` is the panel markup without its ink, to catch changes to the panel itself.
 */
export function splitSvg(svg) {
  const starts = [...svg.matchAll(/<g id="([A-Za-z][\w-]*)" transform="translate\(([-\d.]+) ([-\d.]+)\)">/g)];
  const letterAt = svg.indexOf('<g class="mk-l">');
  const end = letterAt >= 0 ? letterAt : svg.lastIndexOf('</svg>');
  const panels = new Map();
  starts.forEach((m, n) => {
    const chunk = svg.slice(m.index, n + 1 < starts.length ? starts[n + 1].index : end);
    const layers = new Map();
    const put = (name, scale, stroke, pts) => {
      if (!layers.has(name)) layers.set(name, Object.assign(new Map(), { scale }));
      layers.get(name).set(stroke, pts);
    };
    const sm = chunk.match(/<g transform="scale\(([-\d.e]+)\)"/);
    const inkAt = sm ? sm.index : chunk.length, k = sm ? Number(sm[1]) : 1;
    const fxAt = chunk.indexOf('<g stroke-linecap="round">', inkAt);
    const ink = chunk.slice(inkAt, fxAt >= 0 ? fxAt : chunk.length), fx = fxAt >= 0 ? chunk.slice(fxAt) : '';
    for (const p of ink.matchAll(/<path d="([^"]*)"([^>]*)\/>/g)) {
      const name = layerName(p[2], 1 / k);
      for (const s of p[1].split(/(?=M)/)) if (s) put(name, k, s, pathPoints(s));
    }
    for (const g of ink.matchAll(/<g fill="(#fff|#000)"[^>]*>((?:<circle[^>]*\/>)*)<\/g>/g)) {
      const name = g[1] === '#fff' ? 'rivets' : 'holes';
      for (const c of g[2].match(/<circle[^>]*\/>/g) || []) put(name, k, c, circlePoints(c));
    }
    for (const p of fx.matchAll(/<path d="([^"]*)"([^>]*)\/>/g)) {
      const attr = k => (p[2].match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
      const name = attr('stroke') && attr('stroke') !== 'none' ? `effects ${attr('stroke')}` : `effects fill ${attr('fill')}`;
      for (const s of p[1].split(/(?=M)/)) if (s) put(name, 1, s, pathPoints(s));
    }
    const frame = chunk.replace(/<path[^>]*\/>/g, '').replace(/<circle[^>]*\/>/g, '');
    panels.set(m[1], { ox: Number(m[2]), oy: Number(m[3]), layers, frame });
  });
  const lettering = new Map();
  if (letterAt >= 0) {
    const part = svg.slice(letterAt);
    const items = [...part.matchAll(/<g id="([\w-]+-l(\d+))">/g)];
    items.forEach((m, n) => lettering.set(m[1], { index: Number(m[2]), markup: part.slice(m.index, n + 1 < items.length ? items[n + 1].index : part.lastIndexOf('</g></svg>')) }));
  }
  return { panels, lettering };
}

const grow = (r, m) => [r[0] - m, r[1] - m, r[2] + 2 * m, r[3] + 2 * m];
const within = (b, r) => b[0] >= r[0] && b[1] >= r[1] && b[2] <= r[0] + r[2] && b[3] <= r[1] + r[3];
const TOL = 1.5, CELL = 8;

/**
 * A lookup of one layer's geometry: near(q) tells whether point q (layer
 * coordinates) lies within TOL of any of the layer's segments or points, and
 * has(q) whether the layer has exactly that vertex.
 */
function geometryOf(layer) {
  const grid = new Map();
  const cell = (cx, cy) => { const k = `${cx},${cy}`; let c = grid.get(k); if (!c) grid.set(k, (c = [])); return c; };
  for (const pts of layer ? layer.values() : []) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[i + 1] ?? a;
      const seg = [a[0], a[1], b[0], b[1], Math.max(a[2], b[2])];
      const pad = TOL + seg[4];
      const x0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL);
      const y0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL), y1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) cell(cx, cy).push(seg);
    }
  }
  const dist = (q, [ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - ay) * dy) / l2)) : 0;
    return Math.hypot(q[0] - ax - t * dx, q[1] - ay - t * dy);
  };
  const keys = new Set([...(layer ? layer.values() : [])].flatMap(pts => pts.map(String)));
  return {
    near: q => (grid.get(`${Math.floor(q[0] / CELL)},${Math.floor(q[1] / CELL)}`) ?? []).some(sg => dist(q, sg) <= TOL + Math.abs(sg[4] - q[2])),
    has: q => keys.has(String(q)),
  };
}

/**
 * Where a changed stroke changed, in page px: the bounding box of its vertices
 * that lie off the other version's layer (an outline redrawn around a local
 * change keeps the rest of its course, even when its vertices are resampled);
 * failing that, of the vertices the other version does not have exactly; and
 * failing that, of the whole stroke.
 */
function changedBox(pts, other, P, scale) {
  let moved = pts.filter(q => !other.near(q));
  if (!moved.length) moved = pts.filter(q => !other.has(q));
  const b = pointsBox(moved.length ? moved : pts);
  return [P.ox + b[0] * scale, P.oy + b[1] * scale, P.ox + b[2] * scale, P.oy + b[3] * scale];
}

/**
 * Compare two page SVGs. region is [x, y, w, h] as fractions of panel `panel`'s
 * rect in `map`. Strokes of each panel layer are compared as sets; a changed
 * stroke is inside when the box of its vertices off the other version's layer
 * lies in an allowed rect.
 * Returns { allowed: [rects], panels: [{ id, layers: [{ name, inside, outside }] }],
 * lettering: [{ id, outside }], outside: total count }.
 */
export function diffPages({ prev, next, map, panel, region, margin = 40, allowParts = [] }) {
  const mp = map.panels.find(p => p.id === panel);
  if (!mp) throw new Error(`no panel "${panel}" in the map`);
  const [px, py, pw, ph] = mp.rect;
  const allowed = [grow([px + region[0] * pw, py + region[1] * ph, region[2] * pw, region[3] * ph], margin)];
  for (const name of allowParts) {
    const b = partBox(mp, name);
    if (!b) throw new Error(`no part "${name}" in panel "${panel}"`);
    allowed.push(grow(b, 3 * margin));
  }
  const A = splitSvg(prev), B = splitSvg(next);
  const ok = box => allowed.some(r => within(box, r));
  const panels = [];
  let outside = 0;
  for (const id of new Set([...A.panels.keys(), ...B.panels.keys()])) {
    const a = A.panels.get(id), b = B.panels.get(id), layers = [];
    if (!a || !b || a.frame !== b.frame) layers.push({ name: 'panel', inside: 0, outside: 1 });
    const names = new Set([...(a?.layers.keys() ?? []), ...(b?.layers.keys() ?? [])]);
    for (const name of names) {
      const la = a?.layers.get(name), lb = b?.layers.get(name);
      let inn = 0, out = 0, nearA = null, nearB = null;
      const count = (from, other, P, near) => {
        if (!from) return;
        for (const [s, pts] of from) {
          if (other?.has(s)) continue;
          if (id === panel && ok(changedBox(pts, near(), P, from.scale))) inn++; else out++;
        }
      };
      count(la, lb, a, () => (nearB ??= geometryOf(lb)));
      count(lb, la, b, () => (nearA ??= geometryOf(la)));
      layers.push({ name, inside: inn, outside: out });
    }
    for (const l of layers) outside += l.outside;
    panels.push({ id, layers });
  }
  const lettering = [];
  for (const id of new Set([...A.lettering.keys(), ...B.lettering.keys()])) {
    const a = A.lettering.get(id), b = B.lettering.get(id);
    if (a && b && a.markup === b.markup) continue;
    const box = map.lettering?.[(a ?? b).index]?.box;
    const out = !(box && id.startsWith(`${panel}-`) && ok([box[0], box[1], box[0] + box[2], box[1] + box[3]]));
    lettering.push({ id, outside: out });
    if (out) outside++;
  }
  return { allowed, panels, lettering, outside };
}

function parseRegion(s) {
  const v = String(s).replace(/[[\]\s]/g, '').split(',').map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite) || v.some(x => x < 0 || x > 1) || !(v[2] > 0 && v[3] > 0)) return null;
  return v;
}

function main() {
  const usage = 'usage: node scripts/diff.mjs <dir> --panel id --region x,y,w,h [--margin 40] [--allow-part name ...]\n' +
    '  region: fractions of the panel rect, as in the rework instruction';
  const args = process.argv.slice(2);
  const opts = { allowParts: [] }, rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--panel') opts.panel = args[++i];
    else if (a === '--region') opts.region = parseRegion(args[++i]);
    else if (a === '--margin') opts.margin = Number(args[++i]);
    else if (a === '--allow-part') opts.allowParts.push(args[++i]);
    else if (a.startsWith('--')) { console.error(`unknown option ${a}\n${usage}`); process.exit(2); }
    else rest.push(a);
  }
  if (rest.length !== 1 || !opts.panel || !opts.region || (opts.margin !== undefined && !(opts.margin >= 0)) || opts.allowParts.some(n => !n)) {
    console.error(usage);
    process.exit(2);
  }
  const dir = resolve(rest[0]);
  let prev, next, map;
  try {
    prev = readFileSync(join(dir, 'page.prev.svg'), 'utf8');
    next = readFileSync(join(dir, 'page.svg'), 'utf8');
    map = JSON.parse(readFileSync(join(dir, 'page.map.json'), 'utf8'));
  } catch (e) { console.error(`cannot read ${e.path ?? dir} (run scripts/rework.mjs first): ${e.message}`); process.exit(2); }
  let res;
  try { res = diffPages({ prev, next, map, ...opts }); } catch (e) { console.error(e.message); process.exit(2); }

  const fails = [];
  for (const p of res.panels) {
    const changed = p.layers.filter(l => l.inside || l.outside);
    if (!changed.length && p.id !== opts.panel) { console.log(`panel ${p.id}: unchanged`); continue; }
    console.log(`panel ${p.id}:${changed.length ? '' : ' unchanged'}`);
    if (!changed.length) continue;
    for (const l of p.layers) {
      const what = !l.inside && !l.outside ? 'unchanged'
        : [l.inside ? `changed inside (${l.inside})` : '', l.outside ? `changed outside (${l.outside})` : ''].filter(Boolean).join(', ');
      console.log(`  ${l.name.padEnd(14)} ${what}`);
      if (l.outside) fails.push(`${p.id}/${l.name} (${l.outside})`);
    }
  }
  for (const l of res.lettering) {
    console.log(`lettering ${l.id}: changed ${l.outside ? 'outside' : 'inside'}`);
    if (l.outside) fails.push(`lettering ${l.id}`);
  }
  const area = res.allowed.map(r => `[${r.map(v => Math.round(v)).join(', ')}]`).join(' + ');
  if (fails.length) {
    console.log(`FAIL: changes outside ${area}: ${fails.join(', ')}`);
    process.exit(1);
  }
  console.log(`ok: every change lies inside ${area} (page px)`);
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
