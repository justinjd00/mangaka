import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPage } from '../kit/page.mjs';
import { findChrome } from '../scripts/chrome.mjs';
import { caption, bubble } from '../kit/lettering.mjs';
import * as S from '../kit/sdf.mjs';

const chrome = findChrome();
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const run = (script, ...args) => spawnSync(process.execPath, [new URL(`../scripts/${script}`, import.meta.url).pathname, ...args], { encoding: 'utf8' });

test('scripts print usage and exit 2 on bad arguments', () => {
  for (const s of ['capture.mjs', 'sheet.mjs', 'check.mjs', 'fingerprint.mjs']) {
    const r = run(s);
    assert.equal(r.status, 2, s);
    assert.match(r.stderr, /^usage: node scripts\//, s);
  }
  assert.equal(run('capture.mjs', '.', '--zoom', '3').status, 2);
});

test('capture and sheet write PNGs, check passes without a fingerprint', { skip: !chrome && 'Chrome not found' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-cap-')), out = join(dir, 'new', 'shots');
  try {
    const sc = S.scene();
    sc.add('ground', 'ground', S.box([0, -0.05, 0], [1.2, 0.05, 1.2]));
    sc.add('ball', 'metal', S.sphere([0, 0.4, 0], 0.35));
    buildPage({ size: [200, 160], panels: [{ id: 'a', rect: [8, 8, 184, 144], scene: sc, camera: { yaw: 0.2, pitch: 0.3, scale: 150, target: [0, 0.3, 0] } }],
      lettering: [caption({ panel: 'a', text: 'Hello.', at: [0.05, 0.05] })] }, { dir });
    const r1 = run('capture.mjs', dir, '--out', out);
    assert.equal(r1.status, 0, r1.stderr);
    const page = readFileSync(join(out, 'page.png'));
    assert.deepEqual(page.subarray(0, 8), PNG);
    assert.equal(page.readUInt32BE(16), 200);
    assert.equal(page.readUInt32BE(20), 160);
    const r2 = run('capture.mjs', dir, '--part', 'ball', '--out', out);
    assert.equal(r2.status, 0, r2.stderr);
    assert.deepEqual(readFileSync(join(out, 'part-a-ball.png')).subarray(0, 8), PNG);
    assert.ok(!existsSync(join(out, 'page.wrap.html')), 'wrapper html is removed');
    const r3 = run('sheet.mjs', dir, '--out', join(out, 'sheet.png'));
    assert.equal(r3.status, 0, r3.stderr);
    assert.deepEqual(readFileSync(join(out, 'sheet.png')).subarray(0, 8), PNG);
    const c = run('check.mjs', dir);
    assert.match(c.stdout, /fingerprint check skipped/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fingerprint compares two builds of a page file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mangaka-fp-'));
  try {
    const kit = new URL('../kit/', import.meta.url).href;
    writeFileSync(join(dir, 'page.mjs'), `import * as S from '${kit}sdf.mjs';import { definePage } from '${kit}page.mjs';` +
      `const sc = S.scene(); sc.add('ball', 'metal', S.sphere([0, 0.4, 0], 0.35));` +
      `export default definePage({ size: [80, 60], panels: [{ id: 'a', rect: [4, 4, 72, 52], scene: sc, camera: { scale: 80, target: [0, 0.4, 0] } }] });`);
    const r = run('fingerprint.mjs', join(dir, 'page.mjs'));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /identical/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
