import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, resolveStyle } from '../kit/styles.mjs';
import { MATERIALS } from '../kit/materials.mjs';

const FORMS = ['metal', 'metalD', 'cloth', 'hair', 'leather', 'wood', 'mail', 'stone', 'ground'];
// Hatch layers a material actually draws: toned materials skip layers 0 and 1.
const drawn = (st, m) => st.materials[m].fields.filter((f, k) => f && !(st.toneMats.includes(m) && k < 2));

test('three presets with every key and every material', () => {
  assert.deepEqual(Object.keys(STYLES).sort(), ['seinen-dense', 'shonen-clean', 'tone-soft']);
  for (const [name, st] of Object.entries(STYLES)) {
    for (const k of ['black', 'tone1', 'tone2', 'toneMats', 'materials', 'brush', 'hatchSpacing', 'depthK', 'balance']) assert.ok(st[k] !== undefined, `${name}.${k}`);
    assert.equal(st.brush.length, 3);
    assert.equal(st.hatchSpacing.length, 3);
    assert.ok(st.balance.black[0] < st.balance.black[1]);
    for (const m of [...Object.keys(MATERIALS), 'sky']) {
      const c = st.materials[m];
      assert.ok(c, `${name} lacks ${m}`);
      assert.equal(c.fields.length, 3);
      assert.equal(c.thresholds.length, 3);
      assert.equal(c.len.length, 2);
      assert.equal(typeof c.crease, 'number');
    }
  }
});

test('seinen-dense: no tone on forms, tone on actor skin, fabric and face layers, three hatch layers', () => {
  const st = STYLES['seinen-dense'];
  for (const m of FORMS) assert.ok(!st.toneMats.includes(m), m);
  for (const m of ['skin', 'fabric', 'tex']) assert.ok(st.toneMats.includes(m), m);
  assert.equal(drawn(st, 'metal').length, 3);
});

test('shonen-clean: tone on sky, cloth and actor layers; hatching only on metal, stone, ground', () => {
  const st = STYLES['shonen-clean'];
  for (const m of ['sky', 'cloth', 'skin', 'fabric', 'tex']) assert.ok(st.toneMats.includes(m), m);
  for (const m of Object.keys(st.materials)) {
    const hatched = drawn(st, m).length > 0;
    assert.equal(hatched, ['metal', 'metalD', 'stone', 'ground'].includes(m), m);
  }
});

test('tone-soft: tone everywhere, at most one hatch layer', () => {
  const st = STYLES['tone-soft'];
  for (const m of Object.keys(st.materials)) {
    assert.ok(st.toneMats.includes(m), m);
    assert.ok(drawn(st, m).length <= 1, m);
  }
});

test('resolveStyle merges overrides without touching the preset', () => {
  const before = JSON.stringify(STYLES['seinen-dense']);
  const st = resolveStyle('seinen-dense', { depthK: 0.3, materials: { metal: { len: [5, 9] } } });
  assert.equal(st.depthK, 0.3);
  assert.deepEqual(st.materials.metal.len, [5, 9]);
  assert.deepEqual(st.materials.metal.fields, STYLES['seinen-dense'].materials.metal.fields);
  assert.equal(JSON.stringify(STYLES['seinen-dense']), before);
  st.toneMats.push('metal');
  assert.ok(!STYLES['seinen-dense'].toneMats.includes('metal'));
  assert.deepEqual(resolveStyle(STYLES['tone-soft']), STYLES['tone-soft']);
});

test('resolveStyle rejects unknown names and incomplete objects', () => {
  assert.throws(() => resolveStyle('nope'), /unknown style "nope"/);
  assert.throws(() => resolveStyle({ name: 'x', black: 0.8 }), /missing "tone1"/);
});
