// A page from a declarative spec: render, ink and frame every panel, letter
// the page, and write page.svg, page.html, page.map.json and page.stats.json.
import { writeFileSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { renderPanel } from './shade.mjs';
import { inkPanel } from './ink.mjs';
import { resolveStyle } from './styles.mjs';
import { flat, scaled } from './backgrounds.mjs';
import { loadVRM, poseVRM } from './vrm.mjs';
import { POSES, withHands } from './poses.mjs';
import { makeCam, project } from './raster.mjs';
import { layoutLettering, checkLettering, fontCss, fontsOf } from './lettering.mjs';

const { round, ceil, min } = Math;
const f1 = v => String(round(v * 10) / 10);
const f2 = v => String(round(v * 100) / 100);
const r1 = v => round(v * 10) / 10;
const r4 = v => round(v * 10000) / 10000;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(isNum);

const PANEL_DEFAULTS = { ss: 1, scene: null, actors: [], background: null, light: {}, style: null, regions: [], effects: [], frame: 4.5, inset: false };

/**
 * Validate a page spec. Panels may also carry `shade: { fill, aoRadius,
 * skinDetail, shineAt }` (passed to renderPanel) and actors `hands: { left, right }`
 * (through withHands). Insets default to a 7 px white gutter. Returns a normalised copy with defaults filled in;
 * scenes, models and functions are kept by reference. Errors name the panel
 * id (or index) and the field.
 */
export function definePage(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('page: spec must be an object');
  if (!isVec(spec.size, 2) || !(spec.size[0] > 0 && spec.size[1] > 0)) throw new Error('page: size must be [w, h]');
  const reading = spec.reading ?? 'rtl';
  if (reading !== 'rtl' && reading !== 'ltr') throw new Error(`page: reading must be "rtl" or "ltr", not "${reading}"`);
  const style = spec.style ?? 'seinen-dense';
  resolveStyle(style);
  if (!Array.isArray(spec.panels) || !spec.panels.length) throw new Error('page: panels must be a non-empty array');
  const ids = new Set();
  const panels = spec.panels.map((p, i) => {
    const name = p && typeof p.id === 'string' && p.id ? `panel "${p.id}"` : `panel ${i}`;
    const fail = msg => { throw new Error(`${name}: ${msg}`); };
    if (!p || typeof p !== 'object') fail('must be an object');
    if (typeof p.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(p.id)) fail('id must be a string of letters, digits, "-" or "_", starting with a letter');
    if (ids.has(p.id)) fail('duplicate id');
    ids.add(p.id);
    if (p.rect === undefined) fail('missing rect');
    if (!isVec(p.rect, 4) || !(p.rect[2] > 0 && p.rect[3] > 0)) fail('rect must be [x, y, w, h] with positive w and h');
    const q = { ...PANEL_DEFAULTS, ...p };
    q.gutter = p.gutter ?? (q.inset ? 7 : 0);
    if (!(isNum(q.ss) && q.ss > 0 && q.ss <= 4)) fail('ss must be a number in (0, 4]');
    if (q.scene !== null && (!q.scene || !Array.isArray(q.scene.parts))) fail('scene must come from scene()');
    if (!Array.isArray(q.actors)) fail('actors must be an array');
    const names = new Set();
    q.actors = q.actors.map((a, ai) => {
      if (!a || typeof a.name !== 'string' || !a.name) fail(`actors[${ai}]: missing name`);
      if (names.has(a.name)) fail(`actors[${ai}]: duplicate name "${a.name}"`);
      names.add(a.name);
      if (!a.model || (typeof a.model !== 'string' && !a.model.prims)) fail(`actor "${a.name}": model must be a path or a loaded model`);
      if (typeof a.pose === 'string' && !POSES[a.pose]) fail(`actor "${a.name}": unknown pose "${a.pose}"`);
      if (a.pose !== undefined && (a.pose === null || (typeof a.pose !== 'string' && typeof a.pose !== 'object'))) fail(`actor "${a.name}": pose must be an object or a POSES name`);
      return a;
    });
    if (!q.scene && !q.actors.length && p.camera === undefined) q.camera = { scale: 1 };
    const cam = q.camera;
    if (typeof cam !== 'function') {
      if (!cam || typeof cam !== 'object') fail('missing camera');
      if (!(isNum(cam.scale) && cam.scale > 0)) fail('camera.scale must be a positive number');
      if (cam.target !== undefined && !isVec(cam.target, 3)) fail('camera.target must be [x, y, z]');
    }
    if (q.background !== null && typeof q.background !== 'function') fail('background must be a function (x, y, W, H) => tone');
    if (q.style !== null) { try { resolveStyle(q.style); } catch (e) { fail(`style: ${e.message}`); } }
    if (!Array.isArray(q.regions)) fail('regions must be an array');
    if (!Array.isArray(q.effects) || q.effects.some(e => !e || typeof e.layers !== 'function')) fail('effects must come from kit/effects.mjs');
    if (!(isNum(q.frame) && q.frame >= 0)) fail('frame must be a number >= 0');
    if (!(isNum(q.gutter) && q.gutter >= 0)) fail('gutter must be a number >= 0');
    return q;
  });
  const lettering = (spec.lettering ?? []).map((item, i) => {
    const err = checkLettering(item);
    if (err) throw new Error(`lettering[${i}]: ${err}`);
    if (item.panel != null && !ids.has(item.panel)) throw new Error(`lettering[${i}]: unknown panel "${item.panel}"`);
    if (item.tail && !Array.isArray(item.tail) && item.panel == null) throw new Error(`lettering[${i}]: a bone tail needs a panel`);
    return item;
  });
  return { ...spec, size: [...spec.size], reading, style, title: spec.title ?? 'mangaka page', panels, lettering };
}

/** One panel's camera spec in panel pixels (cx, cy filled in). */
const cameraOf = (p, bones) => {
  const c = typeof p.camera === 'function' ? p.camera({ bones }) : p.camera;
  if (!c || !(isNum(c.scale) && c.scale > 0)) throw new Error(`panel "${p.id}": camera function must return { scale, ... }`);
  const [, , w, h] = p.rect;
  return { yaw: c.yaw ?? 0, pitch: c.pitch ?? 0, scale: c.scale, cx: c.cx ?? w / 2, cy: c.cy ?? h / 2, target: c.target ?? [0, 0, 0] };
};

/** Run-length encode the part-id buffer at half the panel's page resolution: [id, run, id, run, ...]. */
function encodeMap(buf, W, H, w, h, ss) {
  const mw = ceil(w / 2), mh = ceil(h / 2), out = [];
  let cur = -1, run = 0;
  for (let y = 0; y < mh; y++) {
    const by = min(H - 1, Math.floor((2 * y + 1) * ss));
    for (let x = 0; x < mw; x++) {
      const v = buf[by * W + min(W - 1, Math.floor((2 * x + 1) * ss))];
      if (v === cur) run++;
      else { if (run) out.push(cur, run); cur = v; run = 1; }
    }
  }
  out.push(cur, run);
  return out;
}

/** The SVG group of one inked panel. */
function panelSvg(p, k, effects) {
  const { id, ss } = p, [x, y, w, h] = p.rect;
  const sw = v => f2(v * ss);
  const path = (d, attrs) => (d.length ? `<path d="${d.join('')}" ${attrs}/>` : '');
  const dot = (name, r) => `<pattern id="${id}-${name}" width="${f2(4.4 * ss)}" height="${f2(4.4 * ss)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="${f2(2.2 * ss)}" cy="${f2(2.2 * ss)}" r="${f2(r * ss)}" fill="#000"/></pattern>`;
  const dec = k.decals;
  const circles = cs => cs.map(c => `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(c[2])}"/>`).join('');
  const rivetArcs = dec.rivets.map(c => `M${f1(c[0] + c[2] * 0.7)} ${f1(c[1] - c[2] * 0.7)}A${f1(c[2])} ${f1(c[2])} 0 0 1 ${f1(c[0] - c[2] * 0.7)} ${f1(c[1] + c[2] * 0.7)}`);
  const ink = [
    path(k.tone1, `fill="url(#${id}-t1)" stroke="none"`),
    path(k.tone2, `fill="url(#${id}-t2)" stroke="none"`),
    path(k.blacks, `fill="#000" stroke-width="${sw(0.35)}"`),
    path(k.hatch[0], `stroke-width="${sw(0.36)}"`),
    path(k.hatch[1], `stroke-width="${sw(0.6)}"`),
    path(k.hatch[2], `stroke-width="${sw(0.86)}"`),
    path(k.mail, `stroke-width="${sw(0.55)}"`),
    path(k.dots, 'fill="#000" stroke="none"'),
    path(k.brush, 'fill="#000" stroke="none"'),
    path(dec.ko, `stroke="#fff" stroke-width="${sw(4.2)}"`),
    path([...dec.lines[0], ...dec.lines[1]], `stroke-width="${sw(0.7)}"`),
    path(dec.lines[2], `stroke-width="${sw(1.5)}"`),
    path(dec.strandsWhite, `stroke="#fff" stroke-width="${sw(0.75)}"`),
    path(dec.strandsBlack, `stroke-width="${sw(0.5)}"`),
    dec.shapes.map(s => `<path d="${s.d}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${sw(s.sw)}"/>`).join(''),
    dec.rivets.length ? `<g fill="#fff" stroke-width="${sw(0.6)}">${circles(dec.rivets)}</g>${path(rivetArcs, `stroke-width="${sw(1)}"`)}` : '',
    dec.holes.length ? `<g fill="#000" stroke="none">${circles(dec.holes)}</g>` : '',
  ].join('');
  const fx = effects.map(l => (l.d ? `<path d="${l.d}" fill="${l.fill}" stroke="${l.stroke}"${l.stroke !== 'none' ? ` stroke-width="${f2(l.width)}"` : ''}${l.opacity !== 1 ? ` opacity="${l.opacity}"` : ''}/>` : '')).join('');
  const g = p.gutter;
  return `<g id="${id}" transform="translate(${f1(x)} ${f1(y)})">` +
    (g ? `<rect x="${f1(-g)}" y="${f1(-g)}" width="${f1(w + 2 * g)}" height="${f1(h + 2 * g)}" fill="#fff"/>` : '') +
    `<defs><clipPath id="${id}-clip"><rect width="${f1(w)}" height="${f1(h)}"/></clipPath>${dot('t1', 0.72)}${dot('t2', 1.3)}</defs>` +
    `<rect width="${f1(w)}" height="${f1(h)}" fill="#fff"/>` +
    `<g clip-path="url(#${id}-clip)">` +
    `<g transform="scale(${round(1e6 / ss) / 1e6})" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${ink}</g>` +
    (fx ? `<g stroke-linecap="round">${fx}</g>` : '') +
    `</g>` +
    (p.frame ? `<rect width="${f1(w)}" height="${f1(h)}" fill="none" stroke="#000" stroke-width="${f2(p.frame)}"/>` : '') +
    `</g>`;
}

const strokeCounts = (k, effects) => ({
  tone1: k.tone1.length, tone2: k.tone2.length, blacks: k.blacks.length,
  hatchThin: k.hatch[0].length, hatchMid: k.hatch[1].length, hatchCore: k.hatch[2].length,
  mail: k.mail.length, dots: k.dots.length, brush: k.brush.length,
  knockouts: k.decals.ko.length, lines: k.decals.lines.reduce((a, l) => a + l.length, 0), shapes: k.decals.shapes.length,
  strandsWhite: k.decals.strandsWhite.length, strandsBlack: k.decals.strandsBlack.length,
  rivets: k.decals.rivets.length, holes: k.decals.holes.length,
  effects: effects.reduce((a, l) => a + (l.d.match(/M/g) || []).length, 0),
});

/**
 * Build a page. Returns { svg, html, map, stats }; when `dir` is given, model
 * paths resolve against it and the four files are written there.
 * onPanel({ id, ms }) is called after each panel (timing never reaches the files).
 * cacheDir is accepted for the panel cache of a later version and ignored.
 */
export function buildPage(spec, { dir = null, cacheDir = null, onPanel = null } = {}) {
  void cacheDir;
  const page = definePage(spec);
  const [PW, PH] = page.size;
  const models = new Map();
  const modelOf = m => {
    if (typeof m !== 'string') return m;
    const path = resolvePath(dir ?? '.', m);
    if (!models.has(path)) models.set(path, loadVRM(path));
    return models.get(path);
  };

  const built = page.panels.map(p => {
    const t0 = performance.now();
    const [, , w, h] = p.rect, ss = p.ss;
    const actors = [], bones = {};
    for (const a of p.actors) {
      const model = modelOf(a.model);
      let pose = typeof a.pose === 'string' ? POSES[a.pose] : (a.pose ?? {});
      if (a.hands) pose = withHands(pose, a.hands);
      const { posed, bonePos } = poseVRM(model, { pose, expr: a.expr ?? {}, root: a.root ?? null });
      bones[a.name] = bonePos;
      actors.push({ name: a.name, model, posed, hair: a.hair });
    }
    const camera = cameraOf(p, bones);
    const W = round(w * ss), H = round(h * ss);
    const camSpec = { ...camera, scale: camera.scale * ss, cx: camera.cx * ss, cy: camera.cy * ss, W, H };
    const style = resolveStyle(p.style ?? page.style);
    const r = renderPanel({ ...(p.shade || {}), scene: p.scene, actors, cam: camSpec, background: scaled(p.background ?? flat(0), ss), light: p.light });
    const k = inkPanel(r, { style, seed: p.id, regions: p.regions, ss });
    const effects = p.effects.flatMap(e => e.layers(w, h, { seed: p.id }));
    const svg = panelSvg(p, k, effects);

    let black = 0, tone = 0;
    for (let i = 0; i < r.D.length; i++) { const v = r.D[i]; if (v >= style.black) black++; else if (v >= style.tone1) tone++; }
    const N = r.D.length;
    const stats = { id: p.id, style: style.name ?? null, balance: style.balance ?? null, black: r4(black / N), tone: r4(tone / N), white: r4((N - black - tone) / N), strokes: strokeCounts(k, effects) };
    const map = { id: p.id, rect: [...p.rect], ss, camera, parts: r.parts.map(q => q.name), rle: encodeMap(r.buf.id, W, H, w, h, ss) };
    const viewCam = makeCam({ ...camera, W: w, H: h });
    const bone = (actor, b) => {
      const pos = bones[actor]?.[b];
      if (!pos) throw new Error(`panel "${p.id}": no bone "${b}" on actor "${actor}"`);
      const q = project(viewCam, pos);
      return [p.rect[0] + q[0], p.rect[1] + q[1]];
    };
    if (onPanel) onPanel({ id: p.id, ms: performance.now() - t0 });
    return { p, svg, stats, map, bone };
  });

  const byId = new Map(built.map(b => [b.p.id, b]));
  const lettering = [];
  const letters = page.lettering.map((item, i) => {
    const b = item.panel != null ? byId.get(item.panel) : null;
    const frame = b ? { rect: b.p.rect, bone: b.bone } : { rect: [0, 0, PW, PH] };
    const out = layoutLettering(item, frame);
    const [bx0, by0, bx1, by1] = out.bodyBox ?? out.box;
    lettering.push({ index: i, type: item.type, kind: item.type === 'bubble' ? item.kind : null, panel: item.panel ?? null, box: [r1(bx0), r1(by0), r1(bx1 - bx0), r1(by1 - by0)] });
    return `<g id="${item.panel ?? 'page'}-l${i}">${out.svg}</g>`;
  });
  const fonts = [...new Set(page.lettering.flatMap(fontsOf))].sort();
  const order = [...built.filter(b => !b.p.inset), ...built.filter(b => b.p.inset)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}">` +
    (fonts.length ? `<style>${fontCss(fonts)}</style>` : '') +
    `<rect width="${PW}" height="${PH}" fill="#fff"/>` +
    order.map(b => b.svg).join('') +
    (letters.length ? `<g class="mk-l">${letters.join('')}</g>` : '') +
    `</svg>`;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(page.title)}</title>` +
    `<style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>\n`;
  const map = { size: [PW, PH], reading: page.reading, panels: built.map(b => b.map), lettering };
  const stats = { svgBytes: Buffer.byteLength(svg), panels: built.map(b => b.stats) };

  if (dir) {
    writeFileSync(join(dir, 'page.svg'), svg);
    writeFileSync(join(dir, 'page.html'), html);
    writeFileSync(join(dir, 'page.map.json'), JSON.stringify(map) + '\n');
    writeFileSync(join(dir, 'page.stats.json'), JSON.stringify(stats, null, 2) + '\n');
  }
  return { svg, html, map, stats };
}

/** Decode a map rle back to a flat id array (row-major, ceil(w/2) x ceil(h/2)). */
export function decodeMap(rle) {
  let n = 0;
  for (let i = 1; i < rle.length; i += 2) n += rle[i];
  const out = new Int16Array(n);
  for (let i = 0, o = 0; i < rle.length; i += 2) { out.fill(rle[i], o, o + rle[i + 1]); o += rle[i + 1]; }
  return out;
}
