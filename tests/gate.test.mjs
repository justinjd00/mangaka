import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnight } from '../examples/gate/knight.mjs';

test('the knight scene has many uniquely named, hashed parts', () => {
  const sc = buildKnight();
  assert.ok(sc.parts.length >= 100, `only ${sc.parts.length} parts`);
  const names = sc.parts.map(p => p.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^(knight|gate)\./);
  for (const p of sc.parts) assert.match(p.hash, /^[0-9a-f]{8}$/, p.name);
});

test('building the knight twice gives the same hashes', () => {
  const a = buildKnight().parts.map(p => p.hash), b = buildKnight().parts.map(p => p.hash);
  assert.deepEqual(a, b);
});
