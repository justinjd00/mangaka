import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32, rng, rngFor, rand01 } from '../kit/rng.mjs';

test('hash32 is stable and order sensitive', () => {
  assert.equal(hash32('a', 1), hash32('a', 1));
  assert.equal(hash32('a', 1), hash32('a|1'));
  assert.notEqual(hash32('a', 'b'), hash32('b', 'a'));
  assert.equal(hash32(), 0x811c9dc5);
  assert.equal(hash32('a'), 0xe40c292c); // FNV-1a 32 reference value
});

test('rng repeats for equal seeds and stays in [0,1)', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
});

test('rngFor and rand01 derive from the key hash', () => {
  assert.equal(rngFor('p', 3)(), rng(hash32('p', 3))());
  assert.equal(rand01('p', 3), hash32('p', 3) / 4294967296);
  assert.ok(rand01('x') >= 0 && rand01('x') < 1);
});
