#!/usr/bin/env node
// A contact sheet to look at: the whole page plus a 3 x 2 grid of 3x close-ups of the six
// densest-inked panel regions (at most two per panel), each labelled with its panel id.
//   node scripts/sheet.mjs <dir> [--out shots/sheet.png]
// Exit 2 on bad arguments, 1 when Chrome fails.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { screenshot, findChrome } from './chrome.mjs';

const USAGE = 'usage: node scripts/sheet.mjs <dir> [--out shots/sheet.png]';
const REGION = [120, 100];   // page px shown per close-up, shown at 3x
const ZOOM = 3, GAP = 12, LABEL = 22;

/** Rough count of path segments per cell of a g x g grid over each panel, from page.svg. */
export function strokeGrid(svg, map, g = 3) {
  const starts = map.panels.map(p => ({ p, at: svg.indexOf(`<g id="${p.id}" transform=`) }));
  const lettering = svg.indexOf('<g class="mk-l">');
  const result = [];
  starts.forEach(({ p, at }, i) => {
    const cells = new Array(g * g).fill(0);
    result.push({ id: p.id, rect: p.rect, cells });
    if (at < 0) return;
    const later = starts.map(s => s.at).filter(a => a > at);
    const end = Math.min(...later, lettering < 0 ? Infinity : lettering, svg.length);
    const body = svg.slice(at, end);
    const fx = body.indexOf('<g stroke-linecap="round">');
    const k = Number(/<g transform="scale\(([\d.]+)\)"/.exec(body)?.[1] ?? 1);
    for (const m of body.matchAll(/<path d="([^"]*)"/g)) {
      const k2 = fx >= 0 && m.index > fx ? 1 : k;
      for (const sub of m[1].split('M')) {
        if (!sub) continue;
        const nums = sub.match(/-?\d*\.?\d+/g);
        if (!nums || nums.length < 2) continue;
        const x = Number(nums[0]) * k2, y = Number(nums[1]) * k2;
        const cx = Math.min(g - 1, Math.max(0, Math.floor(x / p.rect[2] * g)));
        const cy = Math.min(g - 1, Math.max(0, Math.floor(y / p.rect[3] * g)));
        cells[cy * g + cx] += Math.max(1, (nums.length - 2) / 2);
      }
    }
  });
  return result;
}

/**
 * The densest cells of the page: [{ panel, col, row, density, center: [x, y] }] by density
 * (segments per page px squared), at most `perPanel` per panel and never two touching cells of a panel.
 */
export function pickDenseCells({ svg, map }, { count = 6, perPanel = 2, g = 3 } = {}) {
  const all = [];
  for (const { id, rect, cells } of strokeGrid(svg, map, g)) {
    const area = (rect[2] / g) * (rect[3] / g);
    cells.forEach((n, i) => {
      if (!n) return;
      const col = i % g, row = (i - col) / g;
      all.push({ panel: id, col, row, density: n / area, center: [rect[0] + (col + 0.5) * rect[2] / g, rect[1] + (row + 0.5) * rect[3] / g] });
    });
  }
  all.sort((a, b) => b.density - a.density || (a.panel < b.panel ? -1 : a.panel > b.panel ? 1 : a.row - b.row || a.col - b.col));
  const picked = [];
  for (const c of all) {
    const mine = picked.filter(p => p.panel === c.panel);
    if (mine.length >= perPanel || mine.some(p => Math.abs(p.col - c.col) <= 1 && Math.abs(p.row - c.row) <= 1)) continue;
    picked.push(c);
    if (picked.length === count) break;
  }
  return picked;
}

/** The contact sheet page: the full page on the left, the close-ups in a 3-column grid on the right. */
export function sheetHtml(svgUrl, size, cells) {
  const [PW, PH] = size, [rw, rh] = REGION, cw = rw * ZOOM, ch = rh * ZOOM;
  const items = cells.map(c => {
    const x = Math.min(Math.max(0, c.center[0] - rw / 2), Math.max(0, PW - rw)), y = Math.min(Math.max(0, c.center[1] - rh / 2), Math.max(0, PH - rh));
    return `<figure><div class="cell"><img src="${svgUrl}" style="left:${-x * ZOOM}px;top:${-y * ZOOM}px;width:${PW * ZOOM}px;height:${PH * ZOOM}px"></div><figcaption>${c.panel}</figcaption></figure>`;
  }).join('');
  const rows = Math.max(1, Math.ceil(cells.length / 3));
  const gridW = 3 * cw + 2 * GAP, gridH = rows * (ch + LABEL) + (rows - 1) * GAP;
  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;background:#e6e6e6;font:13px/1 sans-serif}` +
    `#s{display:flex;gap:${GAP}px;padding:${GAP}px;align-items:flex-start}` +
    `#p{width:${PW}px;height:${PH}px;background:#fff;flex:none}#p img{display:block;width:${PW}px;height:${PH}px}` +
    `#g{display:grid;grid-template-columns:repeat(3,${cw}px);gap:${GAP}px;width:${gridW}px}` +
    `figure{margin:0}.cell{position:relative;width:${cw}px;height:${ch}px;overflow:hidden;background:#fff}` +
    `.cell img{position:absolute}figcaption{height:${LABEL}px;line-height:${LABEL}px;color:#222}` +
    `</style></head><body><div id="s"><div id="p"><img src="${svgUrl}"></div><div id="g">${items}</div></div></body></html>\n`;
}

/** Window size (CSS px) the sheet needs. */
export function sheetSize(size, n) {
  const [PW, PH] = size, rows = Math.max(1, Math.ceil(n / 3));
  const gridW = 3 * REGION[0] * ZOOM + 2 * GAP, gridH = rows * (REGION[1] * ZOOM + LABEL) + (rows - 1) * GAP;
  return [PW + gridW + 3 * GAP, Math.max(PH, gridH) + 2 * GAP];
}

function main() {
  const args = process.argv.slice(2);
  let dir = null, out = 'shots/sheet.png';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1] !== undefined) out = args[++i];
    else if (args[i].startsWith('--') || dir) { console.error(USAGE); process.exit(2); }
    else dir = args[i];
  }
  if (!dir) { console.error(USAGE); process.exit(2); }
  dir = resolve(dir);
  let svg, map;
  try {
    svg = readFileSync(join(dir, 'page.svg'), 'utf8');
    map = JSON.parse(readFileSync(join(dir, 'page.map.json'), 'utf8'));
  } catch (e) { console.error(`cannot read build outputs in ${dir}: ${e.message}`); process.exit(2); }
  if (!findChrome()) { console.error('Chrome not found (set CHROME_PATH)'); process.exit(1); }
  const cells = pickDenseCells({ svg, map });
  out = resolve(out);
  mkdirSync(dirname(out), { recursive: true });
  const html = out.replace(/\.png$/i, '') + '.wrap.html';
  writeFileSync(html, sheetHtml(pathToFileURL(join(dir, 'page.svg')).href, map.size, cells));
  const [w, h] = sheetSize(map.size, cells.length);
  try { screenshot({ url: html, out, width: w, height: h }); }
  catch (e) { console.error(e.message); process.exit(1); }
  finally { rmSync(html, { force: true }); }
  console.log(`wrote ${out} (${w} x ${h}); close-ups: ${cells.map(c => `${c.panel}[${c.col},${c.row}]`).join(' ')}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
