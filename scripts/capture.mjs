#!/usr/bin/env node
// Screenshots of a built page with Chrome:
//   node scripts/capture.mjs <dir> [--panel id] [--part name] [--zoom 2|4] [--grid n] [--out shots/]
// No selector: the whole page. --panel: that panel. --part: the bounding box of that part
// (in every panel that has it, or in --panel). --grid n: n x n close-ups of the page (or of --panel).
// <dir> holds page.svg and page.map.json. Exit 2 on bad arguments, 1 when Chrome fails.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeMap } from '../kit/page.mjs';
import { screenshot, findChrome } from './chrome.mjs';

const USAGE = 'usage: node scripts/capture.mjs <dir> [--panel id] [--part name] [--zoom 2|4] [--grid n] [--out shots/]';
const MARGIN = 6;

/** A wrapper page showing the crop [x, y, w, h] of the svg at natural size, for a window of w x h. */
export function cropHtml(svgUrl, size, crop) {
  const [PW, PH] = size, [x, y, w, h] = crop;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;overflow:hidden}` +
    `#c{position:relative;width:${w}px;height:${h}px;overflow:hidden}` +
    `#c img{position:absolute;left:${-x}px;top:${-y}px;width:${PW}px;height:${PH}px}</style></head>` +
    `<body><div id="c"><img src="${svgUrl}" width="${PW}" height="${PH}"></div></body></html>\n`;
}

/** Clamp a crop to the page and round it to whole pixels. */
export function clampCrop([x, y, w, h], [PW, PH]) {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(PW, Math.ceil(x + w)), y1 = Math.min(PH, Math.ceil(y + h));
  return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
}

/** Bounding box of a part in page pixels, from a panel's map entry, or null when the part is absent. */
export function partBox(panel, name) {
  const n = panel.parts.indexOf(name) + 1;
  if (!n) return null;
  const ids = decodeMap(panel.rle), mw = Math.ceil(panel.rect[2] / 2);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== n) continue;
    const cx = i % mw, cy = (i - cx) / mw;
    if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
  }
  if (x1 < 0) return null;
  return [panel.rect[0] + x0 * 2, panel.rect[1] + y0 * 2, (x1 - x0 + 1) * 2, (y1 - y0 + 1) * 2];
}

/** The crops to shoot for the given options: [{ name, crop }] in page pixels. */
export function plan(map, { panel = null, part = null, grid = null }) {
  const panels = panel ? map.panels.filter(p => p.id === panel) : map.panels;
  if (panel && !panels.length) throw new Error(`no panel "${panel}" (known: ${map.panels.map(p => p.id).join(', ')})`);
  const grow = ([x, y, w, h], m) => [x - m, y - m, w + 2 * m, h + 2 * m];
  if (part) {
    const out = [];
    for (const p of panels) { const b = partBox(p, part); if (b) out.push({ name: `part-${p.id}-${part}`, crop: grow(b, 12) }); }
    if (!out.length) throw new Error(`no part "${part}"${panel ? ` in panel "${panel}"` : ''}`);
    return out;
  }
  if (grid) {
    const [x, y, w, h] = panel ? grow(panels[0].rect, MARGIN) : [0, 0, ...map.size];
    const out = [];
    for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) out.push({ name: `${panel ? `grid-${panel}` : 'grid'}-${r + 1}-${c + 1}`, crop: [x + c * w / grid, y + r * h / grid, w / grid, h / grid] });
    return out;
  }
  if (panel) return [{ name: `panel-${panel}`, crop: grow(panels[0].rect, MARGIN) }];
  return [{ name: 'page', crop: [0, 0, ...map.size] }];
}

function main() {
  const args = process.argv.slice(2);
  const opts = { panel: null, part: null, zoom: null, grid: null, out: 'shots' };
  let dir = null;
  const known = { '--panel': 'panel', '--part': 'part', '--zoom': 'zoom', '--grid': 'grid', '--out': 'out' };
  for (let i = 0; i < args.length; i++) {
    if (known[args[i]]) { if (args[i + 1] === undefined) { console.error(USAGE); process.exit(2); } opts[known[args[i]]] = args[++i]; }
    else if (args[i].startsWith('--') || dir) { console.error(USAGE); process.exit(2); }
    else dir = args[i];
  }
  const zoom = opts.zoom === null ? null : Number(opts.zoom), grid = opts.grid === null ? null : Number(opts.grid);
  if (!dir || (zoom !== null && ![2, 4].includes(zoom)) || (grid !== null && !(Number.isInteger(grid) && grid >= 1 && grid <= 8)) || (opts.part && grid)) {
    console.error(USAGE); process.exit(2);
  }
  dir = resolve(dir);
  let map;
  try { map = JSON.parse(readFileSync(join(dir, 'page.map.json'), 'utf8')); } catch (e) { console.error(`cannot read ${join(dir, 'page.map.json')}: ${e.message}`); process.exit(2); }
  let shots;
  try { shots = plan(map, { panel: opts.panel, part: opts.part, grid }); } catch (e) { console.error(e.message); process.exit(2); }
  if (!findChrome()) { console.error('Chrome not found (set CHROME_PATH)'); process.exit(1); }
  const out = resolve(opts.out);
  mkdirSync(out, { recursive: true });
  const scale = zoom ?? (grid || opts.part ? 2 : 1);
  const svgUrl = pathToFileURL(join(dir, 'page.svg')).href;
  for (const s of shots) {
    const crop = clampCrop(s.crop, map.size);
    const html = join(out, `${s.name}.wrap.html`), png = join(out, `${s.name}.png`);
    writeFileSync(html, cropHtml(svgUrl, map.size, crop));
    try { screenshot({ url: html, out: png, width: crop[2], height: crop[3], scale }); }
    catch (e) { console.error(e.message); process.exit(1); }
    finally { rmSync(html, { force: true }); }
    console.log(`wrote ${png} (${crop[2] * scale} x ${crop[3] * scale})`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
