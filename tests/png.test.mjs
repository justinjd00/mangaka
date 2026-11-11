import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { decodePNG, encodeGray, encodeRGBA } from '../kit/png.mjs';

test('gray gradient round-trips', () => {
  const w = 16, h = 4, data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = (i % w) / (w - 1);
  const img = decodePNG(encodeGray(w, h, data));
  assert.equal(img.w, w); assert.equal(img.h, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(data[i] * 255);
    assert.deepEqual([...img.px.subarray(i * 4, i * 4 + 4)], [v, v, v, 255]);
  }
});

test('RGBA round-trips', () => {
  const w = 5, h = 3, px = new Uint8Array(w * h * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37) & 255;
  const img = decodePNG(encodeRGBA(w, h, px));
  assert.deepEqual([...img.px], [...px]);
});

const crcOf = (() => {
  const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return b => { let c = 0xffffffff; for (const v of b) c = t[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function build(w, h, depth, ct, raw, extra = [], interlace = 0) {
  const chunk = (type, d) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(type), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crcOf(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = ct; ihdr[12] = interlace;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...extra.map(([t, d]) => chunk(t, d)),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('decodes other colour types and 16-bit', () => {
  // 2x1 RGB
  let img = decodePNG(build(2, 1, 8, 2, Buffer.from([0, 1, 2, 3, 4, 5, 6])));
  assert.deepEqual([...img.px], [1, 2, 3, 255, 4, 5, 6, 255]);
  // 2x1 gray+alpha
  img = decodePNG(build(2, 1, 8, 4, Buffer.from([0, 10, 20, 30, 40])));
  assert.deepEqual([...img.px], [10, 10, 10, 20, 30, 30, 30, 40]);
  // 1x1 palette with tRNS
  img = decodePNG(build(1, 1, 8, 3, Buffer.from([0, 1]), [['PLTE', Buffer.from([0, 0, 0, 9, 8, 7])], ['tRNS', Buffer.from([255, 128])]]));
  assert.deepEqual([...img.px], [9, 8, 7, 128]);
  // 1x1 RGBA 16-bit keeps high bytes
  img = decodePNG(build(1, 1, 16, 6, Buffer.from([0, 1, 9, 2, 9, 3, 9, 4, 9])));
  assert.deepEqual([...img.px], [1, 2, 3, 4]);
  // 1x1 gray 16-bit
  img = decodePNG(build(1, 1, 16, 0, Buffer.from([0, 200, 1])));
  assert.deepEqual([...img.px], [200, 200, 200, 255]);
});

test('Sub, Up, Average and Paeth filters decode', () => {
  const img = decodePNG(build(2, 4, 8, 0, Buffer.from([1, 10, 5, 2, 1, 1, 3, 2, 2, 4, 0, 4])));
  const g = [...img.px].filter((_, i) => i % 4 === 0);
  assert.deepEqual(g, [10, 15, 11, 16, 7, 13, 7, 17]);
});

test('interlaced PNG is rejected', () => {
  assert.throws(() => decodePNG(build(1, 1, 8, 0, Buffer.from([0, 0]), [], 1)), /interlaced PNG not supported/);
});

test('decodes 1, 2 and 4 bit grey and palette images, packed from the high bit', () => {
  // 1-bit grey, 10 px: two bytes per row, the last six bits are padding.
  let img = decodePNG(build(10, 1, 1, 0, Buffer.from([0, 0b10110000, 0b01000000])));
  assert.deepEqual([...img.px].filter((_, i) => i % 4 === 0), [255, 0, 255, 255, 0, 0, 0, 0, 0, 255]);
  // 2-bit grey: 0, 1, 2, 3 -> 0, 85, 170, 255.
  img = decodePNG(build(4, 1, 2, 0, Buffer.from([0, 0b00011011])));
  assert.deepEqual([...img.px].filter((_, i) => i % 4 === 0), [0, 85, 170, 255]);
  // 4-bit palette, 3 x 2, Sub filter on the second row (bpp is one byte below 8 bits):
  // row 1 bytes 0x21, 0xff + 0x21 = 0x20 give indices 2, 1, 2.
  const plte = Buffer.from([0, 0, 0, 10, 20, 30, 200, 100, 50]);
  img = decodePNG(build(3, 2, 4, 3, Buffer.from([0, 0x12, 0x00, 1, 0x21, 0xff]), [['PLTE', plte], ['tRNS', Buffer.from([0])]]));
  const rgba = i => [...img.px.subarray(i * 4, i * 4 + 4)];
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(rgba), [[10, 20, 30, 255], [200, 100, 50, 255], [0, 0, 0, 0], [200, 100, 50, 255], [10, 20, 30, 255], [200, 100, 50, 255]]);
  // 2-bit palette.
  img = decodePNG(build(2, 1, 2, 3, Buffer.from([0, 0b10010000]), [['PLTE', plte]]));
  assert.deepEqual([...img.px], [200, 100, 50, 255, 10, 20, 30, 255]);
});

test('rejects a bad signature, unknown filters and impossible depths', () => {
  const good = build(1, 1, 8, 0, Buffer.from([0, 7]));
  const bad = Buffer.from(good); bad[1] = 0x51;
  assert.throws(() => decodePNG(bad), /not a PNG file/);
  assert.throws(() => decodePNG(build(1, 1, 8, 0, Buffer.from([5, 7]))), /unknown filter type 5/);
  assert.throws(() => decodePNG(build(1, 1, 4, 2, Buffer.from([0, 7, 7]))), /PNG bit depth 4 not supported for colour type 2/);
});
