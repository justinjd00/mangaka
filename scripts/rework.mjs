#!/usr/bin/env node
// Rebuild a page after a region edit: node scripts/rework.mjs <page.mjs> [--panel id]
// Saves the current page.svg as page.prev.svg (for scripts/diff.mjs), rebuilds
// with the panel cache and prints whether each panel was rebuilt or cached.
// With --panel, exits 1 when any other panel had to be rebuilt: the edit
// reached further than that panel. A panel the cache has no entry for yet
// (a cold cache) is built and reported as "built (no cache yet)"; it does not
// count. Panels that can never be cached are rebuilt every time; they do not
// count either, but each gets a warning. Exit 2 on bad arguments.
import { copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPage } from '../kit/page.mjs';
import { isMain, pageLabel } from './main.mjs';

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--panel');
  const panel = pi >= 0 ? args[pi + 1] : null;
  const rest = pi < 0 ? args : args.filter((_, i) => i !== pi && i !== pi + 1);
  if (rest.length !== 1 || rest[0].startsWith('--') || (pi >= 0 && (!panel || panel.startsWith('--')))) {
    console.error('usage: node scripts/rework.mjs <page.mjs> [--panel id]');
    process.exit(2);
  }
  const path = resolve(rest[0]), dir = dirname(path);
  const spec = (await import(pathToFileURL(path).href)).default;
  if (!spec) { console.error(`${rest[0]}: no default export`); process.exit(2); }
  if (panel && !spec.panels?.some(p => p.id === panel)) { console.error(`${rest[0]}: no panel "${panel}"`); process.exit(2); }

  const svg = join(dir, 'page.svg');
  if (existsSync(svg)) {
    copyFileSync(svg, join(dir, 'page.prev.svg'));
    console.log(`saved ${join(dir, 'page.prev.svg')}`);
  } else console.log(`no ${svg} yet, nothing saved as page.prev.svg`);

  const rebuilt = [], cachedIds = [], uncached = [], cold = [];
  const { stats } = buildPage(spec, {
    dir, cacheDir: join(dir, '.mangaka', 'cache'), pageFile: pageLabel(path),
    onPanel: ({ id, cached, cold: isCold, uncacheable }) => {
      console.log(`panel ${id.padEnd(12)} ${cached ? 'cached' : isCold ? 'built (no cache yet)' : 'rebuilt'}${uncacheable ? ` (never cached: ${uncacheable})` : ''}`);
      // A panel that can never be cached is rebuilt every time, and one with no cache entry yet
      // had nothing to compare against; neither says anything about the edit.
      if (cached) cachedIds.push(id);
      else if (uncacheable) uncached.push({ id, uncacheable });
      else if (isCold) cold.push(id);
      else rebuilt.push(id);
    },
  });
  console.log(`wrote ${svg} (${stats.svgBytes} bytes)`);
  if (panel) {
    // These panels are rebuilt on every run, so the locality claim does not cover them.
    for (const u of uncached) if (u.id !== panel) console.warn(`warning: panel ${u.id} is not cacheable and was rebuilt (${u.uncacheable})`);
    if (cold.some(id => id !== panel)) console.log(`no cache entry yet for ${cold.filter(id => id !== panel).join(', ')}: not checked for locality this run`);
    const others = rebuilt.filter(id => id !== panel);
    if (others.length) {
      console.error(`rebuilt more than panel "${panel}": ${others.join(', ')} also changed`);
      process.exit(1);
    }
    if (cachedIds.includes(panel)) console.log(`panel ${panel} was cached: nothing in it changed`);
  }
}
if (isMain(import.meta.url)) await main();
