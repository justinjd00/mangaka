#!/usr/bin/env node
// Build a page twice without cache and compare SHA-256 of the SVG: node scripts/fingerprint.mjs <page.mjs>
// Exit 0 when identical, 1 when they differ, 2 on bad arguments.
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';


/** Build `pageFile` twice in separate processes (no cache, nothing written) and compare. */
export function fingerprint(pageFile) {
  const code = `import { buildPage } from ${JSON.stringify(new URL('../kit/page.mjs', import.meta.url).href)};` +
    `import { createHash } from 'node:crypto';` +
    `const spec = (await import(${JSON.stringify(pathToFileURL(resolve(pageFile)).href)})).default;` +
    `process.stdout.write(createHash('sha256').update(buildPage(spec, { dir: ${JSON.stringify(dirname(resolve(pageFile)))} }).svg).digest('hex'));`;
  const run = () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(`build failed: ${(r.stderr || '').trim().split('\n').slice(-2).join(' ')}`);
    return r.stdout.trim();
  };
  const a = run(), b = run();
  return { a, b, same: a === b };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file || process.argv.length > 3 || file.startsWith('--')) { console.error('usage: node scripts/fingerprint.mjs <page.mjs>'); process.exit(2); }
  const fp = fingerprint(file);
  console.log(`${fp.a}\n${fp.b}\n${fp.same ? 'identical' : 'DIFFERENT'}`);
  process.exit(fp.same ? 0 : 1);
}
