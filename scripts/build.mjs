#!/usr/bin/env node
// Build a page file: node scripts/build.mjs <page.mjs> [--no-cache]
// Imports the file's default export (a page spec), builds it and writes
// page.svg, page.html, page.map.json and page.stats.json next to it. Unchanged
// panels come from the panel cache in <page dir>/.mangaka/cache unless --no-cache.
import { resolve, dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPage } from '../kit/page.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const unknown = args.filter(a => a.startsWith('--') && a !== '--no-cache');
if (!file || unknown.length) {
  console.error('usage: node scripts/build.mjs <page.mjs> [--no-cache]');
  process.exit(2);
}
const path = resolve(file), dir = dirname(path);
const spec = (await import(pathToFileURL(path).href)).default;
if (!spec) { console.error(`${file}: no default export`); process.exit(1); }
const cacheDir = args.includes('--no-cache') ? null : join(dir, '.mangaka', 'cache');
const pageFile = relative(process.cwd(), path).split(sep).join('/');
const { stats } = buildPage(spec, {
  dir, cacheDir, pageFile,
  onPanel: ({ id, ms, cached, uncacheable }) => console.log(`panel ${id.padEnd(12)} ${cached ? 'cached' : `${(ms / 1000).toFixed(2)} s`}${uncacheable ? ` (not cached: ${uncacheable})` : ''}`),
});
console.log(`wrote ${join(dir, 'page.svg')} (${stats.svgBytes} bytes)`);
