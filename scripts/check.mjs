#!/usr/bin/env node
// Automatic checks on a built page: node scripts/check.mjs <dir> [--page <page.mjs>]
// Exit 0 when clean, 1 with a list of problems, 2 on bad arguments.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './fingerprint.mjs';

const MAX_SVG = 2 * 1024 * 1024;
const GRAB = 12;

/** Bubbles of one panel must be listed in reading order (see readingBefore). */
export function readingBefore(a, b, reading) {
  const cy = l => l.box[1] + l.box[3] / 2, cx = l => l.box[0] + l.box[2] / 2;
  const tol = Math.min(a.box[3], b.box[3]) / 2;
  if (cy(a) < cy(b) - tol) return true;
  if (cy(b) < cy(a) - tol) return false;
  return reading === 'ltr' ? cx(a) <= cx(b) : cx(a) >= cx(b);
}

const inside = (box, r) => box[0] >= r[0] && box[1] >= r[1] && box[0] + box[2] <= r[0] + r[2] && box[1] + box[3] <= r[1] + r[3];
const pct = v => `${(v * 100).toFixed(1)}%`;

/** Problems found in a built page, as strings. */
export function checkPage({ stats, map, svgBytes }) {
  const problems = [];
  for (const p of stats.panels) {
    const [lo, hi] = p.balance?.black ?? [0, 1];
    if (p.black < lo || p.black > hi) problems.push(`panel ${p.id}: black share ${pct(p.black)} is outside ${p.style ?? 'the style'}'s range ${pct(lo)} to ${pct(hi)}`);
    if (p.white > 0.97) problems.push(`panel ${p.id}: ${pct(p.white)} white, the panel is nearly empty`);
    if (p.black > 0.97) problems.push(`panel ${p.id}: ${pct(p.black)} black, the panel is nearly solid`);
  }
  if ((svgBytes ?? stats.svgBytes) > MAX_SVG) problems.push(`page.svg is ${svgBytes ?? stats.svgBytes} bytes, over the 2 MB limit`);

  const [PW, PH] = map.size;
  const rects = new Map(map.panels.map(p => [p.id, p.rect]));
  const label = l => `lettering[${l.index}] (${l.type}${l.panel ? ` in ${l.panel}` : ''})`;
  for (const l of map.lettering ?? []) {
    if (!inside(l.box, [0, 0, PW, PH])) problems.push(`${label(l)} leaves the page`);
    else if (l.type !== 'sfx' && l.panel != null) {
      const r = rects.get(l.panel);
      if (r && !inside(l.box, [r[0] - GRAB, r[1] - GRAB, r[2] + 2 * GRAB, r[3] + 2 * GRAB])) problems.push(`${label(l)} leaves its panel`);
    }
  }
  const reading = map.reading ?? 'rtl';
  const bubbles = new Map();
  for (const l of map.lettering ?? []) if (l.type === 'bubble' && l.panel != null) (bubbles.get(l.panel) ?? bubbles.set(l.panel, []).get(l.panel)).push(l);
  for (const [id, list] of bubbles) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (readingBefore(list[j], list[i], reading) && !readingBefore(list[i], list[j], reading)) {
        problems.push(`panel ${id}: bubble lettering[${list[j].index}] reads before lettering[${list[i].index}] (${reading}) but is listed after it`);
      }
    }
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--page');
  const pageFile = pi >= 0 ? args[pi + 1] : null;
  const rest = pi < 0 ? args : args.filter((_, i) => i !== pi && i !== pi + 1);
  if (!rest.length || rest.length > 1 || rest[0].startsWith('--') || (pi >= 0 && !pageFile)) {
    console.error('usage: node scripts/check.mjs <dir> [--page <page.mjs>]');
    process.exit(2);
  }
  const dir = resolve(rest[0]);
  let stats, map, svgBytes;
  try {
    stats = JSON.parse(readFileSync(join(dir, 'page.stats.json'), 'utf8'));
    map = JSON.parse(readFileSync(join(dir, 'page.map.json'), 'utf8'));
    svgBytes = readFileSync(join(dir, 'page.svg')).length;
  } catch (e) { console.error(`cannot read build outputs in ${dir}: ${e.message}`); process.exit(2); }
  const problems = checkPage({ stats, map, svgBytes });
  if (pageFile) {
    const fp = fingerprint(resolve(pageFile));
    if (!fp.same) problems.push(`rebuild fingerprint differs: ${fp.a} vs ${fp.b}`);
    else console.log(`fingerprint ${fp.a.slice(0, 12)} stable over two builds`);
  } else console.log('fingerprint check skipped (pass --page <page.mjs> to run it)');
  if (problems.length) {
    console.log(`${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log(`ok: ${stats.panels.length} panels, ${(map.lettering ?? []).length} lettering items, ${svgBytes} bytes`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
